import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status

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
    logger.info("authenticated chat requested user_id=%s", user.id)

    db = request.app.state.db
    try:
        response, context = answer_question(chat.text, db)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.exception("chat generation failed user_id=%s", user.id)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Chat service is temporarily unavailable",
        ) from exc

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
