import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse

from app.api.schemas import ChatRequest, Source
from app.auth.supabase import AuthUser, require_user
from app.rag.pipeline import answer_question


router = APIRouter(prefix='/chat')
logger = logging.getLogger(__name__)


def _build_sources(context: dict) -> list[Source]:
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

    return sources


def _json_line(payload: dict) -> str:
    return f"{json.dumps(payload, default=str)}\n"


@router.post('/')
def chat_llm(
    chat: ChatRequest,
    request: Request,
    user: AuthUser = Depends(require_user),
) -> StreamingResponse:
    logger.info("authenticated chat requested user_id=%s", user.id)

    db = request.app.state.db
    try:
        response_chunks, context = answer_question(chat.text, db)
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

    sources = _build_sources(context)

    def stream_events():
        text_length = 0
        try:
            for chunk in response_chunks:
                if not chunk:
                    continue

                text_length += len(chunk)
                yield _json_line({"type": "text", "delta": chunk})

            yield _json_line(
                {
                    "type": "sources",
                    "sources": [source.model_dump() for source in sources],
                }
            )
            yield _json_line({"type": "done"})
            logger.info(
                "authenticated chat completed user_id=%s source_count=%s text_length=%s",
                user.id,
                len(sources),
                text_length,
            )
        except Exception:
            logger.exception("chat streaming failed user_id=%s", user.id)
            yield _json_line(
                {
                    "type": "error",
                    "message": "Something went wrong while generating a response.",
                }
            )

    return StreamingResponse(
        stream_events(),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
