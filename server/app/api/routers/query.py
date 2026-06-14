from fastapi import APIRouter, Request

from app.api.schemas import ChatRequest, ChatResponse, Source
from app.generation.rag_pipeline import answer_question


router = APIRouter(prefix='/query')

@router.post('/', response_model=ChatResponse)
def query_llm(query: ChatRequest, request: Request) -> ChatResponse:
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

    return ChatResponse(text=response, sources=sources)
