# profile reads and updates

from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.contracts import ProfileRecord, ProfileUpdate
from app.db.supabase._queries import identifier
from app.db.supabase.transport import select_rows, update_rows


def get_profile(user_id: str | UUID, access_token: str | None) -> ProfileRecord | None:
    """ read the profile created at signup. a missing row is returned as none

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **access_token**: verified user jwt for rls; none uses backend service-role credentials
    - **returns**: user profile, or none if no visible profile exists """

    rows = select_rows("profiles", [("select", "id,email,display_name,timezone,created_at,updated_at"),
        ("id", f"eq.{identifier(user_id)}"), ("limit", "1")], access_token)
    return ProfileRecord.model_validate(rows[0]) if rows else None


def update_profile(user_id: str | UUID, values: ProfileUpdate, access_token: str) -> ProfileRecord | None:
    """ patch supplied profile fields. a null display_name clears it. a timezone change
    invalidates planning without queueing a job

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **values**: validated fields to save; omitted fields stay unchanged and explicit nulls clear
      nullable fields
    - **access_token**: verified user jwt used to enforce rls
    - **returns**: updated profile, or none if no visible profile matches """

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
