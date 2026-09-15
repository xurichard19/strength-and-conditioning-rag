# queue operations and atomic publication

from datetime import date, datetime
from uuid import UUID

from pydantic import TypeAdapter

from app.contracts import ClaimedReplanJob, PlannedWorkout, ReplanJobRecord, WorkoutWriteResult
from app.db.supabase._queries import date_range, identifier, page_limit, rpc_row
from app.db.supabase.transport import call_rpc, select_rows


def get_replan_job(user_id: str | UUID, job_id: str | UUID) -> ReplanJobRecord | None:
    """
    read one user's backend-only job for status reporting

    uses service-role credentials because job rows are backend-only. the explicit
    user filter is ownership scoping, not authentication; authorize the user before
    calling. this is a status read, not a claim. the record contains internal lease
    and error fields; an endpoint should expose only the status fields the client needs.

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **job_id**: id of the replan job
    - **returns**: user-owned job, or none if not found
    """

    rows = select_rows("replan_jobs", [("select", "*"), ("user_id", f"eq.{identifier(user_id)}"),
        ("id", f"eq.{identifier(job_id)}"), ("limit", "1")], None)
    return ReplanJobRecord.model_validate(rows[0]) if rows else None


def get_pending_replans(user_id: str | UUID, limit: int = 20) -> list[ReplanJobRecord]:
    """
    read pending and running jobs for one user

    backend-only status summary for one authorized user, not a worker queue claim.
    includes pending jobs delayed by backoff and running jobs whose leases may have
    expired. the oldest-first result is bounded, not a complete paginated queue or
    a count of all outstanding work. inspect a specific job with get_replan_job.

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **limit**: maximum records to return, from 1 to 100
    - **returns**: pending/running jobs ordered oldest first
    """

    page_limit(limit)
    rows = select_rows("replan_jobs", [("select", "*"), ("user_id", f"eq.{identifier(user_id)}"),
        ("status", "in.(pending,running)"), ("order", "created_at.asc,id.asc"), ("limit", str(limit))], None)
    return [ReplanJobRecord.model_validate(row) for row in rows]


def enqueue_adjustment(
    user_id: str | UUID, deduplication_key: str, reason: str, effective_from: date, effective_through: date,
) -> ReplanJobRecord:
    """
    queue an exact adjustment window; reuse the key only when retrying the same request

    backend-only enqueue for survey, injury, chat, or sports-triggered adjustments.
    save the triggering input first. a configured schedule with established coverage
    is required; the requested end cannot exceed horizon_end. creates a pending job
    and increments revision, invalidating proposals already in flight. it does not
    generate workouts or extend the horizon/cadence.

    reuse the same key and identical reason/window only for the same logical request;
    the database returns its existing job, including a terminal one. mismatched reuse
    conflicts. distinct requests remain separate jobs, not merged windows. an expired
    date window may be cancelled later when claimed.

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **deduplication_key**: stable request key; reuse only to retry the same request
    - **reason**: nonblank explanation of why the adjustment is needed
    - **effective_from**: first date the adjustment may change, inclusive
    - **effective_through**: last date the adjustment may change, inclusive; does not extend the horizon
    - **returns**: queued job, or existing job matching the same request key
    """

    date_range(effective_from, effective_through)
    if not deduplication_key.strip() or not reason.strip():
        raise ValueError("deduplication key and reason are required")
    return ReplanJobRecord.model_validate(rpc_row("enqueue_adjustment", {
        "p_user_id": identifier(user_id), "p_deduplication_key": deduplication_key, "p_reason": reason,
        "p_effective_from": effective_from.isoformat(), "p_effective_through": effective_through.isoformat(),
    }))


def enqueue_due_replans(limit: int = 100) -> int:
    """
    queue a bounded batch of due refreshes and return the number queued

    backend-only scheduler entry point. scans due schedules with no outstanding
    refresh and queues their latest due occurrence, consolidating missed intervals.
    preserves the athlete's local wall-clock cadence across daylight-saving changes.
    does not advance coverage or next_refresh_at; successful publication does that.

    existing occurrence keys are excluded before the batch limit, so failed or
    cancelled occurrences cannot starve other due users. a terminally failed
    occurrence can remain suppressed until the next cadence boundary unless explicitly
    retried; monitoring/recovery belongs to the scheduler service. zero queued does
    not prove every schedule is healthy.

    - **limit**: maximum due schedules to enqueue in this scheduler pass
    - **returns**: number of newly queued refresh jobs
    """

    return TypeAdapter(int).validate_python(call_rpc("enqueue_due_replans", {"p_limit": limit}, None), strict=True)


