from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.errors import PRIVATE_HEADERS, database_errors, private_response
from app.api.schemas import (
    AdjustmentRequest, ChangePreviewResponse, ChangeWriteResponse, HistoryResponse,
    JobResponse, RevisionRequest, ScheduleRequest, ScheduleResponse,
)
from app.auth.supabase import AuthUser, require_user
from app.auth.billing import require_paid_user
from app.db.supabase import planning_changes, planning_schedules, replan_jobs
from app.jobs.scheduler import dispatch_after_commit
from app.contracts import PlanningScheduleRecord


router = APIRouter(prefix="/planning", tags=["planning"],
    dependencies=[Depends(private_response), Depends(require_paid_user)])


def _schedule_response(schedule: PlanningScheduleRecord) -> ScheduleResponse:
    """ keep terminal first-plan failures visible after they leave the live jobs list

    - **schedule**: stored planning schedule and its coverage
    - **returns**: public schedule status including the first-plan state """
    response = ScheduleResponse.model_validate(schedule)
    if schedule.horizon_end is not None:
        response.initial_plan_status = "ready"
        return response
    job = replan_jobs.get_latest_initial_job(schedule.user_id)
    response.initial_plan_job = JobResponse.model_validate(job) if job is not None else None
    if job is not None and job.status == "running":
        response.initial_plan_status = "running"
    elif job is not None and job.status in ("failed", "cancelled"):
        response.initial_plan_status = "failed"
    elif schedule.billing_pause_reason is not None:
        response.initial_plan_status = "deferred"
    return response


@router.get("/schedule", response_model=ScheduleResponse | None)
def get_schedule(user: AuthUser = Depends(require_user)) -> ScheduleResponse | None:
    """ return schedule and revision, or null before setup

    - **user**: verified owner and jwt
    - **returns**: schedule including current revision, or null before setup """

    with database_errors("planning.get_schedule"):
        result = planning_schedules.get_planning_schedule(user.id, None)
        return _schedule_response(result) if result is not None else None


@router.put("/schedule", response_model=ScheduleResponse)
def configure_schedule(payload: ScheduleRequest, user: AuthUser = Depends(require_paid_user)) -> ScheduleResponse:
    """ set the refresh cadence. changed settings cancel outstanding refreshes. identical
    settings leave the schedule intact

    - **payload**: timezone-aware next refresh anchor, horizon and cadence days
    - **user**: verified owner; the handler uses backend credentials
    - **returns**: saved schedule; identical settings are a no-op """

    with database_errors("planning.configure_schedule"):
        result = planning_schedules.configure_planning_schedule(user.id, payload.next_refresh_at,
            payload.horizon_days, payload.refresh_interval_days)
        return _schedule_response(result)


@router.post("/adjustments", response_model=JobResponse, status_code=202)
def request_adjustment(payload: AdjustmentRequest, user: AuthUser = Depends(require_paid_user)) -> JobResponse:
    """ queue an adjustment within existing coverage. reuse the request key only for the same
    reason and date range

    - **payload**: request key, reason, and inclusive edit dates
    - **user**: verified owner; no client-supplied owner is accepted
    - **returns**: safe job status for polling, not a generated plan """

    with database_errors("planning.request_adjustment"):
        job = replan_jobs.enqueue_adjustment(user.id, payload.deduplication_key,
            payload.reason, payload.effective_from, payload.effective_through)

    dispatch_after_commit(job)
    return JobResponse.model_validate(job)


@router.get("/jobs", response_model=list[JobResponse])
def list_jobs(limit: int = Query(20, ge=1, le=100), user: AuthUser = Depends(require_user)) -> list[JobResponse]:
    """ list the owner's pending and running jobs, oldest first

    - **limit**: maximum jobs to return, 1-100
    - **user**: verified owner
    - **returns**: safe statuses; lease tokens, raw errors, and retry keys are omitted """

    with database_errors("planning.list_jobs"):
        return [JobResponse.model_validate(job) for job in replan_jobs.get_pending_replans(user.id, limit)]


