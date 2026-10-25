from threading import Lock


MODEL_NAME = "BAAI/bge-small-en-v1.5"
MODEL_REVISION = "5c38ec7c405ec4b44b94cc5a9bb96e735b38267a"
MAX_INPUT_TOKENS = 512
QUERY_PROMPT = "Represent this sentence for searching relevant passages: "
_model = None
_model_lock = Lock()


def research_model():
    """load one shared bge model into memory per process, including concurrent first requests"""
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                from sentence_transformers import SentenceTransformer

                _model = SentenceTransformer(MODEL_NAME, revision=MODEL_REVISION, device="cpu")
    return _model


def embed_research_documents(texts: list[str]) -> list[list[float]]:
    """embed normalized passages with the cached model and unit-length vectors"""
    return research_model().encode([" ".join(text.split()) for text in texts], batch_size=32,
        normalize_embeddings=True, show_progress_bar=False).tolist()


def embed_research_queries(texts: list[str]) -> list[list[float]]:
    """apply bge's retrieval instruction to queries using the same cached model"""
    return embed_research_documents([QUERY_PROMPT + text for text in texts])
