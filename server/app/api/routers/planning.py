from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.errors import PRIVATE_HEADERS, database_errors, private_response
from app.api.schemas import (
    AdjustmentRequest, ChangePreviewResponse, ChangeWriteResponse, HistoryResponse,
    JobResponse, RevisionRequest, ScheduleRequest, ScheduleResponse,
)
from app.auth.supabase import AuthUser, require_user
from app.db.supabase import planning_changes, planning_schedules, replan_jobs


router = APIRouter(prefix="/planning", tags=["planning"], dependencies=[Depends(private_response)])


@router.get("/schedule", response_model=ScheduleResponse | None)
def get_schedule(user: AuthUser = Depends(require_user)) -> ScheduleResponse | None:
    """
    read rolling coverage and refresh settings for the current user

    - **user**: verified owner and jwt
    - **returns**: schedule including current revision, or null before setup
    """

    with database_errors("planning.get_schedule"):
        result = planning_schedules.get_planning_schedule(user.id, user.access_token)
        return ScheduleResponse.model_validate(result) if result is not None else None


@router.put("/schedule", response_model=ScheduleResponse)
def configure_schedule(payload: ScheduleRequest, user: AuthUser = Depends(require_user)) -> ScheduleResponse:
    """
    initialize or explicitly change refresh settings, not generate workouts

    for initial generation configure a due next_refresh_at; the scheduler will
    enqueue it on its next pass. an existing setting change cancels outstanding
    refresh jobs. do not call this on ordinary adjustments or move the cadence
    merely to request more generation. worker/scheduler execution is separate.

    - **payload**: timezone-aware next refresh anchor, horizon and cadence days
    - **user**: verified owner; the handler uses backend credentials
    - **returns**: saved schedule; identical settings are a no-op
    """

    with database_errors("planning.configure_schedule"):
        return ScheduleResponse.model_validate(planning_schedules.configure_planning_schedule(user.id, payload.next_refresh_at,
            payload.horizon_days, payload.refresh_interval_days))


@router.post("/adjustments", response_model=JobResponse, status_code=202)
def request_adjustment(payload: AdjustmentRequest, user: AuthUser = Depends(require_user)) -> JobResponse:
    """
    accept an explicit adjustment request within existing coverage

    persist any triggering input before calling. does not extend the horizon,
    change cadence, or generate synchronously. reuse a request key only for the
    same reason/window; an existing terminal job may be returned on a retry.

    - **payload**: request key, reason, and inclusive edit dates
    - **user**: verified owner; no client-supplied owner is accepted
    - **returns**: safe job status for polling, not a generated plan
    """

    with database_errors("planning.request_adjustment"):
        return JobResponse.model_validate(replan_jobs.enqueue_adjustment(user.id, payload.deduplication_key,
            payload.reason, payload.effective_from, payload.effective_through))


@router.get("/jobs", response_model=list[JobResponse])
def list_jobs(limit: int = Query(20, ge=1, le=100), user: AuthUser = Depends(require_user)) -> list[JobResponse]:
    """
    list a bounded oldest-first page of pending/running jobs; not all historical jobs

    - **limit**: maximum jobs to return, 1-100
    - **user**: verified owner
    - **returns**: safe statuses; lease tokens, raw errors, and retry keys are omitted
    """

    with database_errors("planning.list_jobs"):
        return [JobResponse.model_validate(job) for job in replan_jobs.get_pending_replans(user.id, limit)]


@router.get("/jobs/{job_id}", response_model=JobResponse)
def get_job(job_id: UUID, user: AuthUser = Depends(require_user)) -> JobResponse:
    """
    poll one job regardless of status; reload calendar after success

    - **job_id**: owned job id returned by enqueue
    - **user**: verified owner
    - **returns**: safe status, or 404 when missing or removed by retention
    """

    with database_errors("planning.get_job"):
        result = replan_jobs.get_replan_job(user.id, job_id)
        if result is not None:
            return JobResponse.model_validate(result)
    raise HTTPException(404, "job not found", headers=PRIVATE_HEADERS)


