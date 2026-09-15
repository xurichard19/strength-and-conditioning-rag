import asyncio
from datetime import datetime
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from app.ai.workflows.chat.state import WorkflowContext
from app.api.errors import PRIVATE_HEADERS, database_errors, private_response
from app.api.parameters import message_cursor
from app.api.schemas import ChatDoneEvent, ChatErrorEvent, ChatRequest, ChatSourcesEvent, ChatTextEvent, MessageResponse
from app.auth.supabase import AuthUser, require_user
from app.db.supabase import messages


router = APIRouter(prefix="/chat", tags=["chat"], dependencies=[Depends(private_response)])
logger = logging.getLogger(__name__)


async def stream_workflow(graph, **kwargs):
    """load the workflow adapter only when streaming; yield its events without initializing ai during router import"""

    from app.ai.workflows.chat.graph import stream_chat

    async for event in stream_chat(graph, **kwargs):
        yield event


@router.get("/messages", response_model=list[MessageResponse])
def get_messages(
    limit: int = Query(20, ge=1, le=100),
    cursor: tuple[datetime | None, UUID | None] = Depends(message_cursor),
    user: AuthUser = Depends(require_user),
) -> list[MessageResponse]:
    """
    read one page of persisted human/assistant messages, oldest to newest

    - **limit**: page size, 1-100
    - **cursor**: oldest item timestamp/id from the previous page; omit both for newest history
    - **user**: verified owner and jwt
    - **returns**: chronological messages; first item supplies the next older-page cursor
    """

    with database_errors():
        return [MessageResponse.model_validate(item) for item in messages.get_recent_messages(
            user.id, user.access_token, limit, before_created_at=cursor[0], before_id=cursor[1])]


@router.post("", response_class=StreamingResponse, responses={200: {
    "content": {"application/x-ndjson": {"schema": {"type": "string"}}},
    "description": "newline-separated ChatStreamEvent objects: text, sources, then done or error",
}})
async def chat_reply(
    payload: ChatRequest, request: Request, user: AuthUser = Depends(require_user),
) -> StreamingResponse:
    """
    persist a user turn, stream the existing chat workflow, and save the completed reply

    reads bounded history before saving the current message to avoid duplicating it
    in the model prompt. send one turn at a time per user; concurrent turns are not
    serialized. a disconnected/failed stream can leave the user message without a
    saved reply. do not automatically replay post: messages have no request key.
    this chat does not automatically enqueue planning changes.

    - **payload**: nonblank user text; clients cannot submit assistant/system roles
    - **request**: application with initialized chat_graph
    - **user**: verified owner; human writes use the jwt and assistant writes use backend credentials
    - **returns**: ndjson text/sources events, then done with saved message_id;
      errors after streaming starts are error events, not a new http status
    """

    graph = getattr(request.app.state, "chat_graph", None)
    if graph is None:
        raise HTTPException(503, "chat unavailable", headers=PRIVATE_HEADERS)
    with database_errors():
        history = await asyncio.to_thread(messages.get_recent_messages, user.id, user.access_token)
        await asyncio.to_thread(messages.append_message, user.id, "user", payload.text, user.access_token)
    context = WorkflowContext(user_id=user.id, access_token=user.access_token)

    async def events():
        chunks = []
        try:
            async for event in stream_workflow(graph, message=payload.text, context=context, history=history):
                if event["type"] == "done":
                    continue
                if event["type"] == "text":
                    outgoing = ChatTextEvent.model_validate(event)
                    chunks.append(outgoing.delta)
                else:
                    outgoing = ChatSourcesEvent.model_validate(event)
                yield outgoing.model_dump_json() + "\n"
            text = "".join(chunks)
            if not text.strip():
                raise ValueError("empty assistant reply")
            saved = await asyncio.to_thread(messages.append_message, user.id, "assistant", text, None)
            yield ChatDoneEvent(message_id=saved.id).model_dump_json() + "\n"
        except Exception as exc:
            logger.warning("chat failed user_id=%s error_type=%s", user.id, type(exc).__name__)
            yield ChatErrorEvent(message="chat response could not be completed").model_dump_json() + "\n"

    return StreamingResponse(events(), media_type="application/x-ndjson",
        headers={**PRIVATE_HEADERS, "X-Accel-Buffering": "no"})
