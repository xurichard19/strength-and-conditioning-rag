# user-entered sports commitments

from datetime import date, datetime, UTC
from uuid import UUID

from app.contracts import SportsWorkoutInput, SportsWorkoutRecord, SportsWorkoutStatus, SportsWorkoutUpdate
from app.db.supabase._queries import all_rows, date_range, identifier
from app.db.supabase.transport import SupabaseDataError, delete_rows, insert_rows, select_rows, update_rows


SPORTS_COLUMNS = "id,user_id,sport,scheduled_date,start_time,planned_duration_minutes,intensity,status,notes,completed_at,cancelled_at,created_at,updated_at"


def get_sports_workout(user_id: str | UUID, workout_id: str | UUID, access_token: str | None) -> SportsWorkoutRecord | None:
    """
    read one user-owned sports commitment

    loads a single commitment by owner and id, including cancelled commitments.
    use for detail/edit screens where hiding a cancelled row would be misleading.
    returns none for missing/inaccessible rows; it does not change planning inputs.

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **workout_id**: id of the user-owned workout
    - **access_token**: verified user jwt for rls; none uses backend service-role credentials
    - **returns**: sports commitment, or none if no visible row matches
    """

    rows = select_rows("sports_workouts", [("select", SPORTS_COLUMNS), ("user_id", f"eq.{identifier(user_id)}"),
        ("id", f"eq.{identifier(workout_id)}"), ("limit", "1")], access_token)
    return SportsWorkoutRecord.model_validate(rows[0]) if rows else None


def get_sports_workouts_in_range(
    user_id: str | UUID, start_date: date, end_date: date, access_token: str | None,
) -> list[SportsWorkoutRecord]:
    """
    read non-cancelled sports commitments in an inclusive calendar range

    returns commitments the planner/calendar should still see; cancelled rows are
    excluded but completed sessions remain. dates are inclusive and not timezone
    converted. results are ordered by date, start time (null last), then id, across
    all pages. this is not a transaction snapshot.

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **start_date**: first calendar date to include
    - **end_date**: last calendar date to include
    - **access_token**: verified user jwt for rls; none uses backend service-role credentials
    - **returns**: all non-cancelled commitments ordered by date, start time, and id
    """

    date_range(start_date, end_date)
    rows = all_rows("sports_workouts", [("select", SPORTS_COLUMNS), ("user_id", f"eq.{identifier(user_id)}"),
        ("scheduled_date", f"gte.{start_date.isoformat()}"), ("scheduled_date", f"lte.{end_date.isoformat()}"),
        ("status", "neq.cancelled"), ("order", "scheduled_date.asc,start_time.asc.nullslast,id.asc")], access_token)
    return [SportsWorkoutRecord.model_validate(row) for row in rows]


def create_sports_workout(user_id: str | UUID, values: SportsWorkoutInput, access_token: str) -> SportsWorkoutRecord:
    """
    save a sports commitment and invalidate in-flight planning through the database trigger

    inserts one user-owned commitment with planned status supplied by the database.
    the input contains sport, local calendar date/time, and optional duration,
    intensity, and notes; no generated plan workout is created here.

    the database trigger invalidates planning inputs by bumping revision. enqueue
    any warranted adjustment separately after this succeeds. no request key is used:
    retrying after a timeout may duplicate the commitment.

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **values**: validated sport, date, and optional commitment details
    - **access_token**: verified user jwt used to enforce rls
    - **returns**: saved commitment including its id and database timestamps
    """

    rows = insert_rows("sports_workouts", {"user_id": identifier(user_id), **values.model_dump(mode="json")}, access_token)
    if not rows:
        raise SupabaseDataError("sports workout write returned no rows")
    return SportsWorkoutRecord.model_validate(rows[0])


def update_sports_workout(
    user_id: str | UUID, workout_id: str | UUID, values: SportsWorkoutUpdate, access_token: str,
) -> SportsWorkoutRecord | None:
    """
    update supplied commitment fields, including explicit nulls to clear optional values

    patches only supplied editable fields; omitted values remain unchanged and
    explicit null clears nullable fields. sport and scheduled_date cannot be null.
    status is deliberately excluded; use set_sports_workout_status for timestamps.

    an empty patch raises valueerror before writing. a database trigger invalidates
    planning inputs, but no replan is enqueued. updates have no expected-revision
    guard: concurrent edits are last-write-wins, including a replay after a timeout.

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **workout_id**: id of the user-owned workout
    - **values**: validated fields to save; omitted fields stay unchanged and explicit nulls clear nullable fields
    - **access_token**: verified user jwt used to enforce rls
    - **returns**: updated commitment, or none if no visible row matches
    """

    payload = values.model_dump(mode="json", exclude_unset=True)
    if not payload:
        raise ValueError("sports workout update is empty")
    rows = update_rows("sports_workouts", payload, [("id", f"eq.{identifier(workout_id)}"),
        ("user_id", f"eq.{identifier(user_id)}")], access_token)
    return SportsWorkoutRecord.model_validate(rows[0]) if rows else None


def set_sports_workout_status(
    user_id: str | UUID, workout_id: str | UUID, status: SportsWorkoutStatus, access_token: str,
) -> SportsWorkoutRecord | None:
    """
    set commitment status and keep completion/cancellation timestamps consistent

    sets planned, completed, or cancelled with matching timestamps. completed uses
    the current utc time and clears cancelled_at; cancelled does the opposite;
    planned clears both. repeated writes reset timestamps, so this is not an
    idempotent event recorder.

    the database trigger bumps planning revision; enqueue any adjustment separately.
    invalid status raises valueerror before writing. this does not update an app
    workout or save exercise-set results.

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **workout_id**: id of the user-owned workout
    - **status**: planned, completed, or cancelled; timestamps are adjusted consistently
    - **access_token**: verified user jwt used to enforce rls
    - **returns**: updated commitment, or none if no visible row matches
    """

    if status not in ("planned", "completed", "cancelled"):
        raise ValueError("invalid sports workout status")
    now = datetime.now(UTC).isoformat()
    rows = update_rows("sports_workouts", {"status": status,
        "completed_at": now if status == "completed" else None,
        "cancelled_at": now if status == "cancelled" else None},
        [("id", f"eq.{identifier(workout_id)}"), ("user_id", f"eq.{identifier(user_id)}")], access_token)
    return SportsWorkoutRecord.model_validate(rows[0]) if rows else None


def delete_sports_workout(user_id: str | UUID, workout_id: str | UUID, access_token: str) -> SportsWorkoutRecord | None:
    """
    delete one user-owned sports commitment

    permanently deletes the commitment and returns its last stored values; use
    cancelled status instead when it should remain available for later inspection.
    the database trigger invalidates planning inputs, but does not enqueue a replan.
    a repeated delete returns none once the row is gone. planning-change undo only
    switches generated workout versions; it cannot restore this deleted sports row.

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **workout_id**: id of the user-owned workout
    - **access_token**: verified user jwt used to enforce rls
    - **returns**: deleted commitment, or none if no visible row matches
    """

    rows = delete_rows("sports_workouts", [("id", f"eq.{identifier(workout_id)}"),
        ("user_id", f"eq.{identifier(user_id)}")], access_token)
    return SportsWorkoutRecord.model_validate(rows[0]) if rows else None
