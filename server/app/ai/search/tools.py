from chromadb import Search, K, Knn, Rrf
import cohere
from langchain_core.documents import Document
from langchain_chroma import Chroma
from langchain_tavily import TavilySearch
from langchain_core.tools import tool

from app.config import get_settings


settings = get_settings()

# chroma client
research_vector_store = Chroma(
    collection_name=settings.system_collection_name,
    chroma_cloud_api_key=settings.chroma_api_key,
    tenant=settings.chroma_tenant,
    database=settings.chroma_database
)

# tavily search client
tavily_tool = TavilySearch(
    tavily_api_key=settings.tavily_api_key,
    search_depth='fast',
    include_images=False,
    max_results=10
)

# cohere client
cohere_client = cohere.ClientV2(api_key=settings.cohere_api_key)


# dev purposes, not for prod
def similarity_search_research_docs(query: str, top_k: int = 15) -> list[Document]:
    """
    perform similarity search on research paper vector store
    
    - **query**: query string
    - **top_k**: number of top results to return
    """

    results = research_vector_store.similarity_search(query, k=top_k)
    return results


@tool
def hybrid_search_research_docs(query: str, top_k: int = 15) -> list[Document]:
    """
    perform hybrid search with rrf (rank contribution 67% semantic, 33% keyword) on research paper vector store 
    
    - **query**: query string
    - **top_k**: number of top results to return
    """
    
    hybrid_rank = Rrf(
        ranks=[
            Knn(query=query, return_rank=True, limit=75),
            Knn(query=query, key="sparse_embedding", return_rank=True, limit=75)
        ],
        weights=[2.0, 1.0],
        k=60
    )

    search = Search().rank(hybrid_rank).limit(top_k).select(K.DOCUMENT, K.SCORE)

    results = research_vector_store.hybrid_search(search)

    for result in results:
        result.metadata['source_type'] = 'research'

    return results


@tool
def search_online(query: str) -> list[Document]:
    """
    delivers llm-compatible search results from tavily search api, returns 10 results

    - **query**: query string
    """

    results = tavily_tool.invoke({'query': query})

    documents = []
    for result in results['results']:
        documents.append(Document(
            page_content=result['content'],
            metadata={
                'title': result['title'],
                'url': result['url'],
                'score': result['score'],
                'source_type': 'web'
            }
        ))

    return documents


def rerank_results(query: str, documents: list[Document], top_n=10) -> list[Document]:
    """
    reranking for two stage retrieval
    note: do not rerank rag and online search results together
    
    - **query**: query string
    - **documents**: langchain documents
    - **top_n**: number of top results to return
    """

    docs_content = [doc.page_content for doc in documents]

    rerank_response = cohere_client.rerank(
        model="rerank-v4.0-fast",
        query=query,
        documents=docs_content,
        top_n=top_n
    )

    reranked = []
    for result in rerank_response.results:
        reranked.append(documents[result.index])
    
    return reranked
