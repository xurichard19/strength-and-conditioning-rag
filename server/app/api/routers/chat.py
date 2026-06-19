import logging

from fastapi import APIRouter, Depends, Request

from app.api.schemas import ChatRequest, ChatResponse, Source
from app.auth.supabase import AuthUser, require_user
from app.rag.pipeline import answer_question


router = APIRouter(prefix='/chat')
logger = logging.getLogger(__name__)


@router.post('/', response_model=ChatResponse)
def chat_llm(
    chat: ChatRequest,
    request: Request,
    user: AuthUser = Depends(require_user),
) -> ChatResponse:
    logger.info("authenticated chat requested user_id=%s email=%s", user.id, user.email)

    db = request.app.state.db
    response, context = answer_question(chat.text, db)
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

    logger.info(
        "authenticated chat completed user_id=%s source_count=%s",
        user.id,
        len(sources),
    )

    return ChatResponse(text=response, sources=sources)
