# this file owns reusable conversation and message table queries

from app.contracts import MessageRecord, MessageRole


def get_recent_messages(
    user_id: str,
    access_token: str,
    conversation_id: str,
    limit: int = 20,
) -> list[MessageRecord]:
    """return a bounded oldest-to-newest message history for one conversation"""

    raise NotImplementedError


def append_message(
    user_id: str,
    access_token: str,
    conversation_id: str,
    role: MessageRole,
    content: str,
) -> MessageRecord:
    """store one message and return the persisted row"""

    raise NotImplementedError