@router.get("/jobs/{job_id}", response_model=JobResponse)
def get_job(job_id: UUID, user: AuthUser = Depends(require_user)) -> JobResponse:
    """ return job status, or 404 if the job is missing or past retention

    - **job_id**: owned job id returned by enqueue
    - **user**: verified owner
    - **returns**: safe status, or 404 when missing or removed by retention """

    with database_errors("planning.get_job"):
        result = replan_jobs.get_replan_job(user.id, job_id)
        if result is not None:
            return JobResponse.model_validate(result)
    raise HTTPException(404, "job not found", headers=PRIVATE_HEADERS)


@router.post("/jobs/{job_id}/cancel", response_model=JobResponse)
def cancel_job(job_id: UUID, user: AuthUser = Depends(require_user)) -> JobResponse:
    """ cancel live work. jobs that already finished keep their terminal status

    - **job_id**: owned job to cancel
    - **user**: verified owner
    - **returns**: cancelled or already-terminal job; inspect status rather than assuming cancellation """

    with database_errors("planning.cancel_job"):
        return JobResponse.model_validate(replan_jobs.cancel_replan_job(user.id, job_id))


@router.post("/jobs/{job_id}/retry", response_model=JobResponse, status_code=202)
def retry_job(job_id: UUID, user: AuthUser = Depends(require_paid_user)) -> JobResponse:
    """ requeue failed or cancelled work. live and successful jobs keep their status

    - **job_id**: owned job; obsolete refresh occurrences conflict
    - **user**: verified owner
    - **returns**: pending job or unchanged live/succeeded status; generation remains asynchronous """

    with database_errors("planning.retry_job"):
        job = replan_jobs.retry_replan_job(user.id, job_id)

    dispatch_after_commit(job)
    return JobResponse.model_validate(job)


@router.get("/changes", response_model=HistoryResponse)
def list_changes(
    limit: int = Query(20, ge=1, le=100), before_revision: int | None = Query(None, gt=0),
    user: AuthUser = Depends(require_user),
) -> HistoryResponse:
    """ page all changes by original commit revision. use the returned current revision for undo
    or redo

    - **limit**: maximum changes per page
    - **before_revision**: last change's original revision from the previous page
    - **user**: verified owner and jwt
    - **returns**: newest-first history and current revision; no eligibility guarantee """

    with database_errors("planning.list_changes"):
        return HistoryResponse.model_validate(
            planning_changes.get_history_page(user.id, None, limit, before_revision))


@router.get("/changes/{change_id}", response_model=ChangePreviewResponse)
def get_change(change_id: UUID, user: AuthUser = Depends(require_user)) -> ChangePreviewResponse:
    """ return before and after workout versions with the current revision, or 404 for an
    unknown change

    - **change_id**: owned change to preview
    - **user**: verified owner and jwt
    - **returns**: metadata, before/after workouts, and revision; 404 when missing """

    with database_errors("planning.get_change"):
        result = planning_changes.get_change_preview(user.id, change_id, None)
        if result is None:
            raise HTTPException(404, "change not found", headers=PRIVATE_HEADERS)
        return ChangePreviewResponse.model_validate(result)


@router.post("/changes/{change_id}/undo", response_model=ChangeWriteResponse)
def undo_change(change_id: UUID, payload: RevisionRequest, user: AuthUser = Depends(require_user)) -> ChangeWriteResponse:
    """ undo the latest applied change at the reviewed revision. recorded results or stale
    history cause a conflict

    - **change_id**: explicit latest applied target
    - **payload**: revision from the history/calendar the user reviewed
    - **user**: verified owner
    - **returns**: receipt/new revision; stale, out-of-order, or performed targets conflict """

    with database_errors("planning.undo_change"):
        return ChangeWriteResponse.model_validate(
            planning_changes.undo_planning_change(user.id, change_id, payload.expected_revision))


@router.post("/changes/{change_id}/redo", response_model=ChangeWriteResponse)
def redo_change(change_id: UUID, payload: RevisionRequest, user: AuthUser = Depends(require_user)) -> ChangeWriteResponse:
    """ redo the earliest undone change at the reviewed revision. a new commit discards the redo
    branch

    - **change_id**: explicit earliest undone target
    - **payload**: revision from current history/calendar; reload after conflicts
    - **user**: verified owner
    - **returns**: receipt/new revision; does not move refresh cadence or restore deleted sports """

    with database_errors("planning.redo_change"):
        return ChangeWriteResponse.model_validate(
            planning_changes.redo_planning_change(user.id, change_id, payload.expected_revision))
