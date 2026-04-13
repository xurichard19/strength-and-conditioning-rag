from src.config import SIZE, OVERLAP


def process_documents(docs: list[dict]) -> list[dict]:
    pass


def process_single_document(doc: dict) -> list[dict]:
    pass


def chunk_text(text: str, chunk_size: int = SIZE, overlap: int = OVERLAP) -> list[str]:
    pass


def wrap_metadata(chunks: list[str], doc: dict) -> list[dict]:
    pass