from functools import lru_cache
from sentence_transformers import SentenceTransformer
from shingo.config import EMBEDDING_MODEL
import numpy as np
from tqdm import tqdm


@lru_cache(maxsize=1) # load once into memory at max
def get_embedding_model(model_name=EMBEDDING_MODEL) -> SentenceTransformer:
    print(f"loading {model_name}...")
    return SentenceTransformer(model_name)


def embed_text(model: SentenceTransformer, chunks: list[str]) -> np.ndarray:
    """return 2d array of text embeddings"""
    embeddings = []
    for chunk in tqdm(chunks, desc="embedding text"):
        embeddings.append(model.encode(chunk))
    return embeddings


def embed_query(model: SentenceTransformer, query: str) -> np.ndarray:
    """return query embedding, 1d vector"""
    return model.encode(query)