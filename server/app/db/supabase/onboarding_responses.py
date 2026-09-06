# onboarding response queries and row mapping

import datetime
from typing import Any

from app.contracts import OnboardingResponseRecord
from app.db.supabase.transport import SupabaseDataError, select_rows, upsert_rows


ONBOARDING_COLUMNS = "user_id,answers,completed_at,created_at,updated_at"


def get_onboarding_response(
    user_id: str,
    access_token: str,
) -> OnboardingResponseRecord | None:
    """return the user's current onboarding response"""

    rows = select_rows(
        "onboarding_responses",
        [("select", ONBOARDING_COLUMNS), ("user_id", f"eq.{user_id}"), ("limit", "1")],
        access_token,
    )
    return OnboardingResponseRecord.model_validate(rows[0]) if rows else None


def save_onboarding_response(
    user_id: str,
    access_token: str,
    answers: dict[str, Any],
    completed_at: datetime.datetime | None = None,
) -> OnboardingResponseRecord:
    """replace the user's onboarding answers and return the saved response"""

    values = {
        "user_id": user_id,
        "answers": answers,
    }
    if completed_at:
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
