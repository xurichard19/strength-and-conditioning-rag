# queue operations and atomic publication

from datetime import date, datetime
from uuid import UUID

from pydantic import TypeAdapter

from app.contracts import ClaimedReplanJob, PlannedWorkout, ReplanDeliveryClaim, ReplanJobRecord, WorkoutWriteResult
from app.db.supabase._queries import date_range, identifier, page_limit, rpc_row
from app.db.supabase.transport import call_rpc, select_rows


def get_replan_job(user_id: str | UUID, job_id: str | UUID) -> ReplanJobRecord | None:
    """ read an authorized owner's job with service credentials. lease tokens and raw errors are
    internal

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **job_id**: id of the replan job
    - **returns**: user-owned job, or none if not found """

    rows = select_rows("replan_jobs", [("select", "*"), ("user_id", f"eq.{identifier(user_id)}"),
        ("id", f"eq.{identifier(job_id)}"), ("limit", "1")], None)
    return ReplanJobRecord.model_validate(rows[0]) if rows else None


def get_delivery_job(job_id: UUID, delivery_token: UUID) -> ReplanJobRecord | None:
    """ resolve a private task's owner without accepting an identity from the task body

    - **job_id**: id of the durable planning job
    - **delivery_token**: identifies this job's current delivery generation
    - **returns**: matching job or none if this delivery is no longer current """
    rows = select_rows("replan_jobs", [("select", "*"), ("id", f"eq.{identifier(job_id)}"),
        ("delivery_token", f"eq.{identifier(delivery_token)}"), ("limit", "1")], None)
    return ReplanJobRecord.model_validate(rows[0]) if rows else None


def get_latest_initial_job(user_id: str | UUID) -> ReplanJobRecord | None:
    """ include terminal refresh failures while the owner's first plan has no coverage

    - **user_id**: owner of the account being checked
    - **returns**: latest initial refresh, or none """
    rows = select_rows("replan_jobs", [("select", "*"), ("user_id", f"eq.{identifier(user_id)}"),
        ("kind", "eq.refresh"), ("order", "created_at.desc,id.desc"), ("limit", "1")], None)
    return ReplanJobRecord.model_validate(rows[0]) if rows else None


def get_pending_replans(user_id: str | UUID, limit: int = 20) -> list[ReplanJobRecord]:
    """ list pending and running jobs oldest first, including jobs in backoff or with expired
    leases

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **limit**: maximum records to return, from 1 to 100
    - **returns**: pending/running jobs ordered oldest first """

    page_limit(limit)
    rows = select_rows("replan_jobs", [("select", "*"), ("user_id", f"eq.{identifier(user_id)}"),
        ("status", "in.(pending,running)"), ("order", "created_at.asc,id.asc"), ("limit", str(limit))], None)
    return [ReplanJobRecord.model_validate(row) for row in rows]


def enqueue_adjustment(
    user_id: str | UUID, deduplication_key: str, reason: str, effective_from: date, effective_through: date,
) -> ReplanJobRecord:
    """ queue an adjustment within existing coverage after saving its input. reuse the key only
    for the same reason and dates. an exact retry may return a terminal job

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **deduplication_key**: stable request key; reuse only to retry the same request
    - **reason**: nonblank explanation of why the adjustment is needed
    - **effective_from**: first date the adjustment may change, inclusive
    - **effective_through**: last date the adjustment may change, inclusive; does not extend the horizon
    - **returns**: queued job, or existing job matching the same request key """

    date_range(effective_from, effective_through)
    if not deduplication_key.strip() or not reason.strip():
        raise ValueError("deduplication key and reason are required")
    return ReplanJobRecord.model_validate(rpc_row("enqueue_adjustment", {
        "p_user_id": identifier(user_id), "p_deduplication_key": deduplication_key, "p_reason": reason,
        "p_effective_from": effective_from.isoformat(), "p_effective_through": effective_through.isoformat(),
    }))


