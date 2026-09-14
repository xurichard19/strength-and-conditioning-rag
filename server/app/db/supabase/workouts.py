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
    """
    read one workout; set current_only false to inspect a historical version

    use for a workout detail screen or an explicit history preview. includes nested
    exercises and sets in order_index order, not just the calendar summary. current
    means superseded_at is null; completed and skipped workouts are still current.
    returns none for missing, hidden, or excluded rows without distinguishing them.

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **workout_id**: id of the user-owned workout
    - **access_token**: verified user jwt for rls; none uses backend service-role credentials
    - **current_only**: exclude superseded versions when true; false also allows historical versions
    - **returns**: workout with ordered exercises and sets, or none if not found or excluded
    """

    filters = [("select", WORKOUT_COLUMNS), ("user_id", f"eq.{identifier(user_id)}"),
        ("id", f"eq.{identifier(workout_id)}"), *NESTED_ORDER, ("limit", "1")]
    if current_only:
        filters.append(("superseded_at", "is.null"))
    rows = select_rows("workouts", filters, access_token)
    return WorkoutRecord.model_validate(rows[0]) if rows else None


def get_workouts_by_ids(user_id: str | UUID, workout_ids: list[UUID], access_token: str | None) -> list[WorkoutRecord]:
    """
    read current or historical versions in bounded batches for change previews

    use the ids from get_change_workouts to resolve a before/after preview. unlike
    calendar reads, this deliberately includes superseded versions. deduplicates ids,
    requests batches of 50 to bound url length, then sorts the combined result by date
    and id rather than input order. an empty input makes no database request. missing
    or inaccessible ids are omitted; callers needing an exact match must check them.

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **workout_ids**: workout version ids to read; duplicates are removed
    - **access_token**: verified user jwt for rls; none uses backend service-role credentials
    - **returns**: matching current/historical workouts ordered by date and id; missing ids are omitted
    """

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
    """
    read current calendar workouts in an inclusive range; optionally only planned ones

    use for calendar display, or pass planned_only=true to load replan candidates.
    dates are inclusive user-calendar dates; this function performs no timezone
    conversion. superseded versions are always excluded, while completed, skipped,
    and in-progress workouts remain visible unless planned_only is enabled.
    loads every matching page with ordered exercises and sets. the reads are not one
    database snapshot; planners should use get_replan_context and the publication
    revision guard. status alone is not proof a workout is safe to replace: the rpc
    also checks for recorded results.

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **start_date**: first calendar date to include
    - **end_date**: last calendar date to include
    - **access_token**: verified user jwt for rls; none uses backend service-role credentials
    - **planned_only**: only return workouts with planned status when true
    - **returns**: all current matching workouts ordered by date and id, with exercises and sets
    """

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
    """
    read recent current workouts and results for planning context

    loads the inclusive window [through_date - days + 1, through_date]. this is
    training context, not a completed-only history: current planned, in-progress,
    completed, and skipped workouts can all appear. includes their set results and
    excludes superseded versions. use the athlete's local date, not server utc today.

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **through_date**: last date of the history window, inclusive
    - **access_token**: verified user jwt for rls; none uses backend service-role credentials
    - **days**: number of calendar days to include, from 1 to 366
    - **returns**: current workouts and results ordered oldest to newest within the history window
    """

    if not 1 <= days <= 366:
        raise ValueError("days must be between 1 and 366")
    return get_workouts_in_range(user_id, through_date - timedelta(days=days - 1), through_date, access_token)


def record_workout_results(
    user_id: str | UUID, workout_id: str | UUID, expected_revision: int,
    status: WorkoutStatus, sets: list[ExerciseSetResult] | None = None,
) -> int:
    """
    atomically save workout status and supplied set results; return the new revision

    backend-only transaction; authorize the user before calling. saves status,
    status timestamps, and the supplied sets' complete actual-result values together,
    then increments the planning revision to invalidate older proposals. it never
    edits planned prescriptions. each set must belong to this current workout.

    this is not a partial patch within a supplied set: include every actual value
    you want to keep. omitted sets are untouched. a stale revision or superseded
    workout is rejected; reload before deciding whether to submit again. after a
    timeout, read the workout and revision because the transaction may have committed.

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **workout_id**: id of the user-owned workout
    - **expected_revision**: planning revision the caller read; stale revisions are rejected
    - **status**: new workout status
    - **sets**: full results for supplied sets; omitted values clear old results and omitted sets stay unchanged
    - **returns**: new planning revision after the atomic result update
    """

    return TypeAdapter(int).validate_python(call_rpc("record_workout_results", {
        "p_user_id": identifier(user_id), "p_workout_id": identifier(workout_id),
        "p_expected_revision": expected_revision, "p_status": status,
        "p_sets": [item.model_dump(mode="json") for item in sets or []],
    }, None), strict=True)
