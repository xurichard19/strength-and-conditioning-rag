# this file owns reusable profile table queries and row mapping

from typing import Any

from app.contracts import UserProfile


def get_profile(user_id: str, access_token: str) -> UserProfile | None:
    """return the authenticated user's profile, or none when it does not exist"""

    raise NotImplementedError


def ensure_profile(user_id: str, email: str | None, access_token: str) -> UserProfile:
    """return a profile, creating a minimal row only when the row is unexpectedly missing"""

    raise NotImplementedError


def update_profile(
    user_id: str,
    values: dict[str, Any],
    access_token: str,
) -> UserProfile | None:
    """update allowed profile fields and return the updated row"""

    raise NotImplementedError
