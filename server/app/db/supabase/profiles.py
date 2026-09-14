# profile reads and updates

from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.contracts import ProfileRecord, ProfileUpdate
from app.db.supabase._queries import identifier
from app.db.supabase.transport import select_rows, update_rows


def get_profile(user_id: str | UUID, access_token: str | None) -> ProfileRecord | None:
    """
    read the profile created by the auth signup trigger

    reads the profile normally created by the auth signup trigger. does not create
    a replacement when missing; the caller decides whether missing data is an account
    setup problem. the returned profile is identity/preferences data, not onboarding
    answers, which have a separate handler.

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **access_token**: verified user jwt for rls; none uses backend service-role credentials
    - **returns**: user profile, or none if no visible profile exists
    """

    rows = select_rows("profiles", [("select", "id,email,display_name,timezone,created_at,updated_at"),
        ("id", f"eq.{identifier(user_id)}"), ("limit", "1")], access_token)
    return ProfileRecord.model_validate(rows[0]) if rows else None


def update_profile(user_id: str | UUID, values: ProfileUpdate, access_token: str) -> ProfileRecord | None:
    """
    update supplied profile fields; omitted fields remain unchanged

    only fields allowed by ProfileUpdate can be changed; user id and email are not
    write inputs. exclude_unset preserves omitted fields; explicit null can clear
    display_name but not timezone. validates the timezone using the timezone database.
    a database trigger bumps the planning revision, but this does not enqueue a replan.
    an empty update or invalid timezone raises valueerror before any write.

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **values**: validated fields to save; omitted fields stay unchanged and explicit nulls clear nullable fields
    - **access_token**: verified user jwt used to enforce rls
    - **returns**: updated profile, or none if no visible profile matches
    """

    payload = values.model_dump(mode="json", exclude_unset=True)
    if not payload:
        raise ValueError("profile update is empty")
    if "timezone" in payload:
        try:
            ZoneInfo(payload["timezone"])
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("invalid timezone") from exc
    rows = update_rows("profiles", payload, [("id", f"eq.{identifier(user_id)}")], access_token)
    return ProfileRecord.model_validate(rows[0]) if rows else None
