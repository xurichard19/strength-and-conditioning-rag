# change history and version-based undo/redo

from uuid import UUID

from app.contracts import PlanningChangeRecord, PlanningChangeWorkoutRecord, WorkoutWriteResult
from app.db.supabase._queries import all_rows, identifier, page_limit
from app.db.supabase.transport import call_rpc, select_rows


CHANGE_COLUMNS = "id,user_id,revision,kind,status,reason,effective_from,effective_through,horizon_end_before,horizon_end_after,created_at"


def get_planning_change(user_id: str | UUID, change_id: str | UUID, access_token: str | None) -> PlanningChangeRecord | None:
    """
    read one user-owned planning change

    returns metadata for an applied, undone, or discarded change without filtering
    its status. to inspect the actual before/after content, load get_change_workouts
    and resolve those ids with workouts.get_workouts_by_ids. this read does not undo
    anything and does not establish that the change is currently eligible for undo.

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **change_id**: id of the user-owned planning change
    - **access_token**: verified user jwt for rls; none uses backend service-role credentials
    - **returns**: planning change, or none if no visible change matches
    """

    rows = select_rows("planning_changes", [("select", CHANGE_COLUMNS), ("user_id", f"eq.{identifier(user_id)}"),
        ("id", f"eq.{identifier(change_id)}"), ("limit", "1")], access_token)
    return PlanningChangeRecord.model_validate(rows[0]) if rows else None


def get_recent_planning_changes(
    user_id: str | UUID, access_token: str | None, limit: int = 20, *, before_revision: int | None = None,
) -> list[PlanningChangeRecord]:
    """
    read a history page newest first; use the last revision to fetch the next page

    returns all history statuses, including discarded redo branches, ordered by
    original commit revision descending. the cursor is the last record's revision,
    not the current schedule revision. undo/redo changes status but does not reorder
    the original revisions. an empty page means no more visible history. the caller
    must not assume the first item is eligible for undo; the rpc validates ordering.

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **access_token**: verified user jwt for rls; none uses backend service-role credentials
    - **limit**: maximum records to return, from 1 to 100
    - **before_revision**: exclusive revision cursor from the last change in the previous page
    - **returns**: history page ordered by descending revision
    """

    page_limit(limit)
    filters = [("select", CHANGE_COLUMNS), ("user_id", f"eq.{identifier(user_id)}"),
        ("order", "revision.desc"), ("limit", str(limit))]
    if before_revision is not None:
        filters.append(("revision", f"lt.{before_revision}"))
    return [PlanningChangeRecord.model_validate(row) for row in select_rows("planning_changes", filters, access_token)]


def get_change_workouts(user_id: str | UUID, change_id: str | UUID, access_token: str | None) -> list[PlanningChangeWorkoutRecord]:
    """
    read before/after workout references for a change

    returns lightweight links, not full workout trees. side=before identifies
    versions removed by this change and side=after identifies versions it introduced.
    unchanged workouts have no links. an empty result can mean a metadata-only change
    or a missing/inaccessible change; use get_planning_change if that distinction
    matters. resolve the ids with the historical workout reader for previews.

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **change_id**: id of the user-owned planning change
    - **access_token**: verified user jwt for rls; none uses backend service-role credentials
    - **returns**: before/after workout references ordered by side and workout id
    """

    rows = all_rows("planning_change_workouts", [("select", "change_id,workout_id,user_id,side"),
        ("user_id", f"eq.{identifier(user_id)}"), ("change_id", f"eq.{identifier(change_id)}"),
        ("order", "side.asc,workout_id.asc")], access_token)
    return [PlanningChangeWorkoutRecord.model_validate(row) for row in rows]


def undo_planning_change(user_id: str | UUID, change_id: str | UUID, expected_revision: int) -> WorkoutWriteResult:
    """
    undo the latest applied change without copying workouts

    backend-only transaction targeting the latest applied change, not an arbitrary
    historical row. reactivates before versions, deactivates after versions, restores
    the prior horizon, and increments the schedule revision without moving refresh
    cadence. neither side may contain recorded results.

    pass the revision the user reviewed. an out-of-order target, stale revision, or
    changed workout state conflicts. do not automatically repeat with a new revision:
    reload calendar/history first. consecutive undos target the next latest applied
    change with its newly read revision; no workout trees are copied.

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **change_id**: id of the user-owned planning change
    - **expected_revision**: planning revision the caller read; stale revisions are rejected
    - **returns**: change id, restored workout ids, and new planning revision
    """

    return WorkoutWriteResult.model_validate(call_rpc("undo_planning_change", {
        "p_user_id": identifier(user_id), "p_change_id": identifier(change_id),
        "p_expected_revision": expected_revision,
    }, None))


def redo_planning_change(user_id: str | UUID, change_id: str | UUID, expected_revision: int) -> WorkoutWriteResult:
    """
    redo the earliest undone change without copying workouts

    backend-only transaction targeting the earliest undone change. reactivates its
    after versions, deactivates before versions, restores its resulting horizon, and
    increments revision without moving refresh cadence. recorded results block the
    switch. a new committed planning change discards the redo branch.

    supply an explicit target and the revision the user reviewed. repeated calls with
    the old revision conflict rather than reapplying another change. refresh history
    and calendar after success or an ambiguous timeout before deciding on another redo.

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **change_id**: id of the user-owned planning change
    - **expected_revision**: planning revision the caller read; stale revisions are rejected
    - **returns**: change id, reactivated workout ids, and new planning revision
    """

    return WorkoutWriteResult.model_validate(call_rpc("redo_planning_change", {
        "p_user_id": identifier(user_id), "p_change_id": identifier(change_id),
        "p_expected_revision": expected_revision,
    }, None))
