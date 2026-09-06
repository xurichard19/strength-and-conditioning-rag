# planned and completed workout queries and row mapping

from datetime import date, timedelta
from uuid import UUID

from app.contracts import PlannedWorkoutPlan, WorkoutRecord, WorkoutWriteResult
from app.db.supabase.transport import call_rpc, select_rows


WORKOUT_COLUMNS = (
    "id,user_id,created_by_change_id,scheduled_date,name,"
    "planned_duration_minutes,intent,status,notes,"
    "started_at,completed_at,skipped_at,superseded_at,superseded_by_change_id,"
    "created_at,updated_at,"
    "exercises(id,workout_id,order_index,name,reps_per_side,weight_unit,"
    "distance_unit,notes,created_at,updated_at,"
    "sets:exercise_sets(id,exercise_id,order_index,planned_reps,planned_weight,"
    "planned_distance,planned_duration_seconds,planned_rpe,planned_rest_seconds,"
    "planned_notes,actual_reps,actual_weight,actual_distance,actual_duration_seconds,"
    "actual_rpe,result_status,result_notes,completed_at,created_at,updated_at))"
)
NESTED_ORDER = [
    ("exercises.order", "order_index.asc"),
    ("exercises.sets.order", "order_index.asc"),
]


def _validate_date_range(start_date: date, end_date: date) -> None:
    if start_date > end_date:
        raise ValueError("start date must not be after end date")
    if (end_date - start_date).days > 366:
        raise ValueError("date range must not exceed 366 days")


def _workouts(rows: list[dict]) -> list[WorkoutRecord]:
    return [WorkoutRecord.model_validate(row) for row in rows]


def get_current_workout(
    user_id: str,
    access_token: str,
    workout_id: str,
) -> WorkoutRecord | None:
    """return one unsuperseded user-owned workout"""

    rows = select_rows(
        "workouts",
        [
            ("select", WORKOUT_COLUMNS),
            ("id", f"eq.{workout_id}"),
            ("user_id", f"eq.{user_id}"),
            ("superseded_at", "is.null"),
            *NESTED_ORDER,
            ("limit", "1"),
        ],
        access_token,
    )
    return WorkoutRecord.model_validate(rows[0]) if rows else None


def get_workouts_in_range(
    user_id: str,
    access_token: str,
    start_date: date,
    end_date: date,
) -> list[WorkoutRecord]:
    """return unsuperseded workouts for an inclusive calendar range"""

    _validate_date_range(start_date, end_date)
    rows = select_rows(
        "workouts",
        [
            ("select", WORKOUT_COLUMNS),
            ("user_id", f"eq.{user_id}"),
            ("scheduled_date", f"gte.{start_date.isoformat()}"),
            ("scheduled_date", f"lte.{end_date.isoformat()}"),
            ("superseded_at", "is.null"),
            *NESTED_ORDER,
            ("order", "scheduled_date.asc,id.asc"),
        ],
        access_token,
    )
    return _workouts(rows)


def get_planned_workouts_for_replanning(
    user_id: str,
    access_token: str,
    effective_from: date,
    horizon_end: date,
) -> list[WorkoutRecord]:
    """return replaceable future workouts inside the requested planning horizon"""

    _validate_date_range(effective_from, horizon_end)
    rows = select_rows(
        "workouts",
        [
            ("select", WORKOUT_COLUMNS),
            ("user_id", f"eq.{user_id}"),
            ("status", "eq.planned"),
            ("scheduled_date", f"gte.{effective_from.isoformat()}"),
            ("scheduled_date", f"lte.{horizon_end.isoformat()}"),
            ("superseded_at", "is.null"),
            *NESTED_ORDER,
            ("order", "scheduled_date.asc,id.asc"),
        ],
        access_token,
    )
    return _workouts(rows)


def replace_planned_workouts(
    access_token: str,
    change_id: UUID,
    reason: str,
    effective_from: date,
    horizon_end: date,
    expected_workouts: list[WorkoutRecord],
    plan: PlannedWorkoutPlan,
) -> WorkoutWriteResult:
    """atomically replace planned workouts in a date range"""

    _validate_date_range(effective_from, horizon_end)
    if not reason.strip():
        raise ValueError("change reason is required")

    result = call_rpc(
        "replace_planned_workouts",
        {
            "p_change_id": str(change_id),
            "p_reason": reason,
            "p_effective_from": effective_from.isoformat(),
            "p_horizon_end": horizon_end.isoformat(),
            "p_expected_workout_ids": [str(workout.id) for workout in expected_workouts],
            "p_workouts": [
                workout.model_dump(mode="json", exclude_none=True)
                for workout in plan.workouts
            ],
        },
        access_token,
    )
    return WorkoutWriteResult.model_validate(result)


def get_recent_workouts(
    user_id: str,
    access_token: str,
    before_date: date,
    days: int = 30,
) -> list[WorkoutRecord]:
    """return recent unsuperseded workouts for planning context"""

    if not 1 <= days <= 366:
        raise ValueError("days must be between 1 and 366")

    rows = select_rows(
        "workouts",
        [
            ("select", WORKOUT_COLUMNS),
            ("user_id", f"eq.{user_id}"),
            ("scheduled_date", f"gte.{(before_date - timedelta(days=days - 1)).isoformat()}"),
            ("scheduled_date", f"lte.{before_date.isoformat()}"),
            ("superseded_at", "is.null"),
            *NESTED_ORDER,
            ("order", "scheduled_date.desc,id.desc"),
        ],
        access_token,
    )
    return _workouts(rows)
