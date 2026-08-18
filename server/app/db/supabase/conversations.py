# this file owns reusable conversation and message table queries

from typing import Any, Literal


def get_recent_messages(
    user_id: str,
    access_token: str,
    conversation_id: str,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """return a bounded oldest-to-newest message history for one conversation"""

    raise NotImplementedError


def append_message(
    user_id: str,
    access_token: str,
    conversation_id: str,
    role: Literal["user", "assistant"],
    content: str,
) -> dict[str, Any]:
    """store one message after the conversation schema and retention policy are defined"""

    raise NotImplementedError