def claim_replan_job(lease_seconds: int = 300) -> ClaimedReplanJob | None:
    """
    claim one available job with its token, revision, and allowed planning dates

    backend-only worker entry point; selects candidates from ready jobs, not all
    athlete schedules. locks
    schedule rows with skip-locked behavior, allows one unexpired running job per
    user, and can reclaim expired leases. each claim increments attempts and issues
    a fresh token plus the current planning revision. pass that exact token to
    renewal, failure, and completion; older workers can no longer publish.

    use the returned effective dates, not the original job dates: adjustments are
    clipped to today/coverage and refreshes use their anchored horizon. none can mean
    no available job or that this call retired an exhausted/expired job, not that the
    queue is empty. poll later; the handler does not run a polling loop. leases must
    be 30-3600 seconds and abandoned work fails after five attempts.

    - **lease_seconds**: worker lease duration in seconds
    - **returns**: claimed job and planning dates, or none when no claim was issued (poll later)
    """

    payload = call_rpc("claim_replan_job", {"p_lease_seconds": lease_seconds}, None)
    return ClaimedReplanJob.model_validate(payload) if payload is not None else None


def renew_replan_lease(job_id: str | UUID, lease_token: str | UUID, lease_seconds: int = 300) -> datetime:
    """
    extend a current lease and return its new expiry

    backend-only heartbeat for a worker still processing its current claim. sets
    expiry to database current time plus lease_seconds; it does not add time to the
    previous expiry or change the captured revision. renew before expiration.

    an expired/replaced token conflicts and must not be used to publish. renewing
    does not validate whether planning inputs changed; completion still checks that.
    a timeout is ambiguous, so never assume the lease was extended successfully.

    - **job_id**: id of the replan job
    - **lease_token**: token from the current claim; stale or expired leases are rejected
    - **lease_seconds**: worker lease duration in seconds
    - **returns**: timezone-aware expiry of the renewed lease
    """

    return TypeAdapter(datetime).validate_python(call_rpc("renew_replan_lease", {
        "p_job_id": identifier(job_id), "p_lease_token": identifier(lease_token), "p_lease_seconds": lease_seconds,
    }, None))


def fail_replan_job(job_id: str | UUID, lease_token: str | UUID, error: str, retry: bool = True) -> ReplanJobRecord:
    """
    release a failed attempt for retry or mark it terminal; pass a sanitized error

    backend-only failure report for an unexpired current claim. clears its lease
    and either requeues with exponential backoff or records terminal failure. retry
    true still becomes terminal after five attempts. the database lowercases and
    truncates error to 2000 characters; sanitize it before calling.

    retrying the same failure report after success conflicts because the lease was
    cleared. inspect job status after an ambiguous timeout. a retry must claim again,
    reload context, and regenerate; it must not reuse the previous token or proposal.

    - **job_id**: id of the replan job
    - **lease_token**: token from the current claim; stale or expired leases are rejected
    - **error**: sanitized failure description safe to persist; never include credentials
    - **retry**: true requests backoff while attempts remain; false records terminal failure
    - **returns**: job marked pending for retry or failed permanently
    """

    return ReplanJobRecord.model_validate(rpc_row("fail_replan_job", {
        "p_job_id": identifier(job_id), "p_lease_token": identifier(lease_token), "p_error": error, "p_retry": retry,
    }))


def cancel_replan_job(user_id: str | UUID, job_id: str | UUID) -> ReplanJobRecord:
    """
    cancel one user's pending or running job and fence off its worker

    backend-only cancellation for an authorized owner. pending/running jobs become
    cancelled and their lease is cleared, preventing their worker from publishing.
    already-terminal jobs are returned unchanged, including succeeded or failed jobs;
    inspect the returned status instead of assuming it is cancelled.

    does not stop an external model request or undo already-published workouts.
    missing or wrong-owner ids raise a not-found error. a repeated cancellation is
    safe while the job row remains, but cancellation is not history rollback.

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **job_id**: id of the replan job
    - **returns**: newly cancelled job, or an already-terminal job unchanged
    """

    return ReplanJobRecord.model_validate(rpc_row("cancel_replan_job", {
        "p_user_id": identifier(user_id), "p_job_id": identifier(job_id),
    }))


