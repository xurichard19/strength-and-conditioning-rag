from functools import lru_cache
from sentence_transformers import SentenceTransformer
from src.config import EMBEDDING_MODEL


@lru_cache(maxsize=1) # only load once
def get_embedding_model(model_name=EMBEDDING_MODEL) -> SentenceTransformer:
    print(f"loading {model_name}...")
    return SentenceTransformer(model_name)

def embed_text(model: SentenceTransformer, text: str):
    embeddings = model.encode()

def embed_query():
    # use model to embed query
    pass