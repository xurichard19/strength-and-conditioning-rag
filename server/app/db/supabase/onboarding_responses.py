# onboarding response queries and row mapping

import datetime
from typing import Any
from uuid import UUID

from app.contracts import OnboardingResponseRecord
from app.db.supabase._queries import identifier
from app.db.supabase.transport import SupabaseDataError, call_rpc, select_rows, upsert_rows


ONBOARDING_COLUMNS = "user_id,answers,completed_at,created_at,updated_at"


def get_onboarding_response(
    user_id: str | UUID,
    access_token: str | None,
) -> OnboardingResponseRecord | None:
    """ - **user_id**: owner of the answers
    - **access_token**: owner token, or none for backend credentials
    - **returns**: current onboarding response, or none if not saved """

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
    """ concurrent saves are last-write-wins. edits after completion queue a covered adjustment

    - **user_id**: owner of the answers
    - **answers**: full replacement answer object
    - **access_token**: owner token for row-level security
    - **completed_at**: timezone-aware completion time, or none to preserve it
    - **returns**: saved onboarding response including database timestamps """

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


def complete_onboarding_response(user_id: str | UUID) -> OnboardingResponseRecord | None:
    """ complete onboarding and initialize its schedule atomically. return none before the first save.
    retries preserve the original completion time and refresh cadence

    - **user_id**: verified owner for the backend transaction
    - **returns**: completed response or none if no saved response exists """

    result = call_rpc("complete_onboarding", {"p_user_id": identifier(user_id)}, None)
    return OnboardingResponseRecord.model_validate(result) if result is not None else None