def enqueue_due_replans(limit: int = 100, *, include_paused: bool = False) -> int:
    """ queue the latest missed occurrence per due schedule. only publication advances cadence.
    a failed occurrence can stay suppressed until the next interval

    - **limit**: maximum due schedules to enqueue in this scheduler pass
    - **include_paused**: whether to include schedules paused for billing
    - **returns**: number of newly queued refresh jobs """

    payload = {"p_limit": limit}
    if include_paused:
        payload["p_include_paused"] = True
    return TypeAdapter(int).validate_python(call_rpc("enqueue_due_replans", payload, None), strict=True)


def claim_replan_job(lease_seconds: int = 300) -> ClaimedReplanJob | None:
    """ claim one job and use its returned dates, revision and lease token. an expired lease can
    be reclaimed. none means no claim was issued this time

    - **lease_seconds**: worker lease duration in seconds
    - **returns**: claimed job and planning dates, or none when no claim was issued (poll later) """

    payload = call_rpc("claim_replan_job", {"p_lease_seconds": lease_seconds}, None)
    return ClaimedReplanJob.model_validate(payload) if payload is not None else None


def list_replan_deliveries(limit: int = 20, *, include_paused: bool = False) -> list[ReplanJobRecord]:
    """ read a bounded page of ready jobs needing submission or delivery reconciliation

    - **limit**: maximum records to read in this batch
    - **include_paused**: whether to include schedules paused for billing
    - **returns**: jobs ready for submission or reconciliation """
    page_limit(limit)
    payload = {"p_limit": limit}
    if include_paused:
        payload["p_include_paused"] = True
    rows = call_rpc("list_replan_deliveries", payload, None)
    return TypeAdapter(list[ReplanJobRecord]).validate_python(rows)


def mark_replan_dispatched(job_id: UUID, delivery_token: UUID) -> None:
    """ confirm this generation's task exists; a stale or terminal job is a harmless no-op

    - **job_id**: id of the durable planning job
    - **delivery_token**: identifies this job's current delivery generation
    - **returns**: none. records confirmation for a current delivery only """
    call_rpc("mark_replan_dispatched", {"p_job_id": identifier(job_id),
        "p_delivery_token": identifier(delivery_token)}, None)


def recover_replan_delivery(job_id: UUID, delivery_token: UUID) -> ReplanJobRecord | None:
    """ replace a confirmed-missing task once; recheck token, lease, and outcome atomically

    - **job_id**: id of the durable planning job
    - **delivery_token**: identifies this job's current delivery generation
    - **returns**: replacement delivery record, or none if recovery no longer applies """
    row = call_rpc("recover_replan_delivery", {"p_job_id": identifier(job_id),
        "p_delivery_token": identifier(delivery_token)}, None)
    return ReplanJobRecord.model_validate(row) if row else None


def claim_replan_delivery(
    job_id: UUID, delivery_token: UUID, lease_seconds: int = 300, *,
    billing_environment: str | None = None, billing_revision: int | None = None,
) -> ReplanDeliveryClaim:
    """ claim one delivery; optionally fence its paid entitlement before spending an attempt

    - **job_id**: id of the durable planning job
    - **delivery_token**: identifies this job's current delivery generation
    - **lease_seconds**: lease lifetime in seconds
    - **billing_environment**: store partition to check before changing planning state
    - **billing_revision**: entitlement revision to verify atomically
    - **returns**: delivery status and a lease only when claimed """
    payload = {
        "p_job_id": identifier(job_id), "p_delivery_token": identifier(delivery_token),
        "p_lease_seconds": lease_seconds}
    if billing_environment is not None or billing_revision is not None:
        payload.update(p_billing_environment=billing_environment, p_billing_revision=billing_revision)
    return ReplanDeliveryClaim.model_validate(call_rpc("claim_replan_delivery", payload, None))


