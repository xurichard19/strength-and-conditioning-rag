import fitz
import io
from functools import lru_cache

from tokenizers import Tokenizer
from app.db.vector.embeddings import MAX_INPUT_TOKENS, research_model

# more doc types supported in future
from langchain_community.document_loaders import PyMuPDFLoader, TextLoader

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
import os
from PIL import Image
import pytesseract
import re
import unicodedata
from tqdm import tqdm

import tempfile
from pathlib import Path
from google.cloud import storage
from app.config import get_settings
from app.contracts import RESEARCH_METADATA_FIELDS, metadata_text

ALLOWED_EXTENSIONS = {".pdf", ".txt"}
MAX_CHUNK_TOKENS = MAX_INPUT_TOKENS - 2


@lru_cache(maxsize=1)
def _chunk_tokenizer():
    """copy the shared model's tokenizer without truncation or padding for exact chunk counts"""
    tokenizer = Tokenizer.from_str(research_model().tokenizer.backend_tokenizer.to_str())
    tokenizer.no_truncation()
    tokenizer.no_padding()
    return tokenizer


def load_system_docs(data_dir: str | None = None) -> list[Document]:
    settings = get_settings()
    if settings.doc_source.lower() == 'gcs':
        if not settings.gcs_bucket:
            raise RuntimeError("GCS_BUCKET is required when DOC_SOURCE=gcs")
        return load_system_docs_from_gcs(settings.gcs_bucket, settings.gcs_prefix_raw)
    else:
        return load_system_docs_from_local(data_dir)
    

# original local implementation, depreciated
def load_system_docs_from_local(data_dir: str | None = None) -> list[Document]:
    # load all system docs as langchain documents
    if not data_dir: data_dir = os.path.join('data', 'raw')
    if not os.path.isdir(data_dir): raise Exception("invalid data directory")

    docs = []

    for name in tqdm(os.listdir(data_dir), desc="loading documents"):
        path = os.path.join(data_dir, name)
        if not os.path.isfile(path) or name.startswith('.'): continue

        docs += load_single_doc(path)

    return docs


def load_system_docs_from_gcs(bucket: str, prefix: str) -> list[Document]:
    """ load system docs from gcs by downloading each blob to a temp file and parsing """
    prefix = prefix.strip("/")

    docs: list[Document] = []

    try:
        client = storage.Client()
        blobs = list(client.list_blobs(bucket, prefix=f'{prefix}/' if prefix else None))
    except Exception as exc:
        raise RuntimeError( 
            f'Failed to list gs://{bucket}/{prefix}/. '
            f'Check ADC, IAM (storage.objectViewer), bucket name, and prefix.'
        ) from exc

    for blob in tqdm(blobs, desc='loading documents from gcs'):
        if blob.name.endswith("/"):
            continue # for folders
        
        suffix = Path(blob.name).suffix.lower()
        if suffix not in ALLOWED_EXTENSIONS:
            continue

        gcs_source = f"gs://{bucket}/{blob.name}"

        try: 
            with tempfile.NamedTemporaryFile(suffix=suffix, delete_on_close=False) as tmp:
                blob.download_to_filename(tmp.name)
                file_docs = load_single_doc(tmp.name)
            if not any(doc.page_content.strip() for doc in file_docs):
                raise ValueError("document contains no readable text")

            metadata = {field: metadata_text((blob.metadata or {}).get(field)) or "none"
                for field in RESEARCH_METADATA_FIELDS}
            for doc in file_docs:
                # bucket fields are authoritative; retain only parser page information
                doc.metadata = {**metadata, "source": gcs_source, "page": doc.metadata.get("page", 1)}
            
            docs.extend(file_docs)
        except Exception as exc:
            raise RuntimeError(f"failed to load {gcs_source}: {exc}") from exc
    
    if not docs:
        raise Exception(
            f'no documents loaded from gs://{bucket}/{prefix}/ '
            f'(check prefix, IAM, and that objects exist)'
        )
    
    return docs

def load_single_doc(path: str) -> list[Document]:
    """ load single file as langchain document, raise exception if not valid file type """
    if path.lower().endswith('.pdf'):
        loader = PyMuPDFLoader(path)

        # check if native or scanned pdf
        with fitz.open(path) as doc:
            chars = 0
            for page in doc[:5]:
                chars += len(page.get_text().strip())
            if chars < 100:
                return read_scanned_pdf(path, loader)

    elif path.lower().endswith('.txt'):
        loader = TextLoader(path)

    #...

    else:
        raise Exception(f"invalid document type at {path}")
        
    docs = loader.load()
    if path.lower().endswith('.pdf'):
        for doc in docs:
            doc.metadata["page"] += 1
    return docs


