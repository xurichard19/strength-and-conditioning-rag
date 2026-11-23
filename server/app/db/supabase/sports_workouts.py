# user-entered sports commitments

from datetime import date, datetime, UTC
from uuid import UUID

from app.contracts import SportsWorkoutInput, SportsWorkoutRecord, SportsWorkoutStatus, SportsWorkoutUpdate
from app.db.supabase._queries import all_rows, date_range, identifier
from app.db.supabase.transport import SupabaseDataError, delete_rows, insert_rows, select_rows, update_rows


SPORTS_COLUMNS = "id,user_id,sport,scheduled_date,start_time,planned_duration_minutes,intensity,status,notes,completed_at,cancelled_at,created_at,updated_at"


def get_sports_workout(user_id: str | UUID, workout_id: str | UUID, access_token: str | None) -> SportsWorkoutRecord | None:
    """ read one commitment by owner and id, including cancelled sessions

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **workout_id**: id of the user-owned workout
    - **access_token**: verified user jwt for rls; none uses backend service-role credentials
    - **returns**: sports commitment, or none if no visible row matches """

    rows = select_rows("sports_workouts", [("select", SPORTS_COLUMNS), ("user_id", f"eq.{identifier(user_id)}"),
        ("id", f"eq.{identifier(workout_id)}"), ("limit", "1")], access_token)
    return SportsWorkoutRecord.model_validate(rows[0]) if rows else None


def get_sports_workouts_in_range(
    user_id: str | UUID, start_date: date, end_date: date, access_token: str | None,
) -> list[SportsWorkoutRecord]:
    """ read non-cancelled sports commitments over inclusive local dates, including completed
    sessions

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **start_date**: first calendar date to include
    - **end_date**: last calendar date to include
    - **access_token**: verified user jwt for rls; none uses backend service-role credentials
    - **returns**: all non-cancelled commitments ordered by date, start time, and id """

    date_range(start_date, end_date)
    rows = all_rows("sports_workouts", [("select", SPORTS_COLUMNS), ("user_id", f"eq.{identifier(user_id)}"),
        ("scheduled_date", f"gte.{start_date.isoformat()}"), ("scheduled_date", f"lte.{end_date.isoformat()}"),
        ("status", "neq.cancelled"), ("order", "scheduled_date.asc,start_time.asc.nullslast,id.asc")], access_token)
    return [SportsWorkoutRecord.model_validate(row) for row in rows]


def create_sports_workout(user_id: str | UUID, values: SportsWorkoutInput, access_token: str | None) -> SportsWorkoutRecord:
    """ create a commitment and queue any covered adjustment atomically. retry with the same id
    and original fields after a lost response. conflicting reuse raises 409

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **values**: stable client uuid, sport, date, and optional commitment details
    - **access_token**: user jwt, or none for backend credentials after owner authorization
    - **returns**: saved commitment including its id and database timestamps """

    try:
        rows = insert_rows("sports_workouts", {"user_id": identifier(user_id), **values.model_dump(mode="json")}, access_token)
    except SupabaseDataError as exc:
        if exc.code != "23505":
            raise
        existing = get_sports_workout(user_id, values.id, access_token)
        if existing is not None and existing.model_dump(include=set(SportsWorkoutInput.model_fields)) == values.model_dump():
            return existing
        raise SupabaseDataError("sports workout id already used", status_code=409) from exc

    if not rows:
        raise SupabaseDataError("sports workout write returned no rows")
    return SportsWorkoutRecord.model_validate(rows[0])


def update_sports_workout(
    user_id: str | UUID, workout_id: str | UUID, values: SportsWorkoutUpdate, access_token: str | None,
) -> SportsWorkoutRecord | None:
    """ patch supplied fields. explicit null clears optional values. concurrent edits are
    last-write-wins and date changes can affect both old and new dates

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **workout_id**: id of the user-owned workout
    - **values**: validated fields to save; omitted fields stay unchanged and explicit nulls clear
      nullable fields
    - **access_token**: user jwt, or none for backend credentials after owner authorization
    - **returns**: updated commitment, or none if no visible row matches """

    payload = values.model_dump(mode="json", exclude_unset=True)
    if not payload:
        raise ValueError("sports workout update is empty")

    rows = update_rows("sports_workouts", payload, [("id", f"eq.{identifier(workout_id)}"),
        ("user_id", f"eq.{identifier(user_id)}")], access_token)
    return SportsWorkoutRecord.model_validate(rows[0]) if rows else None


def set_sports_workout_status(
    user_id: str | UUID, workout_id: str | UUID, status: SportsWorkoutStatus, access_token: str | None,
) -> SportsWorkoutRecord | None:
    """ change status and its timestamps. repeated writes reset the timestamp. cancellation and
    reinstatement can queue an adjustment, while completion only invalidates inputs

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **workout_id**: id of the user-owned workout
    - **status**: planned, completed, or cancelled; timestamps are adjusted consistently
    - **access_token**: user jwt, or none for backend credentials after owner authorization
    - **returns**: updated commitment, or none if no visible row matches """

    if status not in ("planned", "completed", "cancelled"):
        raise ValueError("invalid sports workout status")

    now = datetime.now(UTC).isoformat()
    rows = update_rows("sports_workouts", {"status": status,
        "completed_at": now if status == "completed" else None,
        "cancelled_at": now if status == "cancelled" else None},
        [("id", f"eq.{identifier(workout_id)}"), ("user_id", f"eq.{identifier(user_id)}")], access_token)
    return SportsWorkoutRecord.model_validate(rows[0]) if rows else None


def delete_sports_workout(user_id: str | UUID, workout_id: str | UUID, access_token: str | None) -> SportsWorkoutRecord | None:
    """ permanently delete a commitment and return its previous values. a repeated delete
    returns none. planning undo cannot restore this row

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **workout_id**: id of the user-owned workout
    - **access_token**: user jwt, or none for backend credentials after owner authorization
    - **returns**: deleted commitment, or none if no visible row matches """

    rows = delete_rows("sports_workouts", [("id", f"eq.{identifier(workout_id)}"),
        ("user_id", f"eq.{identifier(user_id)}")], access_token)
    return SportsWorkoutRecord.model_validate(rows[0]) if rows else None
