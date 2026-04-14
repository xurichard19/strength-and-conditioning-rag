from src.config import SIZE, OVERLAP, THRESHOLD
from tqdm import tqdm


def process_documents(docs: list[dict]) -> list[dict]:
    processed_docs = []
    for doc in tqdm(docs, desc="processing documents"):
        processed_docs += process_single_document(doc)
    return processed_docs


def process_single_document(doc: dict) -> list[dict]:
    return wrap_metadata(chunk_text(doc["text"]), doc)


def chunk_text(text: str, chunk_size=SIZE, overlap=OVERLAP, threshold=THRESHOLD) -> list[str]:
    """split text into chunks"""
    if not text:
        raise ValueError("empty text")

    words = text.split()

    chunks = []
    idx = 0

    while idx + chunk_size <= len(words):
        chunks.append(" ".join(words[idx:idx+chunk_size]))
        idx += chunk_size - overlap

    if not chunks:
        return [" ".join(words)]

    # merge chunk if under threshold size otherwise create new chunk
    chunk = " ".join(words[idx:])
    if len(words) - idx < threshold:
        chunks[-1] += f" {chunk}"
    else:
        chunks.append(chunk)

    return chunks
    # future: add logical splitting by semantic structure (paragraphs, headers) or scrap and use RecursiveTextSplitter from langchain


def wrap_metadata(chunks: list[str], doc: dict) -> list[dict]:
    """wrap chunks in metadata"""
    if not chunks or not doc:
        return ValueError

    chunk_list = []
    idx = 0

    for chunk in chunks:
        chunk_list.append({
            "id": f"{doc["source"]}_chunk_{idx}",
            "text": chunk,
            "metadata": {
                "source": doc["source"],
                "type": doc["type"],
                "chunk_index": idx
            }
        })
        idx += 1

    return chunk_list