def read_scanned_pdf(path: str, loader: PyMuPDFLoader) -> list[Document]:
    """ read scanned pdf using ocr """
    base = loader.load()
    sample_metadata = base[0].metadata if base else {}
    docs = []

    with fitz.open(path) as spdf:
        for n in range(spdf.page_count):
            page = spdf.load_page(n)
            img = page.get_pixmap(dpi=300)
            img = Image.open(io.BytesIO(img.tobytes("png")))
            text = pytesseract.image_to_string(img)
            # IMPORTANT: requires ps command when operating in venv on windows >> $env:Path += ";C:\Program Files\Tesseract-OCR"

            doc = Document(
                page_content=text,
                metadata={
                    **sample_metadata,
                    "page": n + 1
                }
            )
                    
            docs.append(doc)
                
    return docs
    

def split_docs(docs: list[Document], size=MAX_CHUNK_TOKENS, overlap=80, min_len=60):
    """split and merge by model tokens, reserving two of the 512 positions for special tokens"""
    if not 0 <= overlap < size <= MAX_CHUNK_TOKENS or not 0 <= min_len <= size:
        raise ValueError("chunk size must be 1 to 510 tokens with smaller overlap and bounded minimum")

    tokenizer = _chunk_tokenizer()

    @lru_cache(maxsize=4096)
    def token_count(text: str) -> int:
        # measure the same whitespace normalization applied before embedding
        text = re.sub(r'\s+', ' ', text)
        return len(tokenizer.encode(text, add_special_tokens=False).ids)

    text_splitter = RecursiveCharacterTextSplitter(
        separators=["\n\n", "\n", " ", ""],
        chunk_size=size,
        chunk_overlap=overlap,
        length_function=token_count,
    )

    chunks = text_splitter.split_documents(docs)
    premerge = len(chunks)

    merged = []
    previous_short = False
    previous_skipped = False

    for chunk in tqdm(chunks, desc="merging documents"):
        clean_doc(chunk)
        text = chunk.page_content.strip()
        tokens = token_count(text)
        if tokens > size:
            raise ValueError("research chunk exceeds the embedding token budget")

        # skip bibliography chunks due to limited value
        # use regex to match repeated author initials and years with dois, page ranges, or numbered entries
        citation_text = unicodedata.normalize("NFKC", text)
        authors = list(re.finditer(r"\b[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'’\-][A-Za-zÀ-ÿ'’\-]*(?:,\s*|\s+)(?:[A-Z]\.?){1,3}(?=[\s,;:(])", citation_text))
        references = re.search(r"\b(?:references|bibliography)\b", citation_text, re.I)
        if (len(authors) >= 3 and authors[0].start() <= len(citation_text) * 0.1
            and len(re.findall(r"\b(?:19|20)\d{2}[a-z]?\b", citation_text)) >= 3
            and (len(set(re.findall(r"10\.\d{4,9}/\S+", citation_text))) >= 2
                or len(re.findall(r"\b\d{1,4}\s*(?:\(\d{1,3}\))?\s*[,;:]\s*[a-z]?\d{1,6}\s*[-–−]\s*\d{1,6}\b", citation_text)) >= 2
                or len(re.findall(r"(?<![\d.])(?:\[\d{1,3}\]|\d{1,3}\.)\s+"
                    r"[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'’\-]+(?:,\s*|\s+)(?:[A-Z]\.?){1,3}(?=[\s,;:(])", citation_text)) >= 3)
            and (references is None or references.start() <= len(citation_text) * 0.05)
            and not re.search(r"\b(?:conclusions?|conflicts? of interest|publisher[’']?s note|copyright|creative commons|"
                r"author contributions|funding|acknowledg(?:e)?ments|appendi(?:x|ces)|supplementary (?:material|information)|"
                r"supporting information|ethics statement|data availability)\b", citation_text, re.I)):
            previous_skipped = True
            continue

        same_page = not previous_skipped and bool(merged) and all(merged[-1].metadata.get(field) == chunk.metadata.get(field)
            for field in ("source", "page"))
        previous_skipped = False

        if same_page and (previous_short or tokens < min_len):
            combined = merged[-1].page_content + " " + text
            combined_tokens = token_count(combined)
            if combined_tokens <= size:
                merged[-1].page_content = combined
                previous_short = combined_tokens < min_len
                continue

        merged.append(chunk)
        previous_short = tokens < min_len
    
    print(f"compressed {premerge} chunks into {len(merged)} chunks")
    return merged


def clean_doc(doc: Document):
    """ clean document in place """
    doc.page_content = re.sub(r'\s+', ' ', doc.page_content)
