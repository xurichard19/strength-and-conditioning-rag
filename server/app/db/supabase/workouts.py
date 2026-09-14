# calendar, planning history, and workout results

from datetime import date, timedelta
from uuid import UUID

from pydantic import TypeAdapter

from app.contracts import ExerciseSetResult, WorkoutRecord, WorkoutStatus
from app.db.supabase._queries import all_rows, date_range, identifier
from app.db.supabase.transport import call_rpc, select_rows


WORKOUT_COLUMNS = (
    "id,user_id,created_by_change_id,scheduled_date,name,status,notes,"
    "started_at,completed_at,skipped_at,superseded_at,created_at,updated_at,"
    "exercises(id,workout_id,order_index,name,reps_per_side,weight_unit,distance_unit,"
    "notes,created_at,updated_at,sets:exercise_sets(*))"
)
NESTED_ORDER = [("exercises.order", "order_index.asc"), ("exercises.sets.order", "order_index.asc")]


def get_workout(
    user_id: str | UUID, workout_id: str | UUID, access_token: str | None, *, current_only: bool = True,
) -> WorkoutRecord | None:
    """read one workout; set current_only false to inspect a historical version"""

    filters = [("select", WORKOUT_COLUMNS), ("user_id", f"eq.{identifier(user_id)}"),
        ("id", f"eq.{identifier(workout_id)}"), *NESTED_ORDER, ("limit", "1")]
    if current_only:
        filters.append(("superseded_at", "is.null"))
    rows = select_rows("workouts", filters, access_token)
    return WorkoutRecord.model_validate(rows[0]) if rows else None


def get_workouts_by_ids(user_id: str | UUID, workout_ids: list[UUID], access_token: str | None) -> list[WorkoutRecord]:
    """read current or historical versions in bounded batches for change previews"""

    ids = list(dict.fromkeys(identifier(value) for value in workout_ids))
    rows = []
    for start in range(0, len(ids), 50):
        rows.extend(all_rows("workouts", [("select", WORKOUT_COLUMNS),
            ("user_id", f"eq.{identifier(user_id)}"), ("id", f"in.({','.join(ids[start:start + 50])})"),
            *NESTED_ORDER, ("order", "scheduled_date.asc,id.asc")], access_token))
    return sorted((WorkoutRecord.model_validate(row) for row in rows), key=lambda row: (row.scheduled_date, row.id))


def get_workouts_in_range(
    user_id: str | UUID, start_date: date, end_date: date, access_token: str | None,
    *, planned_only: bool = False,
) -> list[WorkoutRecord]:
    """read current calendar workouts in an inclusive range; optionally only planned ones"""

    date_range(start_date, end_date)
    filters = [("select", WORKOUT_COLUMNS), ("user_id", f"eq.{identifier(user_id)}"),
        ("scheduled_date", f"gte.{start_date.isoformat()}"), ("scheduled_date", f"lte.{end_date.isoformat()}"),
        ("superseded_at", "is.null"), *NESTED_ORDER, ("order", "scheduled_date.asc,id.asc")]
    if planned_only:
        filters.append(("status", "eq.planned"))
    return [WorkoutRecord.model_validate(row) for row in all_rows("workouts", filters, access_token)]


def get_recent_workouts(
    user_id: str | UUID, through_date: date, access_token: str | None, days: int = 30,
) -> list[WorkoutRecord]:
    """read recent current workouts and results for planning context"""

    if not 1 <= days <= 366:
        raise ValueError("days must be between 1 and 366")
    return get_workouts_in_range(user_id, through_date - timedelta(days=days - 1), through_date, access_token)


def record_workout_results(
    user_id: str | UUID, workout_id: str | UUID, expected_revision: int,
    status: WorkoutStatus, sets: list[ExerciseSetResult] | None = None,
) -> int:
    """atomically save workout status and supplied set results; return the new revision"""

    return TypeAdapter(int).validate_python(call_rpc("record_workout_results", {
        "p_user_id": identifier(user_id), "p_workout_id": identifier(workout_id),
        "p_expected_revision": expected_revision, "p_status": status,
        "p_sets": [item.model_dump(mode="json") for item in sets or []],
    }, None), strict=True)
