# queue operations and atomic publication

from datetime import date, datetime
from uuid import UUID

from pydantic import TypeAdapter

from app.contracts import ClaimedReplanJob, PlannedWorkout, ReplanJobRecord, WorkoutWriteResult
from app.db.supabase._queries import date_range, identifier, page_limit, rpc_row
from app.db.supabase.transport import call_rpc, select_rows


def get_replan_job(user_id: str | UUID, job_id: str | UUID) -> ReplanJobRecord | None:
    """read one user's backend-only job for status reporting"""

    rows = select_rows("replan_jobs", [("select", "*"), ("user_id", f"eq.{identifier(user_id)}"),
        ("id", f"eq.{identifier(job_id)}"), ("limit", "1")], None)
    return ReplanJobRecord.model_validate(rows[0]) if rows else None


def get_pending_replans(user_id: str | UUID, limit: int = 20) -> list[ReplanJobRecord]:
    """read pending and running jobs for one user"""

    page_limit(limit)
    rows = select_rows("replan_jobs", [("select", "*"), ("user_id", f"eq.{identifier(user_id)}"),
        ("status", "in.(pending,running)"), ("order", "created_at.asc,id.asc"), ("limit", str(limit))], None)
    return [ReplanJobRecord.model_validate(row) for row in rows]


def enqueue_adjustment(
    user_id: str | UUID, deduplication_key: str, reason: str, effective_from: date, effective_through: date,
) -> ReplanJobRecord:
    """queue an exact adjustment window; reuse the key only when retrying the same request"""

    date_range(effective_from, effective_through)
    if not deduplication_key.strip() or not reason.strip():
        raise ValueError("deduplication key and reason are required")
    return ReplanJobRecord.model_validate(rpc_row("enqueue_adjustment", {
        "p_user_id": identifier(user_id), "p_deduplication_key": deduplication_key, "p_reason": reason,
        "p_effective_from": effective_from.isoformat(), "p_effective_through": effective_through.isoformat(),
    }))


def enqueue_due_replans(limit: int = 100) -> int:
    """queue a bounded batch of due refreshes and return the number queued"""

    return TypeAdapter(int).validate_python(call_rpc("enqueue_due_replans", {"p_limit": limit}, None), strict=True)


def claim_replan_job(lease_seconds: int = 300) -> ClaimedReplanJob | None:
    """claim one available job with its token, revision, and allowed planning dates"""

    payload = call_rpc("claim_replan_job", {"p_lease_seconds": lease_seconds}, None)
    return ClaimedReplanJob.model_validate(payload) if payload is not None else None


def renew_replan_lease(job_id: str | UUID, lease_token: str | UUID, lease_seconds: int = 300) -> datetime:
    """extend a current lease and return its new expiry"""

    return TypeAdapter(datetime).validate_python(call_rpc("renew_replan_lease", {
        "p_job_id": identifier(job_id), "p_lease_token": identifier(lease_token), "p_lease_seconds": lease_seconds,
    }, None))


def fail_replan_job(job_id: str | UUID, lease_token: str | UUID, error: str, retry: bool = True) -> ReplanJobRecord:
    """release a failed attempt for retry or mark it terminal; pass a sanitized error"""

    return ReplanJobRecord.model_validate(rpc_row("fail_replan_job", {
        "p_job_id": identifier(job_id), "p_lease_token": identifier(lease_token), "p_error": error, "p_retry": retry,
    }))


def cancel_replan_job(user_id: str | UUID, job_id: str | UUID) -> ReplanJobRecord:
    """cancel one user's pending or running job and fence off its worker"""

    return ReplanJobRecord.model_validate(rpc_row("cancel_replan_job", {
        "p_user_id": identifier(user_id), "p_job_id": identifier(job_id),
    }))


def retry_replan_job(user_id: str | UUID, job_id: str | UUID) -> ReplanJobRecord:
    """explicitly retry a failed or cancelled job without changing its request key"""

    return ReplanJobRecord.model_validate(rpc_row("retry_replan_job", {
        "p_user_id": identifier(user_id), "p_job_id": identifier(job_id),
    }))


def complete_replan_job(
    job_id: str | UUID, lease_token: str | UUID, before_ids: list[UUID], workouts: list[PlannedWorkout],
) -> WorkoutWriteResult:
    """atomically publish changed workouts and finish the job; omit unchanged workouts"""

    return WorkoutWriteResult.model_validate(call_rpc("complete_replan_job", {
        "p_job_id": identifier(job_id), "p_lease_token": identifier(lease_token),
        "p_before_ids": [identifier(value) for value in before_ids],
        "p_workouts": [workout.model_dump(mode="json", exclude_none=True) for workout in workouts],
    }, None))


def purge_replan_jobs(before: datetime, limit: int = 1000) -> int:
    """delete a bounded batch of terminal jobs older than the retention cutoff"""

    if before.utcoffset() is None:
        raise ValueError("retention cutoff must include a timezone")
    return TypeAdapter(int).validate_python(call_rpc("purge_replan_jobs", {
        "p_before": before.isoformat(), "p_limit": limit,
    }, None), strict=True)
