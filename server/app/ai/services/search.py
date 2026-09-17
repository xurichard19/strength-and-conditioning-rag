import asyncio
from collections.abc import Sequence
from functools import lru_cache
from hashlib import sha256
from itertools import chain
import logging
from pathlib import PurePosixPath
from typing import Literal

import chromadb
from chromadb import K, Knn, Rrf, Search
from chromadb.utils.embedding_functions import DefaultEmbeddingFunction
import cohere
from langchain_core.documents import Document
from langchain_tavily import TavilySearch
from pydantic import BaseModel, Field

from app.config import get_settings
from app.contracts import Source


logger = logging.getLogger(__name__)
_collection = None
_collection_lock = asyncio.Lock()
_research_embeddings = DefaultEmbeddingFunction()
SEARCH_PROVIDERS = {"none": (), "research": ("research",), "web": ("web",), "both": ("research", "web")}
SEARCH_TIMEOUT_SECONDS = 25


class SearchResponse(BaseModel):
    results: list[Source] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


async def research_collection():
    """initialize async chroma client, lock connection window then cache collection"""
    global _collection
    if _collection: return _collection
    async with _collection_lock:
        if _collection is None:
            settings = get_settings()
            client = await chromadb.AsyncHttpClient(host="api.trychroma.com", port=443, ssl=True,
                headers={"x-chroma-token": settings.chroma_api_key},
                tenant=settings.chroma_tenant, database=settings.chroma_database)
            _collection = await client.get_collection(settings.system_collection_name)
    return _collection


@lru_cache(maxsize=2)
def web_search_client(top_k: int):
    """initialize tavily client, cache limit of two for quick chat and deep research"""
    return TavilySearch(tavily_api_key=get_settings().tavily_api_key,
        max_results=top_k, search_depth="fast", include_answer=False,
        include_raw_content=False, include_images=False, auto_parameters=False)


@lru_cache(maxsize=1)
def rerank_client():
    """rerank client"""
    return cohere.AsyncClientV2(api_key=get_settings().cohere_api_key, timeout=20)


async def search_research_docs(query: str, top_k: int) -> list[Source]:
    """
    dense research rag retrieval

    - **query**: standalone retrieval question
    - **top_k**: bounded number of chunks
    - **returns**: original excerpts and real chunk identifiers
    """
    collection = await research_collection()
    embeddings = await asyncio.to_thread(_research_embeddings, [query])
    result = await collection.query(query_embeddings=embeddings, n_results=top_k,
        include=["documents", "metadatas"])
    sources = []
    for identifier, text, metadata in zip(result["ids"][0], result["documents"][0], result["metadatas"][0]):
        if not text.strip():
            continue
        metadata = metadata or {}
        title = metadata.get("title") or PurePosixPath(str(metadata.get("source", "research document")).replace("\\", "/")).name
        sources.append(Source(source_type="research", document_id=str(identifier),
            doi=metadata.get("doi") or None, title=str(title), content=text.strip()))
    return sources


async def hybrid_search_research_docs(query: str, top_k: int = 10) -> list[Document]:
    """
    hybrid research retrieval using rrf with 2:1 dense-to-sparse rank weights

    - **query**: research question
    - **top_k**: result count
    - **returns**: full research documents in fused rank order, retaining chunk ids,
      available citation metadata and rrf scores
    """
    collection = await research_collection()
    index = collection.schema.keys["sparse_embedding"].sparse_vector.sparse_vector_index
    sparse_embeddings = index.config.embedding_function # move to cache during prod
    dense, sparse = await asyncio.gather(
        asyncio.to_thread(_research_embeddings, [query]),
        asyncio.to_thread(sparse_embeddings.embed_query, [query]),
    )
    rank = Rrf(ranks=[
        Knn(query=dense[0], return_rank=True, limit=max(75, top_k), default=1000),
        Knn(query=sparse[0], key="sparse_embedding", return_rank=True, limit=max(75, top_k), default=1000),
    ], weights=[2.0, 1.0], k=60)
    result = await collection.search(Search().rank(rank).limit(top_k).select(K.DOCUMENT, K.SCORE, "title", "source", "doi"))
    return [Document(id=row["id"], page_content=row["document"],
        metadata={**(row["metadata"] or {}), "source_type": "research", "score": row["score"]})
        for row in result.rows()[0] if row["document"] and row["document"].strip()]


