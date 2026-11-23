# reusable message queries and row mapping

from datetime import datetime
from uuid import UUID

from app.contracts import ConversationRecord, MessageRecord, MessageRole
from app.db.supabase._queries import identifier, page_limit
from app.db.supabase.transport import SupabaseDataError, insert_rows, select_rows, update_rows, delete_rows


MESSAGE_COLUMNS = "conversation_id,id,user_id,role,content,created_at"


def get_conversation(user_id: str | UUID, conversation_id: UUID, access_token: str | None) -> ConversationRecord | None:
    """ return the owned thread, or none if missing or inaccessible

    - **user_id**: verified owner
    - **conversation_id**: thread to read
    - **access_token**: user jwt, or none for backend credentials after owner authorization
    - **returns**: saved thread, or none when missing or owned by someone else """
    rows = select_rows("conversations", [("select", "id,user_id,title,created_at"),
        ("user_id", f"eq.{identifier(user_id)}"), ("id", f"eq.{identifier(conversation_id)}")], access_token)
    return ConversationRecord.model_validate(rows[0]) if rows else None


def rename_conversation(user_id: str | UUID, conversation_id: UUID, title: str, access_token: str | None) -> ConversationRecord | None:
    """ update the title only. return none if the thread is missing or inaccessible

    - **user_id**: verified owner
    - **conversation_id**: thread to rename
    - **title**: nonblank display name, at most 120 characters after trimming
    - **access_token**: user jwt, or none for backend credentials after owner authorization
    - **returns**: updated thread, or none when missing or inaccessible """
    title = title.strip()
    if not title or len(title) > 120:
        raise ValueError("title must contain 1 to 120 characters")
    rows = update_rows("conversations", {"title": title},
        [("user_id", f"eq.{identifier(user_id)}"), ("id", f"eq.{identifier(conversation_id)}")], access_token)
    return ConversationRecord.model_validate(rows[0]) if rows else None


def delete_conversation(user_id: str | UUID, conversation_id: UUID, access_token: str | None) -> None:
    """ delete the owned thread and its messages. a missing or inaccessible thread is a no-op

    - **user_id**: verified owner
    - **conversation_id**: thread to delete; a missing or inaccessible thread is a no-op
    - **access_token**: user jwt, or none for backend credentials after owner authorization
    - **returns**: none; no automatic retries are performed """
    delete_rows("conversations",
        [("user_id", f"eq.{identifier(user_id)}"), ("id", f"eq.{identifier(conversation_id)}")], access_token)


def get_conversations(user_id: str | UUID, access_token: str | None, *, before: UUID | None = None) -> list[ConversationRecord]:
    """ list up to 50 threads newest first.
    pass the last id as the exclusive cursor for older threads

    - **user_id**: verified owner; explicit filters restrict visibility when using backend credentials
    - **access_token**: user jwt, or none for backend credentials after owner authorization
    - **before**: last conversation id from the previous page; omit for newest
    - **returns**: saved conversations; empty when no further threads remain """
    cursor = []
    if before is not None:
        rows = select_rows("conversations", [("select", "created_at"), ("id", f"eq.{identifier(before)}"),
            ("user_id", f"eq.{identifier(user_id)}")], access_token)
        if not rows:
            return []
        stamp = datetime.fromisoformat(rows[0]["created_at"]).isoformat()
        cursor = [("or", f"(created_at.lt.{stamp},and(created_at.eq.{stamp},id.lt.{identifier(before)}))")]

    return [ConversationRecord.model_validate(row) for row in select_rows("conversations",
        [("select", "id,user_id,title,created_at"), ("user_id", f"eq.{identifier(user_id)}"),
         *cursor, ("order", "created_at.desc,id.desc"), ("limit", "50")], access_token)]


def get_recent_messages(
    user_id: str | UUID,
    access_token: str | None,
    limit: int = 20,
    *, conversation_id: UUID, before_created_at: datetime | None = None, before_id: UUID | None = None,
) -> list[MessageRecord]:
    """ read the newest matching messages in chronological order. pass the first row's timestamp
    and id together to fetch the next older page

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **access_token**: verified user jwt for rls; none uses backend service-role credentials
    - **limit**: maximum records to return, from 1 to 100
    - **conversation_id**: thread id; history never crosses conversation boundaries
    - **before_created_at**: timestamp of the oldest message in the previous page; supply with before_id
    - **before_id**: id of that oldest message, used to break timestamp ties
    - **returns**: one page ordered oldest to newest; use its first item for the next older-page cursor """

    page_limit(limit)
    if (before_created_at is None) != (before_id is None):
        raise ValueError("message cursor requires both timestamp and id")

    cursor = []
    if before_created_at is not None:
        if before_created_at.utcoffset() is None:
            raise ValueError("message cursor must include a timezone")
        stamp = before_created_at.isoformat()
        cursor = [("or", f"(created_at.lt.{stamp},and(created_at.eq.{stamp},id.lt.{identifier(before_id)}))")]

    rows = select_rows(
        "messages",
        [
            ("select", MESSAGE_COLUMNS),
            ("conversation_id", f"eq.{identifier(conversation_id)}"),
            ("user_id", f"eq.{identifier(user_id)}"),
            *cursor,
            ("order", "created_at.desc,id.desc"),
            ("limit", str(limit)),
        ],
        access_token,
    )
    return [MessageRecord.model_validate(row) for row in reversed(rows)]


def append_message(
    user_id: str | UUID,
    role: MessageRole,
    content: str,
    access_token: str | None,
    *, conversation_id: UUID,
) -> MessageRecord:
    """ append one message to an authorized owner's conversation. this write has no idempotency
    key. check history after a timeout before sending it again

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **role**: message author, user or assistant
    - **content**: nonblank message text
    - **access_token**: user jwt, or none for trusted backend writes after owner authorization
    - **conversation_id**: thread id; a first human insert atomically creates a thread named from that
      message (at most 120 characters); later messages never replace the title; assistant inserts require
      an existing thread belonging to the same owner
    - **returns**: saved message including its id and creation timestamp """

    if not content.strip():
        raise ValueError("message content is required")

    rows = insert_rows(
        "messages",
        {"user_id": identifier(user_id), "role": role, "content": content, "conversation_id": identifier(conversation_id)},
        access_token,
    )
    if not rows:
        raise SupabaseDataError("message write returned no rows")
    return MessageRecord.model_validate(rows[0])
