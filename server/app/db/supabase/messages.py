# reusable message queries and row mapping

from app.contracts import MessageRecord, MessageRole
from app.db.supabase.transport import SupabaseDataError, insert_rows, select_rows


MESSAGE_COLUMNS = "id,user_id,role,content,created_at"


def get_recent_messages(
    user_id: str,
    access_token: str,
    limit: int = 20,
) -> list[MessageRecord]:
    """return a bounded oldest-to-newest message history"""

    if not 1 <= limit <= 100:
        raise ValueError("message limit must be between 1 and 100")

    rows = select_rows(
        "messages",
        [
            ("select", MESSAGE_COLUMNS),
            ("user_id", f"eq.{user_id}"),
            ("order", "created_at.desc,id.desc"),
            ("limit", str(limit)),
        ],
        access_token,
    )
    return [MessageRecord.model_validate(row) for row in reversed(rows)]


def append_message(
    user_id: str,
    access_token: str,
    role: MessageRole,
    content: str,
) -> MessageRecord:
    """store one message and return it"""

    if not content.strip():
        raise ValueError("message content is required")

    rows = insert_rows(
        "messages",
        {"user_id": user_id, "role": role, "content": content},
        access_token,
    )
    if not rows:
        raise SupabaseDataError("message write returned no rows")
    return MessageRecord.model_validate(rows[0])