async def rerank_research_results(query: str, research_documents: list[str], top_n: int = 5) -> list[str]:
    """
    rerank research excerpts with cohere

    - **query**: research question used to score relevance
    - **research_documents**: research excerpts to rank
    - **top_n**: maximum number of excerpts to return
    - **returns**: excerpts in relevance order
    """
    if not research_documents:
        return []
    result = await rerank_client().rerank(model="rerank-v4.0-fast", query=query,
        documents=research_documents, top_n=min(top_n, len(research_documents)), request_options={"max_retries": 0})
    return [research_documents[item.index] for item in result.results]


async def web_search(query: str, top_k: int) -> list[Source]:
    """
    tavily search

    - **query**: research question
    - **top_k**: configured maximum web results
    - **returns**: untrimmed provider snippets and titles with provider-supplied citation links;
      raw page content is disabled in the tavily client
    """
    result = await web_search_client(top_k).ainvoke({"query": query})
    if not isinstance(result, dict) or "results" not in result:
        raise ValueError("web search returned no result envelope")
    sources = []
    for item in result["results"]:
        text = item.get("content") or ""
        if not text.strip():
            continue
        sources.append(Source(source_type="web", url=item["url"], title=str(item.get("title") or "web source"),
            content=text.strip()))
    return sources


async def _retrieve(provider: str, query: str, top_k: int) -> SearchResponse:
    """search wrapper, isolate provider failures"""
    try:
        async with asyncio.timeout(SEARCH_TIMEOUT_SECONDS):
            sources = await (search_research_docs(query, top_k)
                if provider == "research" else web_search(query, top_k))
        return SearchResponse(results=sources)
    except Exception as exc:
        logger.warning("retrieval failed provider=%s error_type=%s", provider, type(exc).__name__)
        return SearchResponse(warnings=[f"{provider} search unavailable; no evidence from this attempt"])


async def search_sources(
    query: str, *, providers: Literal["none", "research", "web", "both"] = "both", top_k: int = 5,
) -> SearchResponse:
    """
    run one deterministic retrieval round in parallel when applicable

    - **query**: query
    - **providers**: allow-listed source selection
    - **top_k**: maximum results per provider; 5 for quick, 10 for deep
    - **returns**: deduplicated evidence plus explicit partial-failure warnings;
      retry decisions belong to the calling workflow, never this service
    """
    if not query.strip() or top_k < 1:
        raise ValueError("invalid search query or result limit")
    selected = SEARCH_PROVIDERS[providers]
    responses = await asyncio.gather(*(_retrieve(provider, query, top_k) for provider in selected))
    return SearchResponse(results=merge_sources([], [source for response in responses for source in response.results]),
        warnings=[note for response in responses for note in response.warnings])


def merge_sources(previous: Sequence[Source], incoming: Sequence[Source]) -> list[Source]:
    """
    merge sources by content, ignoring casing and whitespace when comparing duplicates

    - **previous**: sources from earlier searches
    - **incoming**: sources from the latest search
    - **returns**: distinct passages in first-seen order
    """
    unique = {}
    for source in chain(previous, incoming):
        key = sha256(" ".join(source.content.casefold().split()).encode()).digest()
        unique.setdefault(key, source)
    return list(unique.values())


def format_sources_for_prompt(sources: Sequence[Source]) -> str:
    """format sources as numbered excerpts with titles and citation identifiers"""
    return "\n\n".join(
        f"[{index}] {source.source_type}; {source.title or 'untitled'}; "
        f"{source.doi or source.url or source.document_id}\n{source.content}"
        for index, source in enumerate(sources, 1)
    ) or "no relevant evidence was retrieved"
