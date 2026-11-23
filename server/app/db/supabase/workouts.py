# calendar, planning history, and workout results

from datetime import date, timedelta
from uuid import UUID

from pydantic import TypeAdapter

from app.contracts import ExerciseSetResult, WorkoutRecord, WorkoutSnapshot, WorkoutStatus
from app.db.supabase._queries import all_rows, date_range, identifier, read_with_revision
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
    """ load one visible workout with ordered exercises and sets. historical versions require
    explicit inclusion

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **workout_id**: id of the user-owned workout
    - **access_token**: verified user jwt for rls; none uses backend service-role credentials
    - **current_only**: exclude superseded versions when true; false also allows historical versions
    - **returns**: workout with ordered exercises and sets, or none if not found or excluded """

    filters = [("select", WORKOUT_COLUMNS), ("user_id", f"eq.{identifier(user_id)}"),
        ("id", f"eq.{identifier(workout_id)}"), *NESTED_ORDER, ("limit", "1")]
    if current_only:
        filters.append(("superseded_at", "is.null"))
    rows = select_rows("workouts", filters, access_token)
    return WorkoutRecord.model_validate(rows[0]) if rows else None


def get_workout_snapshot(user_id: str | UUID, workout_id: UUID, access_token: str | None) -> WorkoutSnapshot | None:
    """ read a current workout with its revision.
    missing workouts return none and a revision change during the read raises 409

    - **user_id**: authenticated owner
    - **workout_id**: current workout version to display
    - **access_token**: caller jwt or none for backend access
    - **returns**: workout/revision, none if missing, or a 409 if inputs changed during reading """

    workout, revision = read_with_revision(user_id, access_token,
        lambda: get_workout(user_id, workout_id, access_token))
    return WorkoutSnapshot(workout=workout, revision=revision) if workout else None


def get_workouts_by_ids(user_id: str | UUID, workout_ids: list[UUID], access_token: str | None) -> list[WorkoutRecord]:
    """ resolve historical ids, including superseded versions. missing ids are omitted and
    results are sorted by date and id

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **workout_ids**: workout version ids to read; duplicates are removed
    - **access_token**: verified user jwt for rls; none uses backend service-role credentials
    - **returns**: matching current/historical workouts ordered by date and id; missing ids are omitted """

    ids = list(dict.fromkeys(identifier(value) for value in workout_ids))
    rows = []

    for start in range(0, len(ids), 50):
        batch = ids[start:start + 50]
        rows.extend(all_rows("workouts", [("select", WORKOUT_COLUMNS),
            ("user_id", f"eq.{identifier(user_id)}"), ("id", f"in.({','.join(batch)})"),
            *NESTED_ORDER, ("order", "scheduled_date.asc,id.asc")], access_token, max_rows=len(batch)))

    return sorted((WorkoutRecord.model_validate(row) for row in rows), key=lambda row: (row.scheduled_date, row.id))


def get_workouts_in_range(
    user_id: str | UUID, start_date: date, end_date: date, access_token: str | None,
    *, planned_only: bool = False,
) -> list[WorkoutRecord]:
    """ load current workout versions for inclusive local dates. paginated reads can span
    revisions. planning publication still checks for recorded results

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **start_date**: first calendar date to include
    - **end_date**: last calendar date to include
    - **access_token**: verified user jwt for rls; none uses backend service-role credentials
    - **planned_only**: only return workouts with planned status when true
    - **returns**: all current matching workouts ordered by date and id, with exercises and sets """

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
    """ load current versions across all statuses for the window ending on the athlete's local
    date

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **through_date**: last date of the history window, inclusive
    - **access_token**: verified user jwt for rls; none uses backend service-role credentials
    - **days**: number of calendar days to include, from 1 to 366
    - **returns**: current workouts and results ordered oldest to newest within the history window """

    if not 1 <= days <= 366:
        raise ValueError("days must be between 1 and 366")
    return get_workouts_in_range(user_id, through_date - timedelta(days=days - 1), through_date, access_token)


def record_workout_results(
    user_id: str | UUID, workout_id: str | UUID, expected_revision: int,
    status: WorkoutStatus, sets: list[ExerciseSetResult] | None = None,
) -> int:
    """ save status and results at the expected revision. each supplied set replaces all its
    actual values. omitted sets are untouched. reload after a conflict or uncertain response

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **workout_id**: id of the user-owned workout
    - **expected_revision**: planning revision the caller read; stale revisions are rejected
    - **status**: new workout status
    - **sets**: full results for supplied sets; omitted values clear old results and omitted sets stay
      unchanged
    - **returns**: new planning revision after the atomic result update """

    return TypeAdapter(int).validate_python(call_rpc("record_workout_results", {
        "p_user_id": identifier(user_id), "p_workout_id": identifier(workout_id),
        "p_expected_revision": expected_revision, "p_status": status,
        "p_sets": [item.model_dump(mode="json") for item in sets or []],
    }, None), strict=True)
