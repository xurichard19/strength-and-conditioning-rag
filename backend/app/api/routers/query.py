from fastapi import APIRouter, Request

from app.api.schemas import QueryRequest, QueryResponse, Source
from app.generation.rag_pipline import answer_question


router = APIRouter(prefix='/query')

@router.post('/', response_model=QueryResponse)
def query_llm(query: QueryRequest, request: Request):
    db = request.app.state.db
    response, context = answer_question(query.text, db)
    sources = []

    for id, document, metadata in zip(context["ids"], context["documents"], context["metadatas"]):
        sources.append(
            Source(
                id=id,
                text=document,
                source=metadata.get("source"),
                page=metadata.get("page"),
            )
        )

    return QueryResponse(text=response, sources=sources)
