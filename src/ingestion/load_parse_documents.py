from src.config import RAW_DATA_DIR
import os
import pymupdf
import re
from tqdm import tqdm


def load_documents(dir: str = RAW_DATA_DIR) -> list[dict]: # to be edited to add training logs?
    """load all raw documents"""
    docs = []

    for name in tqdm(os.listdir(dir), desc="loading documents"):
        path = os.path.join(dir, name)
        if not os.path.isfile(path) or name.startswith('.'): continue

        if path.lower().endswith(".pdf"):
            text = parse_pdf(path)
            text = clean_text(text)
            docs.append({
                "text": text,
                "source": name,
                "type": "pdf"
            })
        # ...

    return docs


def parse_pdf(path: str) -> str:
    """parse full pdf text"""
    text = ""

    with pymupdf.open(path) as doc:
        text += "".join([page.get_text() for page in doc])
    
        # handle bad pdf read with optical reader
        if not text or len(text.split()) < 20:
            from PIL import Image
            import pytesseract
            text = ""
            for page in doc:
                pix = page.get_pixmap(alpha=False)
                img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                text += pytesseract.image_to_string(img)
    
    return text


def clean_text(text: str) -> str:
    """remove clutter and poor formatting"""

    text = re.sub(r'(?<!\n)\n(?!\n)', ' ', text) # remove line breaks
    text = re.sub(r'_+', '', text) # remove separators
    text = re.sub(r'\s+', ' ', text) # normalize whitespace

    return text.strip()


def parse_training_log():
    # ...
    pass
