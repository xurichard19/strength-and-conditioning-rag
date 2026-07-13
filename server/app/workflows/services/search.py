from chromadb import Search, K, Knn, Rrf
from langchain_core.documents import Document
from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings

from app.config import get_settings


settings = get_settings()


research_vector_store = Chroma(
    collection_name="system-docs",
    embedding_function=OpenAIEmbeddings(api_key=settings.openai_api_key),
    chroma_cloud_api_key=settings.chroma_api_key,
    tenant=settings.chroma_tenant,
    database=settings.chroma_database
)


def query_research_docs(query: str, top_k: int = 15) -> list[Document]:
    """ perform hybrid search with rrf on research paper vector store """
    hybrid_rank = Rrf(
        ranks=[
            Knn(query=query, return_rank=True, limit=75),
            Knn(query=query, key="sparse_embedding", return_rank=True, limit=75)
        ],
        weights=[2.0, 1.0],
        k=60
    )

    search = Search().rank(hybrid_rank).limit(top_k).select(K.DOCUMENT, K.SCORE)

    results = research_vector_store.search(search)
    return results