@router.post("/jobs/{job_id}/cancel", response_model=JobResponse)
def cancel_job(job_id: UUID, user: AuthUser = Depends(require_user)) -> JobResponse:
    """
    cancel pending/running work; does not undo an already-published plan

    - **job_id**: owned job to cancel
    - **user**: verified owner
    - **returns**: cancelled or already-terminal job; inspect status rather than assuming cancellation
    """

    with database_errors("planning.cancel_job"):
        return JobResponse.model_validate(replan_jobs.cancel_replan_job(user.id, job_id))


@router.post("/jobs/{job_id}/retry", response_model=JobResponse, status_code=202)
def retry_job(job_id: UUID, user: AuthUser = Depends(require_user)) -> JobResponse:
    """
    explicitly retry a terminal failure/cancellation without allocating a new key

    - **job_id**: owned job; obsolete refresh occurrences conflict
    - **user**: verified owner
    - **returns**: pending job or unchanged live/succeeded status; generation remains asynchronous
    """

    with database_errors("planning.retry_job"):
        return JobResponse.model_validate(replan_jobs.retry_replan_job(user.id, job_id))


@router.get("/changes", response_model=HistoryResponse)
def list_changes(
    limit: int = Query(20, ge=1, le=100), before_revision: int | None = Query(None, gt=0),
    user: AuthUser = Depends(require_user),
) -> HistoryResponse:
    """
    read applied, undone, and discarded changes with the current mutation revision

    - **limit**: maximum changes per page
    - **before_revision**: last change's original revision from the previous page
    - **user**: verified owner and jwt
    - **returns**: newest-first history and current revision; no eligibility guarantee
    """

    with database_errors("planning.list_changes"):
        return HistoryResponse.model_validate(
            planning_changes.get_history_page(user.id, user.access_token, limit, before_revision))


@router.get("/changes/{change_id}", response_model=ChangePreviewResponse)
def get_change(change_id: UUID, user: AuthUser = Depends(require_user)) -> ChangePreviewResponse:
    """
    preview a change's original affected workout versions, including inactive ones

    - **change_id**: owned change to preview
    - **user**: verified owner and jwt
    - **returns**: metadata, before/after workouts, and revision; 404 when missing
    """

    with database_errors("planning.get_change"):
        result = planning_changes.get_change_preview(user.id, change_id, user.access_token)
        if result is None:
            raise HTTPException(404, "change not found", headers=PRIVATE_HEADERS)
        return ChangePreviewResponse.model_validate(result)


@router.post("/changes/{change_id}/undo", response_model=ChangeWriteResponse)
def undo_change(change_id: UUID, payload: RevisionRequest, user: AuthUser = Depends(require_user)) -> ChangeWriteResponse:
    """
    undo the latest applied change by switching existing workout versions

    - **change_id**: explicit latest applied target
    - **payload**: revision from the history/calendar the user reviewed
    - **user**: verified owner
    - **returns**: receipt/new revision; stale, out-of-order, or performed targets conflict
    """

    with database_errors("planning.undo_change"):
        return ChangeWriteResponse.model_validate(
            planning_changes.undo_planning_change(user.id, change_id, payload.expected_revision))


@router.post("/changes/{change_id}/redo", response_model=ChangeWriteResponse)
def redo_change(change_id: UUID, payload: RevisionRequest, user: AuthUser = Depends(require_user)) -> ChangeWriteResponse:
    """
    redo the earliest undone change; a newly committed change discards the redo branch

    - **change_id**: explicit earliest undone target
    - **payload**: revision from current history/calendar; reload after conflicts
    - **user**: verified owner
    - **returns**: receipt/new revision; does not move refresh cadence or restore deleted sports
    """

    with database_errors("planning.redo_change"):
        return ChangeWriteResponse.model_validate(
            planning_changes.redo_planning_change(user.id, change_id, payload.expected_revision))
