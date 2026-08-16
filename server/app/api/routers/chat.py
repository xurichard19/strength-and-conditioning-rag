import json
import logging
from uuid import uuid4

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from app.ai.workflows.chat.graph import stream_chat
from app.ai.workflows.chat.state import WorkflowContext
from app.api.schemas import ChatRequest
from app.auth.supabase import AuthUser, require_user


router = APIRouter(prefix='/chat')
logger = logging.getLogger(__name__)


def _json_line(payload: dict) -> str:
    return f"{json.dumps(payload, default=str)}\n"


@router.post('/')
async def chat_llm(
    chat: ChatRequest,
    request: Request,
    user: AuthUser = Depends(require_user),
) -> StreamingResponse:
    logger.info("authenticated chat requested user_id=%s", user.id)

    context = WorkflowContext(
        user_id=user.id,
        access_token=user.access_token,
        conversation_id=str(uuid4()),
    )

    async def stream_events():
        text_length = 0
        source_count = 0
        try:
            async for event in stream_chat(
                request.app.state.chat_graph,
                message=chat.text,
                context=context,
            ):
                if event["type"] == "text":
                    text_length += len(event["delta"])
                elif event["type"] == "sources":
                    source_count = len(event["sources"])

                yield _json_line(event)

            logger.info(
                "authenticated chat completed user_id=%s source_count=%s text_length=%s",
                user.id,
                source_count,
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
