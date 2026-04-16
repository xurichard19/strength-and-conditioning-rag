import fitz
import io

# more doc types supported in future
from langchain_community.document_loaders import PyMuPDFLoader, TextLoader

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
import os
from PIL import Image
import pytesseract
from tqdm import tqdm


# change from local dir to gcs on deployment
def load_system_docs(data_dir=None) -> list[Document]:
    """ load all system docs as langchain documents """
    if not data_dir: data_dir = os.path.join('data', 'raw')
    if not os.path.isdir(data_dir): raise Exception("invalid data directory")

    docs = []

    for name in tqdm(os.listdir(data_dir), desc="loading documents"):
        path = os.path.join(data_dir, name)
        if not os.path.isfile(path) or name.startswith('.'): continue

        docs += load_single_doc(path)

    return docs


def load_single_doc(path: str) -> list[Document]:
    """ load single file as langchain document, raise exception if not valid file type """
        
    if path.lower().endswith('.pdf'):
        loader = PyMuPDFLoader(path)

        # check if native or scanned pdf
        doc = fitz.open(path)
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

    spdf = fitz.open(path)
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
    

def split_docs(docs: list[Document], size=750, overlap=150):
    """ use langchain built in text splitter """
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=size,
        chunk_overlap=overlap,
        add_start_index=True
    )

    chunks = text_splitter.split_documents(docs)
    return chunks