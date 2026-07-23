from chromadb import Search, K, Knn, Rrf
import cohere
from langchain_core.documents import Document
from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings
from langchain_tavily import TavilySearch
from langchain.tools import tool

from app.config import get_settings


settings = get_settings()

# chroma client
research_vector_store = Chroma(
    collection_name="system-docs",
    embedding_function=OpenAIEmbeddings(api_key=settings.openai_api_key),
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


@tool
def search_research_docs(query: str, top_k: int = 15) -> list[Document]:
    """
    perform hybrid search with rrf on research paper vector store 
    
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
    return results


@tool
def search_online(query: str) -> list[Document]:
    """
    delivers llm-compatible search results from tavily search api, returns 10 results

    - **query**: query string
    """

    results = tavily_tool.invoke({'query': query})

    # extract search results and links

    return results


@tool
def rerank_chroma_results(query: str, context: dict, top_n=10) -> dict:
    """
    reranking for two stage retrieval
    
    - **query**: query string
    - **context**: rag result context dictionary
    - **top_n**: number of top results to return
    """

    documents = context['documents']

    rerank_response = cohere_client.rerank(
        model="rerank-v4.0-fast",
        query=query,
        documents=documents,
        top_n=top_n
    )

    indices = []
    for result in rerank_response.results:
        indices.append(result.index)

    reranked = {key: None for key in context}
    for key in context.keys():
        if not isinstance(context[key], list):
            reranked[key] = context[key]
            continue

        reranked[key] = [context[key][idx] for idx in indices]
    
    return reranked