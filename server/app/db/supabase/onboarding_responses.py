# onboarding response queries and row mapping

import datetime
from typing import Any
from uuid import UUID

from app.contracts import OnboardingResponseRecord
from app.db.supabase._queries import identifier
from app.db.supabase.transport import SupabaseDataError, select_rows, update_rows, upsert_rows


ONBOARDING_COLUMNS = "user_id,answers,completed_at,created_at,updated_at"


def get_onboarding_response(
    user_id: str | UUID,
    access_token: str | None,
) -> OnboardingResponseRecord | None:
    """
    return the user's current onboarding response

    returns the single current answer object for the user, not a history of answer
    versions. answers remain flexible json data; the workflow decides which keys it
    understands. no saved row returns none rather than an invented empty response.

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **access_token**: verified user jwt for rls; none uses backend service-role credentials
    - **returns**: current onboarding response, or none if not saved
    """

    rows = select_rows(
        "onboarding_responses",
        [("select", ONBOARDING_COLUMNS), ("user_id", f"eq.{identifier(user_id)}"), ("limit", "1")],
        access_token,
    )
    return OnboardingResponseRecord.model_validate(rows[0]) if rows else None


def save_onboarding_response(
    user_id: str | UUID,
    answers: dict[str, Any],
    access_token: str,
    completed_at: datetime.datetime | None = None,
) -> OnboardingResponseRecord:
    """
    replace the user's onboarding answers and return the saved response

    upserts by user_id and replaces the entire answers object; it does not merge
    individual answers. supply the full desired object when saving an edit. omitted
    completed_at preserves the previous timestamp; this interface cannot clear it.
    a supplied timestamp must be timezone-aware. the database trigger bumps the
    planning revision but does not enqueue a job. concurrent saves are last-write-wins,
    so repeating an old save can overwrite a newer response.

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **answers**: complete onboarding answer object, replacing the previous answers
    - **access_token**: verified user jwt used to enforce rls
    - **completed_at**: timezone-aware completion timestamp; omit to preserve the existing value
    - **returns**: saved onboarding response including database timestamps
    """

    values = {
        "user_id": identifier(user_id),
        "answers": answers,
    }
    if completed_at:
        if completed_at.utcoffset() is None:
            raise ValueError("completion time must include a timezone")
        values["completed_at"] = completed_at.isoformat()

    rows = upsert_rows(
        "onboarding_responses",
        values,
        access_token,
        on_conflict="user_id",
    )
    if not rows:
        raise SupabaseDataError("onboarding response write returned no rows")
    return OnboardingResponseRecord.model_validate(rows[0])


def complete_onboarding_response(user_id: str | UUID, access_token: str) -> OnboardingResponseRecord | None:
    """
    set completion time only when the saved response has not already been completed

    the conditional update preserves the first timestamp under concurrent calls
    and never copies or replaces answers. if nothing was updated, read the current
    row to distinguish an already-completed response from a missing one. the
    database trigger increments planning revision only for a matching update;
    this handler does not enqueue a job. no fixed question schema is required.

    - **user_id**: authenticated owner's id
    - **access_token**: verified caller jwt for owner-scoped rls
    - **returns**: completed response or none if no visible saved response exists
    """

    rows = update_rows("onboarding_responses", {"completed_at": datetime.datetime.now(datetime.UTC).isoformat()},
        [("user_id", f"eq.{identifier(user_id)}"), ("completed_at", "is.null")], access_token)
    return OnboardingResponseRecord.model_validate(rows[0]) if rows else get_onboarding_response(user_id, access_token)
