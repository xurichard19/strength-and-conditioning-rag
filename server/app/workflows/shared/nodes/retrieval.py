from chromadb import Search, K, Knn, Rrf
from langchain_chroma import Chroma

from app.config import get_settings

settings = get_settings()

embedding_function = None

vector_store = Chroma(
    collection_name=None,
    embedding_function=embedding_function,
    chroma_cloud_api_key=settings.chroma_api_key,
    tenant=settings.chroma_tenant,
    database=settings.chroma_database
)

hybrid_rank = Rrf(
    ranks=[
        Knn(
            query=None,#fix
            return_rank=True,
            limit=50
        ),
        Knn(
            query=None,#fix
            key="sparse_embedding",

        )
    ],
    weights=[2.0, 1.0],
    k=60
)

search = Search().rank(hybrid_rank).limit(15).select(K.DOCUMENT, K.SCORE)

context = vector_store.hybrid_search(search)


def retrieval_node(state: dict) -> dict:
    """ hybrid search """
    pass