def renew_replan_lease(job_id: str | UUID, lease_token: str | UUID, lease_seconds: int = 300) -> datetime:
    """ extend a live lease from database time. a stale token conflicts. renewal does not
    revalidate planning inputs

    - **job_id**: id of the replan job
    - **lease_token**: token from the current claim; stale or expired leases are rejected
    - **lease_seconds**: worker lease duration in seconds
    - **returns**: timezone-aware expiry of the renewed lease """

    return TypeAdapter(datetime).validate_python(call_rpc("renew_replan_lease", {
        "p_job_id": identifier(job_id), "p_lease_token": identifier(lease_token), "p_lease_seconds": lease_seconds,
    }, None))


def fail_replan_job(job_id: str | UUID, lease_token: str | UUID, error: str, retry: bool = True) -> ReplanJobRecord:
    """ record a sanitized failure and release the lease. retries back off and become terminal
    after five attempts. read the job after a timeout before retrying

    - **job_id**: id of the replan job
    - **lease_token**: token from the current claim; stale or expired leases are rejected
    - **error**: sanitized failure description safe to persist; never include credentials
    - **retry**: true requests backoff while attempts remain; false records terminal failure
    - **returns**: job marked pending for retry or failed permanently """

    return ReplanJobRecord.model_validate(rpc_row("fail_replan_job", {
        "p_job_id": identifier(job_id), "p_lease_token": identifier(lease_token), "p_error": error, "p_retry": retry,
    }))


def cancel_replan_job(user_id: str | UUID, job_id: str | UUID) -> ReplanJobRecord:
    """ clear the lease to prevent pending or running work from publishing. terminal jobs keep
    their status

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **job_id**: id of the replan job
    - **returns**: newly cancelled job, or an already-terminal job unchanged """

    return ReplanJobRecord.model_validate(rpc_row("cancel_replan_job", {
        "p_user_id": identifier(user_id), "p_job_id": identifier(job_id),
    }))


def retry_replan_job(user_id: str | UUID, job_id: str | UUID) -> ReplanJobRecord:
    """ requeue a failed or cancelled job under its original key. inspect the returned status
    because live and successful jobs are unchanged

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **job_id**: id of the replan job
    - **returns**: reset pending job, or an already-live/succeeded job unchanged """

    return ReplanJobRecord.model_validate(rpc_row("retry_replan_job", {
        "p_user_id": identifier(user_id), "p_job_id": identifier(job_id),
    }))


def complete_replan_job(
    job_id: str | UUID, lease_token: str | UUID, before_ids: list[UUID], workouts: list[PlannedWorkout],
) -> WorkoutWriteResult:
    """ publish under the claimed lease and revision. include only removed ids and new workout
    versions. replay after a lost response is safe while the receipt exists. a stale
    proposal requires a new claim and fresh inputs

    - **job_id**: id of the replan job
    - **lease_token**: token from the current claim; stale or expired leases are rejected
    - **before_ids**: current workout ids being replaced; exclude unchanged workouts
    - **workouts**: new or replacement workouts only; exclude unchanged workouts
    - **returns**: change id, published workout ids, and revision; change id can be none for a no-op """

    return WorkoutWriteResult.model_validate(call_rpc("complete_replan_job", {
        "p_job_id": identifier(job_id), "p_lease_token": identifier(lease_token),
        "p_before_ids": [identifier(value) for value in before_ids],
        "p_workouts": [workout.model_dump(mode="json", exclude_none=True) for workout in workouts],
    }, None))


def purge_replan_jobs(before: datetime, limit: int = 1000) -> int:
    """ delete terminal jobs in batches after at least seven days. planning history survives,
    but purging removes request keys and publication receipts

    - **before**: timezone-aware retention cutoff for terminal jobs
    - **limit**: maximum terminal jobs to remove in this batch
    - **returns**: number of terminal job rows deleted; planning history is retained """

    if before.utcoffset() is None:
        raise ValueError("retention cutoff must include a timezone")
    return TypeAdapter(int).validate_python(call_rpc("purge_replan_jobs", {
        "p_before": before.isoformat(), "p_limit": limit,
    }, None), strict=True)
