# reusable message queries and row mapping

from datetime import datetime
from uuid import UUID

from app.contracts import MessageRecord, MessageRole
from app.db.supabase._queries import identifier, page_limit
from app.db.supabase.transport import SupabaseDataError, insert_rows, select_rows


MESSAGE_COLUMNS = "id,user_id,role,content,created_at"


def get_recent_messages(
    user_id: str | UUID,
    access_token: str | None,
    limit: int = 20,
    *, before_created_at: datetime | None = None, before_id: UUID | None = None,
) -> list[MessageRecord]:
    """
    return a bounded oldest-to-newest message history

    selects the newest matching page, then reverses it into chronological order
    for chat display or model context. to fetch older messages, pass the timestamp
    and id of the first returned item together; using the last item would overlap
    pages. the timestamp must be timezone-aware. equal timestamps are ordered by id,
    and the cursor is exclusive. an empty result means no older visible messages.

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **access_token**: verified user jwt for rls; none uses backend service-role credentials
    - **limit**: maximum records to return, from 1 to 100
    - **before_created_at**: timestamp of the oldest message in the previous page; supply with before_id
    - **before_id**: id of that oldest message, used to break timestamp ties
    - **returns**: one page ordered oldest to newest; use its first item for the next older-page cursor
    """

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
) -> MessageRecord:
    """
    store one message and return it

    persists a user message with its owner jwt, or an assistant message with
    backend credentials (access_token=None). callers must authorize the owner
    before using backend credentials; a user jwt cannot write assistant messages. rejects
    blank/whitespace-only text but stores valid content without trimming it. messages
    do not automatically invalidate planning or enqueue an adjustment; business logic
    must handle chat-derived changes separately. this insert has no idempotency key:
    retrying after an ambiguous timeout can create a duplicate.

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **role**: message author, user or assistant
    - **content**: nonblank message text
    - **access_token**: verified user jwt for human messages; none for trusted backend writes
    - **returns**: saved message including its id and creation timestamp
    """

    if not content.strip():
        raise ValueError("message content is required")

    rows = insert_rows(
        "messages",
        {"user_id": identifier(user_id), "role": role, "content": content},
        access_token,
    )
    if not rows:
        raise SupabaseDataError("message write returned no rows")
    return MessageRecord.model_validate(rows[0])
