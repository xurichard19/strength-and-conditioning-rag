# this file owns reusable profile table queries and row mapping

from typing import Any

from app.contracts import ProfileRecord
from app.db.supabase.transport import SupabaseDataError, select_rows, update_rows, upsert_rows


PROFILE_COLUMNS = "id,email,display_name,timezone,created_at,updated_at"
PROFILE_UPDATE_FIELDS = {"display_name", "timezone"}


def get_profile(user_id: str, access_token: str) -> ProfileRecord | None:
    """return the authenticated user's profile, or none when it does not exist"""

    rows = select_rows(
        "profiles",
        [("select", PROFILE_COLUMNS), ("id", f"eq.{user_id}"), ("limit", "1")],
        access_token,
    )
    return ProfileRecord.model_validate(rows[0]) if rows else None


def ensure_profile(user_id: str, email: str | None, access_token: str) -> ProfileRecord:
    """return a profile, creating a minimal row only when the row is unexpectedly missing"""

    profile = get_profile(user_id, access_token)
    if profile:
        return profile

    rows = upsert_rows(
        "profiles",
        {"id": user_id, "email": email},
        access_token,
        on_conflict="id",
    )
    if not rows:
        raise SupabaseDataError("profile write returned no rows")
    return ProfileRecord.model_validate(rows[0])


def update_profile(
    user_id: str,
    values: dict[str, Any],
    access_token: str,
) -> ProfileRecord | None:
    """update allowed profile fields and return the updated row"""

    unsupported = values.keys() - PROFILE_UPDATE_FIELDS
    if not values or unsupported:
        raise ValueError("invalid profile update fields")

    rows = update_rows("profiles", values, [("id", f"eq.{user_id}")], access_token)
    return ProfileRecord.model_validate(rows[0]) if rows else None
