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
    """return a bounded oldest-to-newest message history"""

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
    access_token: str,
) -> MessageRecord:
    """store one message and return it"""

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
