"""Bounded scheduling and durable task dispatch; deploy separately with Cloud Run IAM."""

import logging
from functools import partial
from time import monotonic

from fastapi import FastAPI, HTTPException

from app.contracts import ReplanJobRecord
from app.db.supabase import planning_schedules, replan_jobs
from app.http import http_lifespan
from app.jobs.cloud_tasks import ReplanTask, enqueue_replan, task_exists
from app.jobs.settings import TaskSettings, get_task_settings
from app.observability import capture_failure
from app.services import billing, planning_access


logger = logging.getLogger(__name__)
app = FastAPI(title="planning dispatcher", lifespan=partial(http_lifespan, service="planning-dispatcher"))


def _eligible_delivery(job: ReplanJobRecord) -> ReplanJobRecord | None:
    """Verify before task lookup/recovery, which must not exhaust unpaid deliveries."""
    if not billing.billing_enabled():
        return job
    if not planning_access.reconcile_user(job.user_id):
        return None
    current = replan_jobs.get_delivery_job(job.id, job.delivery_token)
    return current if current is not None and current.status in ("pending", "running") else None


def _submit_delivery(job: ReplanJobRecord, settings: TaskSettings) -> None:
    """Submit a committed generation, then confirm it; either failure remains recoverable."""
    task = ReplanTask(job_id=job.id, delivery_token=job.delivery_token)
    enqueue_replan(task, queue=settings.queue, worker_url=settings.worker_url, invoker_email=settings.invoker_email)
    replan_jobs.mark_replan_dispatched(task.job_id, task.delivery_token)


def dispatch_job(job: ReplanJobRecord, settings: TaskSettings) -> None:
    current = _eligible_delivery(job)
    if current is not None:
        _submit_delivery(current, settings)


def dispatch_after_commit(job: ReplanJobRecord) -> None:
    """try immediate submission after commit; a delivery failure must not erase durable acceptance"""
    try:
        settings = get_task_settings()
        if settings.enabled and job.status == "pending" and job.dispatched_at is None:
            dispatch_job(job, settings)
    except Exception as exc:
        logger.warning("planning dispatch deferred job_id=%s error_type=%s", job.id, type(exc).__name__)


def dispatch_due(settings: TaskSettings, limit: int = 20) -> dict:
    """
    discover due refreshes and reconcile a bounded page of task deliveries

    - **settings**: validated queue and authenticated worker destination
    - **limit**: maximum due schedules and delivery records examined per tick
    - **returns**: counts, not planning outcomes; later ticks retry submission failures
    """
    deadline = monotonic() + 45
    enabled = billing.billing_enabled()
    # Enabled billing only enqueues through a verified, per-user resume operation.
    counts = {"created": 0 if enabled else replan_jobs.enqueue_due_replans(limit, include_paused=True),
              "dispatched": 0, "errors": 0}
    first_error = None

    for job in replan_jobs.list_replan_deliveries(limit, include_paused=not enabled):
        if monotonic() >= deadline:
            break
        try:
            job = _eligible_delivery(job)
            if job is None:
                continue
            if job.dispatched_at is not None:
                task = ReplanTask(job_id=job.id, delivery_token=job.delivery_token)
                if task_exists(task, settings.queue):
                    replan_jobs.mark_replan_dispatched(job.id, task.delivery_token)
                    continue
                job = replan_jobs.recover_replan_delivery(job.id, task.delivery_token)
                if job is not None and job.status == "failed":
                    capture_failure(RuntimeError("planning task delivery exhausted"), "planning.delivery")
                if job is None or job.status != "pending":
                    continue

            _submit_delivery(job, settings)
            counts["dispatched"] += 1
        except Exception as exc:
            counts["errors"] += 1
            if first_error is None:
                first_error = exc

    # Dispatch ready work first. A slow provider or unpaid accounts must not take
    # the entire tick from users whose jobs are already waiting to run.
    if enabled:
        counts["reconciled"] = 0
        for user_id in planning_schedules.list_billing_rechecks(min(limit, 5)):
            if monotonic() + 10 >= deadline:
                break
            try:
                if planning_access.reconcile_user(user_id):
                    counts["reconciled"] += 1
            except Exception as exc:
                counts["errors"] += 1
                if first_error is None:
                    first_error = exc

    if first_error is not None:
        logger.warning("planning reconciliation deferred failures=%s error_type=%s", counts["errors"], type(first_error).__name__)
        capture_failure(first_error, "planning.dispatch")
    return counts


@app.get("/health")
def health():
    return {"status": "ok", "dispatch_enabled": get_task_settings().enabled}


@app.post("/dispatch")
def dispatch():
    settings = get_task_settings()
    if not settings.enabled:
        raise HTTPException(503, "planning dispatch is disabled")

    try:
        result = dispatch_due(settings)
    except Exception as exc:
        capture_failure(exc, "planning.dispatcher")
        logger.warning("planning dispatcher failed error_type=%s", type(exc).__name__)
        raise HTTPException(503, "planning dispatcher unavailable") from exc
    if result["errors"]:
        raise HTTPException(503, "some planning deliveries need retry")
    return result