def retry_replan_job(user_id: str | UUID, job_id: str | UUID) -> ReplanJobRecord:
    """
    explicitly retry a failed or cancelled job without changing its request key

    backend-only explicit retry after failure/cancellation. resets attempts, error,
    completion time, and expected revision, making the same job available immediately.
    the next claim supplies a fresh token/revision and must regenerate from new context.

    pending/running/succeeded jobs are returned unchanged. missing jobs raise not-found;
    failed/cancelled refreshes older than next_refresh_at conflict as obsolete. this
    does not bypass expired adjustment windows, which are checked again at claim.

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **job_id**: id of the replan job
    - **returns**: reset pending job, or an already-live/succeeded job unchanged
    """

    return ReplanJobRecord.model_validate(rpc_row("retry_replan_job", {
        "p_user_id": identifier(user_id), "p_job_id": identifier(job_id),
    }))


def complete_replan_job(
    job_id: str | UUID, lease_token: str | UUID, before_ids: list[UUID], workouts: list[PlannedWorkout],
) -> WorkoutWriteResult:
    """
    atomically publish changed workouts and finish the job; omit unchanged workouts

    backend-only publication transaction after planning finishes. before_ids are
    only existing versions to remove/replace; workouts are only new versions to insert.
    there is no positional pairing requirement. omit unchanged content from both;
    empty arrays allow deletion-only, insertion-only, no-op, or rest-only coverage work.

    the database validates current lease/revision, allowed dates, ownership, planned
    state, and absence of results before writing nested exercises/sets. it switches
    active versions, records history links, increments revision when applicable, and
    finishes the job atomically. adjustments preserve horizon/cadence; refreshes also
    advance coverage and their anchored next due time. any failure rolls back the
    transaction. the caller still owns proposal quality and schedule completeness.

    after a lost response, repeating this job publication returns the stored receipt
    instead of inserting twice while the job record is retained. its revision may be
    the current schedule revision, not the original commit revision. conflicts on an
    unfinished job require fresh claim/context and regeneration, not blindly replaying
    the stale proposal. change_id is none only for a true no-op.

    - **job_id**: id of the replan job
    - **lease_token**: token from the current claim; stale or expired leases are rejected
    - **before_ids**: current workout ids being replaced; exclude unchanged workouts
    - **workouts**: new or replacement workouts only; exclude unchanged workouts
    - **returns**: change id, published workout ids, and revision; change id can be none for a no-op
    """

    return WorkoutWriteResult.model_validate(call_rpc("complete_replan_job", {
        "p_job_id": identifier(job_id), "p_lease_token": identifier(lease_token),
        "p_before_ids": [identifier(value) for value in before_ids],
        "p_workouts": [workout.model_dump(mode="json", exclude_none=True) for workout in workouts],
    }, None))


def purge_replan_jobs(before: datetime, limit: int = 1000) -> int:
    """
    delete a bounded batch of terminal jobs older than the retention cutoff

    backend-only maintenance, not user history deletion. removes a bounded batch
    by completion time and requires at least seven days of retention; limit is
    1-10000. planning changes and workout versions survive. repeated calls can remove
    successive batches; they are not replay-deduplicated.

    purging removes the job's request key and publication receipt, so do not promise
    deduplication beyond retention. choose the cutoff in application policy and never
    use this handler to clean up still-running jobs.

    - **before**: timezone-aware retention cutoff for terminal jobs
    - **limit**: maximum terminal jobs to remove in this batch
    - **returns**: number of terminal job rows deleted; planning history is retained
    """

    if before.utcoffset() is None:
        raise ValueError("retention cutoff must include a timezone")
    return TypeAdapter(int).validate_python(call_rpc("purge_replan_jobs", {
        "p_before": before.isoformat(), "p_limit": limit,
    }, None), strict=True)
