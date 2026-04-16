import fitz
import io

# more doc types supported in future
from langchain_community.document_loaders import PyMuPDFLoader, TextLoader

from langchain_core.documents import Document
import os
from PIL import Image
import pytesseract
from tqdm import tqdm


class IngestionHandler:

    def __init__(self, data_dir=None):
        if not data_dir: data_dir = os.path.join('data', 'raw')
        if not os.path.isdir(data_dir): raise Exception("invalid data directory")

        self.data_dir = data_dir


    def load_system_docs(self) -> list[Document]:
        """ load all system docs as langchain documents """
        docs = []

        for name in tqdm(os.listdir(self.data_dir), desc="loading documents"):
            path = os.path.join(self.data_dir, name)
            if not os.path.isfile(path): continue

            docs += self.load_single_doc(path)

        return docs
    
    
    def load_user_docs(self):
        # only allow txt
        # during production, workout logs will be directly embedded
        pass

    @staticmethod
    def bad_loader(path):
        return PyMuPDFLoader(path).load()

    @staticmethod
    def load_single_doc(path: str) -> list[Document]:
        """ load single file as langchain document, raise exception if not valid file type """
        
        if path.lower().endswith('.pdf'):
            loader = PyMuPDFLoader(path)

            if not IngestionHandler.is_native_pdf(path):
                return IngestionHandler.read_scanned_pdf(path, loader)

        elif path.lower().endswith('.txt'):
            loader = TextLoader(path)

        else:
            raise Exception(f"invalid document type at {path}")
        
        return loader.load()
    

    @staticmethod
    def is_native_pdf(path: str, min_chars=100, pages=5) -> bool:
        """ determine if pdf requires ocr scanning using heuristic """
        doc = fitz.open(path)
        chars = 0

        for page in doc[:pages]:
            chars += len(page.get_text().strip())

        return chars >= min_chars


    @staticmethod
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

            doc = Document(
                page_content=text,
                metadata={
                    **sample_metadata,
                    "page": n + 1
                }
            )
                
            docs.append(doc)
                
        return docs