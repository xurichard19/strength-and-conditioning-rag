import asyncio
from datetime import datetime
import logging
import sentry_sdk
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import Response, StreamingResponse

from app.ai.workflows.chat.state import WorkflowContext
from app.api.errors import PRIVATE_HEADERS, database_errors, private_response
from app.api.parameters import message_cursor
from app.api.schemas import ConversationUpdate, ConversationResponse, ChatSavedEvent, ChatDoneEvent, ChatErrorEvent, ChatRequest, ChatSourcesEvent, ChatStatusEvent, ChatTextEvent, MessageResponse
from app.auth.supabase import AuthUser, require_user
from app.db.supabase import messages


router = APIRouter(prefix="/chat", tags=["chat"], dependencies=[Depends(private_response)])
logger = logging.getLogger(__name__)


@router.get("/conversations", response_model=list[ConversationResponse])
def get_conversations(before: UUID | None = None, user: AuthUser = Depends(require_user)):
    """list the owner's saved threads; before is the last id from the previous 50-row page"""
    with database_errors("chat.get_conversations"):
        return [ConversationResponse.model_validate(row) for row in
            messages.get_conversations(user.id, user.access_token, before=before)]


@router.get("/conversations/{conversation_id}", response_model=ConversationResponse)
def get_conversation(conversation_id: UUID, user: AuthUser = Depends(require_user)):
    """read an owned conversation's title and creation time; return 404 if inaccessible"""
    with database_errors("chat.get_conversation"):
        row = messages.get_conversation(user.id, conversation_id, user.access_token)
        if row is None:
            raise HTTPException(404, "conversation not found", headers=PRIVATE_HEADERS)
        return ConversationResponse.model_validate(row)


@router.patch("/conversations/{conversation_id}", response_model=ConversationResponse)
def rename_conversation(conversation_id: UUID, payload: ConversationUpdate, user: AuthUser = Depends(require_user)):
    """rename an owned conversation using payload.title; return its saved record or 404"""
    with database_errors("chat.rename_conversation"):
        row = messages.rename_conversation(user.id, conversation_id, payload.title, user.access_token)
        if row is None:
            raise HTTPException(404, "conversation not found", headers=PRIVATE_HEADERS)
        return ConversationResponse.model_validate(row)


@router.delete("/conversations/{conversation_id}", status_code=204)
def delete_conversation(conversation_id: UUID, user: AuthUser = Depends(require_user)):
    """permanently delete an owned thread and all its messages; missing threads are a no-op"""
    with database_errors("chat.delete_conversation"):
        messages.delete_conversation(user.id, conversation_id, user.access_token)
    return Response(status_code=204, headers=PRIVATE_HEADERS)


async def stream_workflow(graph, **kwargs):
    """load the workflow adapter only when streaming; yield its events without initializing ai during router import"""

    from app.ai.workflows.chat.graph import stream_chat

    with sentry_sdk.start_span(op="ai.workflow", name="chat.generate"):
        async for event in stream_chat(graph, **kwargs):
            yield event


@router.get("/messages", response_model=list[MessageResponse])
def get_messages(
    conversation_id: UUID,
    limit: int = Query(20, ge=1, le=100),
    cursor: tuple[datetime | None, UUID | None] = Depends(message_cursor),
    user: AuthUser = Depends(require_user),
) -> list[MessageResponse]:
    """
    read one page of persisted human/assistant messages, oldest to newest

    - **conversation_id**: thread to read, scoped to the verified owner
    - **limit**: page size, 1-100
    - **cursor**: oldest item timestamp/id from the previous page; omit both for newest history
    - **user**: verified owner and jwt
    - **returns**: chronological messages; first item supplies the next older-page cursor
    """

    with database_errors("chat.get_messages"):
        return [MessageResponse.model_validate(item) for item in messages.get_recent_messages(
            user.id, user.access_token, limit, conversation_id=conversation_id, before_created_at=cursor[0], before_id=cursor[1])]


@router.post("", response_class=StreamingResponse, responses={200: {
    "content": {"application/x-ndjson": {"schema": {"type": "string"}}},
    "description": "newline-separated ChatStreamEvent objects: optional saved/status events, text, sources, then done or error",
}})
async def chat_reply(
    payload: ChatRequest, request: Request, user: AuthUser = Depends(require_user),
    x_chat_saved_events: str | None = Header(None),
    x_chat_status_events: str | None = Header(None),
) -> StreamingResponse:
    """
    persist a user turn, stream the existing chat workflow, and save the completed reply

    passes only the current message to the workflow; history retrieval belongs in
    workflow nodes. send one turn at a time per user; concurrent turns are not
    serialized. a disconnected/failed stream can leave the user message without a
    saved reply. do not automatically replay post: messages have no request key.
    this chat does not automatically enqueue planning changes.

    - **payload**: nonblank text and conversation_id; use a fresh uuid for a new thread,
      or the saved thread id to continue it. clients cannot submit assistant/system roles
    - **request**: application with initialized chat_graph
    - **x_chat_saved_events**: set to "1" to receive the saved-human event; omitted
      for older clients that accept only text, sources, done, and error
    - **x_chat_status_events**: set to "1" to receive transient progress; omitted for
      clients that do not recognize status events. progress is never saved as a message
    - **user**: verified owner; human writes use the jwt and assistant writes use backend credentials
    - **returns**: saved human record, text/sources events, then done with saved
      message_id and assistant record for client cache reconciliation;
      errors after streaming starts are error events, not a new http status
    """

    graph = getattr(request.app.state, "chat_graph", None)
    if graph is None:
        raise HTTPException(503, "chat unavailable", headers=PRIVATE_HEADERS)
    with database_errors("chat.save_user"):
        human = await asyncio.to_thread(messages.append_message, user.id, "user", payload.text, user.access_token, conversation_id=payload.conversation_id)
    context = WorkflowContext(user_id=user.id, access_token=user.access_token)

    async def events():
        chunks = []
        try:
            if x_chat_saved_events == "1":
                yield ChatSavedEvent(message=MessageResponse.model_validate(human)).model_dump_json() + "\n"
            async for event in stream_workflow(graph, message=payload.text, context=context):
                if event["type"] == "done":
                    continue
                if event["type"] == "text":
                    outgoing = ChatTextEvent.model_validate(event)
                    chunks.append(outgoing.delta)
                elif event["type"] == "status":
                    if x_chat_status_events != "1":
                        continue
                    outgoing = ChatStatusEvent.model_validate(event)
                else:
                    outgoing = ChatSourcesEvent.model_validate(event)
                yield outgoing.model_dump_json() + "\n"
            text = "".join(chunks)
            if not text.strip():
                raise ValueError("empty assistant reply")
            with sentry_sdk.start_span(op="db", name="chat.save_assistant"):
                saved = await asyncio.to_thread(messages.append_message, user.id, "assistant", text, None, conversation_id=payload.conversation_id)
            yield ChatDoneEvent(message_id=saved.id, message=MessageResponse.model_validate(saved)).model_dump_json() + "\n"
        except Exception as exc:
            # streaming already returned http 200, so automatic 5xx reporting cannot see this failure
            sentry_sdk.capture_exception(exc)
            logger.warning("chat failed user_id=%s error_type=%s", user.id, type(exc).__name__)
            yield ChatErrorEvent(message="chat response could not be completed").model_dump_json() + "\n"

    return StreamingResponse(events(), media_type="application/x-ndjson",
        headers={**PRIVATE_HEADERS, "X-Accel-Buffering": "no"})
