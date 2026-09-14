# coverage, cadence, and input revisions

from datetime import datetime
from uuid import UUID

from pydantic import TypeAdapter

from app.contracts import PlanningScheduleRecord
from app.db.supabase._queries import identifier, rpc_row
from app.db.supabase.transport import call_rpc, select_rows


def get_planning_schedule(user_id: str | UUID, access_token: str | None) -> PlanningScheduleRecord | None:
    """read coverage, next refresh time, and the current planning revision"""

    rows = select_rows("planning_schedules", [("select", "*"),
        ("user_id", f"eq.{identifier(user_id)}"), ("limit", "1")], access_token)
    return PlanningScheduleRecord.model_validate(rows[0]) if rows else None


def configure_planning_schedule(
    user_id: str | UUID, next_refresh_at: datetime, horizon_days: int = 7, refresh_interval_days: int = 7,
) -> PlanningScheduleRecord:
    """initialize or explicitly change cadence without generating workouts"""

    if next_refresh_at.utcoffset() is None:
        raise ValueError("next refresh must include a timezone")
    if not 0 < refresh_interval_days <= horizon_days:
        raise ValueError("refresh interval must be positive and not exceed horizon")
    return PlanningScheduleRecord.model_validate(rpc_row("configure_planning_schedule", {
        "p_user_id": identifier(user_id), "p_next_refresh_at": next_refresh_at.isoformat(),
        "p_horizon_days": horizon_days, "p_refresh_interval_days": refresh_interval_days,
    }))


def invalidate_planning_inputs(user_id: str | UUID) -> int:
    """bump the revision for planning inputs without an automatic database trigger"""

    return TypeAdapter(int).validate_python(call_rpc("invalidate_planning_inputs",
        {"p_user_id": identifier(user_id)}, None), strict=True)
