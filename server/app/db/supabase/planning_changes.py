# change history and version-based undo/redo

from uuid import UUID

from app.contracts import PlanningChangeRecord, PlanningChangeWorkoutRecord, WorkoutWriteResult
from app.db.supabase._queries import all_rows, identifier, page_limit
from app.db.supabase.transport import call_rpc, select_rows


CHANGE_COLUMNS = "id,user_id,revision,kind,status,reason,effective_from,effective_through,horizon_end_before,horizon_end_after,created_at"


def get_planning_change(user_id: str | UUID, change_id: str | UUID, access_token: str | None) -> PlanningChangeRecord | None:
    """read one user-owned planning change"""

    rows = select_rows("planning_changes", [("select", CHANGE_COLUMNS), ("user_id", f"eq.{identifier(user_id)}"),
        ("id", f"eq.{identifier(change_id)}"), ("limit", "1")], access_token)
    return PlanningChangeRecord.model_validate(rows[0]) if rows else None


def get_recent_planning_changes(
    user_id: str | UUID, access_token: str | None, limit: int = 20, *, before_revision: int | None = None,
) -> list[PlanningChangeRecord]:
    """read a history page newest first; use the last revision to fetch the next page"""

    page_limit(limit)
    filters = [("select", CHANGE_COLUMNS), ("user_id", f"eq.{identifier(user_id)}"),
        ("order", "revision.desc"), ("limit", str(limit))]
    if before_revision is not None:
        filters.append(("revision", f"lt.{before_revision}"))
    return [PlanningChangeRecord.model_validate(row) for row in select_rows("planning_changes", filters, access_token)]


def get_change_workouts(user_id: str | UUID, change_id: str | UUID, access_token: str | None) -> list[PlanningChangeWorkoutRecord]:
    """read before/after workout references for a change"""

    rows = all_rows("planning_change_workouts", [("select", "change_id,workout_id,user_id,side"),
        ("user_id", f"eq.{identifier(user_id)}"), ("change_id", f"eq.{identifier(change_id)}"),
        ("order", "side.asc,workout_id.asc")], access_token)
    return [PlanningChangeWorkoutRecord.model_validate(row) for row in rows]


def undo_planning_change(user_id: str | UUID, change_id: str | UUID, expected_revision: int) -> WorkoutWriteResult:
    """undo the latest applied change without copying workouts"""

    return WorkoutWriteResult.model_validate(call_rpc("undo_planning_change", {
        "p_user_id": identifier(user_id), "p_change_id": identifier(change_id),
        "p_expected_revision": expected_revision,
    }, None))


def redo_planning_change(user_id: str | UUID, change_id: str | UUID, expected_revision: int) -> WorkoutWriteResult:
    """redo the earliest undone change without copying workouts"""

    return WorkoutWriteResult.model_validate(call_rpc("redo_planning_change", {
        "p_user_id": identifier(user_id), "p_change_id": identifier(change_id),
        "p_expected_revision": expected_revision,
    }, None))
