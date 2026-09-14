# coverage, cadence, and input revisions

from datetime import datetime
from uuid import UUID

from pydantic import TypeAdapter

from app.contracts import PlanningScheduleRecord
from app.db.supabase._queries import identifier, rpc_row
from app.db.supabase.transport import call_rpc, select_rows


def get_planning_schedule(user_id: str | UUID, access_token: str | None) -> PlanningScheduleRecord | None:
    """
    read coverage, next refresh time, and the current planning revision

    reads the user's rolling-planning metadata, not a container of workouts.
    horizon_end is current coverage, next_refresh_at anchors cadence, and revision
    guards optimistic concurrency. a row can exist with no coverage yet. this
    function neither initializes the schedule nor queues overdue work.

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **access_token**: verified user jwt for rls; none uses backend service-role credentials
    - **returns**: coverage, cadence, and revision record, or none if not configured
    """

    rows = select_rows("planning_schedules", [("select", "*"),
        ("user_id", f"eq.{identifier(user_id)}"), ("limit", "1")], access_token)
    return PlanningScheduleRecord.model_validate(rows[0]) if rows else None


def configure_planning_schedule(
    user_id: str | UUID, next_refresh_at: datetime, horizon_days: int = 7, refresh_interval_days: int = 7,
) -> PlanningScheduleRecord:
    """
    initialize or explicitly change cadence without generating workouts

    backend-only setup/settings operation, not a call to make on every adjustment.
    requires an existing profile. creating a schedule does not populate workouts or
    establish coverage. changing cadence fields increments revision and cancels
    pending/running refresh jobs; identical fields are a no-op. existing coverage
    remains until publication changes it.

    use a timezone-aware next_refresh_at chosen by application policy. adjustments
    do not move this anchor. a separate scheduler must call enqueue_due_replans;
    this handler does not start one or generate a plan.

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **next_refresh_at**: timezone-aware anchor for the next scheduled refresh
    - **horizon_days**: target number of days covered by scheduled refreshes
    - **refresh_interval_days**: days between scheduled refreshes; positive and no longer than the horizon
    - **returns**: saved schedule; this does not generate workouts
    """

    if next_refresh_at.utcoffset() is None:
        raise ValueError("next refresh must include a timezone")
    if not 0 < refresh_interval_days <= horizon_days:
        raise ValueError("refresh interval must be positive and not exceed horizon")
    return PlanningScheduleRecord.model_validate(rpc_row("configure_planning_schedule", {
        "p_user_id": identifier(user_id), "p_next_refresh_at": next_refresh_at.isoformat(),
        "p_horizon_days": horizon_days, "p_refresh_interval_days": refresh_interval_days,
    }))


def invalidate_planning_inputs(user_id: str | UUID) -> int:
    """
    bump the revision for planning inputs without an automatic database trigger

    backend-only revision bump for inputs without a dedicated invalidation trigger,
    such as a persisted chat-derived constraint. save the input before calling this
    handler. profiles, onboarding, and sports writes already bump revision through
    their triggers, so do not add a redundant call for those writes.

    requires a configured schedule and does not enqueue a job. a bump makes existing
    worker proposals stale. repeated calls increment again; there is no request key,
    so this is not an idempotent transport retry operation.

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **returns**: new planning revision; this does not enqueue a job
    """

    return TypeAdapter(int).validate_python(call_rpc("invalidate_planning_inputs",
        {"p_user_id": identifier(user_id)}, None), strict=True)
