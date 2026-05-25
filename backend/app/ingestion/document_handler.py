import fitz
import io

# more doc types supported in future
from langchain_community.document_loaders import PyMuPDFLoader, TextLoader

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
import os
from PIL import Image
import pytesseract
import re
from tqdm import tqdm

import tempfile
from pathlib import Path
from google.cloud import storage
from app.core.config import get_settings

ALLOWED_EXTENSIONS = {".pdf", ".txt"}


def _normalize_prefix(prefix: str) -> str:
    return prefix.strip("/")


def _gcs_uri(bucket: str, blob_name: str) -> str:
    return f"gs://{bucket}/{blob_name}"


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
    """ load system docs from gcs by downloading each blob to a temp file and parsing"""
    prefix = _normalize_prefix(prefix)

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

        gcs_source = _gcs_uri(bucket, blob.name)

        tmp_path = None
        try: 
            with tempfile.NamedTemporaryFile(suffix = suffix, delete=False) as tmp:
                tmp_path = tmp.name
            
            blob.download_to_filename(tmp_path)
            file_docs = load_single_doc(tmp_path)
            for doc in file_docs:
                doc.metadata['source'] = Path(blob.name).name
                doc.metadata.setdefault('page', 1)
            
            docs.extend(file_docs)
        except Exception as exc:
            print(f"[GCS] failed to load {gcs_source}: {exc}")
            continue
        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.remove(tmp_path)
    
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
        
    return loader.load()


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
    

def split_docs(docs: list[Document], size=1000, overlap=200, min_len=100):
    """ use langchain built in text splitter """
    text_splitter = RecursiveCharacterTextSplitter(
        separators=["\n\n", "\n", " ", ""],
        chunk_size=size,
        chunk_overlap=overlap,
        add_start_index=True
    )

    chunks = text_splitter.split_documents(docs)
    premerge = len(chunks)

    merged = []
    merge_next = False
    for chunk in tqdm(chunks, desc="merging documents"):
        clean_doc(chunk)
        text = chunk.page_content.strip()

        if merge_next:
            if merged[-1].metadata["source"] == chunk.metadata["source"]:
                merged[-1].page_content += " " + text
            else:
                merged.append(chunk)
            merge_next = False
            continue

        elif len(text) < min_len:
            if merged and merged[-1].metadata["source"] == chunk.metadata["source"]:
                merged[-1].page_content += " " + text
                continue
            else:
                merge_next = True
            
        merged.append(chunk)
    
    print(f"compressed {premerge} chunks into {len(merged)} chunks")
    return merged


def clean_doc(doc: Document):
    """ clean document in place """
    text = doc.page_content
    text = re.sub(r'(?<!\n)\n(?!\n)', ' ', text)
    text = re.sub(r'\s+', ' ', text)
    doc.page_content = text
