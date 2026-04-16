from functools import lru_cache
from sentence_transformers import SentenceTransformer
from shingo.config import EMBEDDING_MODEL
import numpy as np
from tqdm import tqdm


@lru_cache(maxsize=1) # load once into memory at max
def get_embedding_model(model_name=EMBEDDING_MODEL) -> SentenceTransformer:
    print(f"loading {model_name}...")
    return SentenceTransformer(model_name)


def embed_text(model: SentenceTransformer, chunks: list[str], batch_size=32) -> np.ndarray:
    """return 2d array of text embeddings"""
    if not chunks:
        raise ValueError

    embeddings = []
    for idx in tqdm(range(0, len(chunks), batch_size), desc="embedding text"):
        batch = chunks[idx:idx+batch_size]
        embeddings.append(model.encode(batch))

    return np.vstack(embeddings)


def embed_query(model: SentenceTransformer, query: str) -> np.ndarray:
    """return query embedding, 1d vector"""
    if not query:
        raise ValueError

    return model.encode(query)