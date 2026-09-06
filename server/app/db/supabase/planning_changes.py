# planning change queries and rollback

from uuid import UUID

from app.contracts import PlanningChangeRecord, WorkoutWriteResult
from app.db.supabase.transport import call_rpc, select_rows


CHANGE_COLUMNS = (
    "id,user_id,reason,effective_from,horizon_end,reverts_change_id,created_at"
)


def get_recent_planning_changes(
    user_id: str,
    access_token: str,
    limit: int = 20,
) -> list[PlanningChangeRecord]:
    """return the user's latest planning changes"""

    if not 1 <= limit <= 100:
        raise ValueError("change limit must be between 1 and 100")

    rows = select_rows(
        "planning_changes",
        [
            ("select", CHANGE_COLUMNS),
            ("user_id", f"eq.{user_id}"),
            ("order", "created_at.desc,id.desc"),
            ("limit", str(limit)),
        ],
        access_token,
    )
    return [PlanningChangeRecord.model_validate(row) for row in rows]


def rollback_planning_change(
    access_token: str,
    change_id: UUID,
    rollback_id: UUID,
    reason: str,
) -> WorkoutWriteResult:
    """atomically restore the schedule replaced by a planning change"""

    if not reason.strip():
        raise ValueError("rollback reason is required")

    result = call_rpc(
        "rollback_planning_change",
        {
            "p_change_id": str(change_id),
            "p_rollback_id": str(rollback_id),
            "p_reason": reason,
        },
        access_token,
    )
    return WorkoutWriteResult.model_validate(result)
