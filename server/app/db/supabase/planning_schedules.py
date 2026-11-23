# coverage, cadence, and input revisions

from datetime import datetime
from uuid import UUID

from pydantic import TypeAdapter

from app.contracts import PlanningBillingWork, PlanningScheduleRecord
from app.db.supabase._queries import identifier, rpc_row
from app.db.supabase.transport import call_rpc, select_rows


def get_planning_schedule(user_id: str | UUID, access_token: str | None) -> PlanningScheduleRecord | None:
    """ read cadence, coverage and revision. a schedule can exist before the first workouts are
    published

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **access_token**: verified user jwt for rls; none uses backend service-role credentials
    - **returns**: coverage, cadence, and revision record, or none if not configured """

    rows = select_rows("planning_schedules", [("select", "*"),
        ("user_id", f"eq.{identifier(user_id)}"), ("limit", "1")], access_token)
    return PlanningScheduleRecord.model_validate(rows[0]) if rows else None


def configure_planning_schedule(
    user_id: str | UUID, next_refresh_at: datetime, horizon_days: int = 21, refresh_interval_days: int = 7,
) -> PlanningScheduleRecord:
    """ configure cadence using a timezone-aware anchor. changed settings cancel outstanding
    refreshes and preserve coverage. identical settings are a no-op

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **next_refresh_at**: timezone-aware anchor for the next scheduled refresh
    - **horizon_days**: target number of days covered by scheduled refreshes
    - **refresh_interval_days**: days between scheduled refreshes; positive and no longer than the horizon
    - **returns**: saved schedule; this does not generate workouts """

    if next_refresh_at.utcoffset() is None:
        raise ValueError("next refresh must include a timezone")
    if not 0 < refresh_interval_days <= horizon_days:
        raise ValueError("refresh interval must be positive and not exceed horizon")
    return PlanningScheduleRecord.model_validate(rpc_row("configure_planning_schedule", {
        "p_user_id": identifier(user_id), "p_next_refresh_at": next_refresh_at.isoformat(),
        "p_horizon_days": horizon_days, "p_refresh_interval_days": refresh_interval_days,
    }))


def invalidate_planning_inputs(user_id: str | UUID) -> int:
    """ bump the revision after saving an input without its own trigger. repeated calls
    increment it again. profile, onboarding and sports writes already handle invalidation

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **returns**: new planning revision; this does not enqueue a job """

    return TypeAdapter(int).validate_python(call_rpc("invalidate_planning_inputs",
        {"p_user_id": identifier(user_id)}, None), strict=True)


def list_billing_work(limit: int = 20) -> list[PlanningBillingWork]:
    """ alternate explicit wakes and due verification retries without polling dormant unpaid
    users

    - **limit**: maximum records to read in this batch
    - **returns**: pending wakeups and due verification retries """
    if not 1 <= limit <= 20:
        raise ValueError("billing work limit must be between 1 and 20")
    return TypeAdapter(list[PlanningBillingWork]).validate_python(call_rpc("list_planning_billing_work",
        {"p_limit": limit}, None))


def defer_planning(
    user_id: str | UUID, reason: str, retry_seconds: int | None, *,
    billing_environment: str | None = None, billing_revision: int | None = None,
    wake_token: UUID | None = None,
) -> bool:
    """ fence permanent unpaid waiting; only acknowledge an explicitly observed wake

    - **user_id**: owner of the account being checked
    - **reason**: verified denial or temporary verification failure
    - **retry_seconds**: delay before rechecking a temporary failure, or none for an unpaid account
    - **billing_environment**: store partition to check before changing planning state
    - **billing_revision**: entitlement revision to verify atomically
    - **wake_token**: observed wake to acknowledge, if any
    - **returns**: whether the database accepted the deferral """
    if reason not in {"subscription_required", "billing_unavailable"}:
        raise ValueError("invalid payment wait reason")
    if reason == "subscription_required" and retry_seconds is not None:
        raise ValueError("confirmed unpaid planning waits for an event, not a timer")
    if reason == "billing_unavailable" and (retry_seconds is None or not 1 <= retry_seconds <= 3600):
        raise ValueError("billing retry delay must be between 1 and 3600 seconds")
    return TypeAdapter(bool).validate_python(call_rpc("defer_planning_for_billing", {
        "p_user_id": identifier(user_id), "p_reason": reason, "p_retry_seconds": retry_seconds,
        "p_billing_environment": billing_environment, "p_billing_revision": billing_revision,
        "p_wake_token": identifier(wake_token) if wake_token is not None else None,
    }, None), strict=True)


def resume_planning(
    user_id: str | UUID, *, billing_environment: str | None = None, billing_revision: int | None = None,
    wake_token: UUID | None = None,
) -> bool:
    """ clear waiting and prepare due work once; a supplied paid revision is rechecked
    atomically

    - **user_id**: owner of the account being checked
    - **billing_environment**: store partition to check before changing planning state
    - **billing_revision**: entitlement revision to verify atomically
    - **wake_token**: observed wake to acknowledge, if any
    - **returns**: whether the database accepted the resume """
    return TypeAdapter(bool).validate_python(call_rpc("resume_planning_after_billing", {
        "p_user_id": identifier(user_id), "p_billing_environment": billing_environment,
        "p_billing_revision": billing_revision,
        "p_wake_token": identifier(wake_token) if wake_token is not None else None,
    }, None), strict=True)


def request_billing_recheck(user_ids: list[str | UUID]) -> None:
    """ wake affected schedules after billing invalidation, without granting access

    - **user_ids**: accounts affected by the billing change
    - **returns**: none. wakes matching schedules for verification """
    if len(user_ids) > 100:
        raise ValueError("at most 100 billing accounts may be requested")
    call_rpc("request_planning_billing_recheck", {
        "p_user_ids": [identifier(value) for value in user_ids],
    }, None)
