# user-entered sports commitments

from datetime import date, datetime, UTC
from uuid import UUID

from app.contracts import SportsWorkoutInput, SportsWorkoutRecord, SportsWorkoutStatus, SportsWorkoutUpdate
from app.db.supabase._queries import all_rows, date_range, identifier
from app.db.supabase.transport import SupabaseDataError, delete_rows, insert_rows, select_rows, update_rows


SPORTS_COLUMNS = "id,user_id,sport,scheduled_date,start_time,planned_duration_minutes,intensity,status,notes,completed_at,cancelled_at,created_at,updated_at"


def get_sports_workout(user_id: str | UUID, workout_id: str | UUID, access_token: str | None) -> SportsWorkoutRecord | None:
    """read one user-owned sports commitment"""

    rows = select_rows("sports_workouts", [("select", SPORTS_COLUMNS), ("user_id", f"eq.{identifier(user_id)}"),
        ("id", f"eq.{identifier(workout_id)}"), ("limit", "1")], access_token)
    return SportsWorkoutRecord.model_validate(rows[0]) if rows else None


def get_sports_workouts_in_range(
    user_id: str | UUID, start_date: date, end_date: date, access_token: str | None,
) -> list[SportsWorkoutRecord]:
    """read non-cancelled sports commitments in an inclusive calendar range"""

    date_range(start_date, end_date)
    rows = all_rows("sports_workouts", [("select", SPORTS_COLUMNS), ("user_id", f"eq.{identifier(user_id)}"),
        ("scheduled_date", f"gte.{start_date.isoformat()}"), ("scheduled_date", f"lte.{end_date.isoformat()}"),
        ("status", "neq.cancelled"), ("order", "scheduled_date.asc,start_time.asc.nullslast,id.asc")], access_token)
    return [SportsWorkoutRecord.model_validate(row) for row in rows]


def create_sports_workout(user_id: str | UUID, values: SportsWorkoutInput, access_token: str) -> SportsWorkoutRecord:
    """save a sports commitment and invalidate in-flight planning through the database trigger"""

    rows = insert_rows("sports_workouts", {"user_id": identifier(user_id), **values.model_dump(mode="json")}, access_token)
    if not rows:
        raise SupabaseDataError("sports workout write returned no rows")
    return SportsWorkoutRecord.model_validate(rows[0])


def update_sports_workout(
    user_id: str | UUID, workout_id: str | UUID, values: SportsWorkoutUpdate, access_token: str,
) -> SportsWorkoutRecord | None:
    """update supplied commitment fields, including explicit nulls to clear optional values"""

    payload = values.model_dump(mode="json", exclude_unset=True)
    if not payload:
        raise ValueError("sports workout update is empty")
    rows = update_rows("sports_workouts", payload, [("id", f"eq.{identifier(workout_id)}"),
        ("user_id", f"eq.{identifier(user_id)}")], access_token)
    return SportsWorkoutRecord.model_validate(rows[0]) if rows else None


def set_sports_workout_status(
    user_id: str | UUID, workout_id: str | UUID, status: SportsWorkoutStatus, access_token: str,
) -> SportsWorkoutRecord | None:
    """set commitment status and keep completion/cancellation timestamps consistent"""

    if status not in ("planned", "completed", "cancelled"):
        raise ValueError("invalid sports workout status")
    now = datetime.now(UTC).isoformat()
    rows = update_rows("sports_workouts", {"status": status,
        "completed_at": now if status == "completed" else None,
        "cancelled_at": now if status == "cancelled" else None},
        [("id", f"eq.{identifier(workout_id)}"), ("user_id", f"eq.{identifier(user_id)}")], access_token)
    return SportsWorkoutRecord.model_validate(rows[0]) if rows else None


def delete_sports_workout(user_id: str | UUID, workout_id: str | UUID, access_token: str) -> SportsWorkoutRecord | None:
    """delete one user-owned sports commitment"""

    rows = delete_rows("sports_workouts", [("id", f"eq.{identifier(workout_id)}"),
        ("user_id", f"eq.{identifier(user_id)}")], access_token)
    return SportsWorkoutRecord.model_validate(rows[0]) if rows else None
