"""Bounded scheduling and durable task dispatch; deploy separately with Cloud Run IAM."""

import logging
from time import monotonic

from fastapi import FastAPI, HTTPException

from app.contracts import ReplanJobRecord
from app.db.supabase import replan_jobs
from app.jobs.cloud_tasks import ReplanTask, enqueue_replan, task_exists
from app.jobs.settings import TaskSettings, get_task_settings


logger = logging.getLogger(__name__)
app = FastAPI(title="planning dispatcher")


def dispatch_job(job: ReplanJobRecord, settings: TaskSettings) -> None:
    """submit a committed generation, then confirm it; either failure remains recoverable"""
    task = ReplanTask(job_id=job.id, delivery_token=job.delivery_token)
    enqueue_replan(task, queue=settings.queue, worker_url=settings.worker_url, invoker_email=settings.invoker_email)
    replan_jobs.mark_replan_dispatched(task.job_id, task.delivery_token)


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
    counts = {"created": replan_jobs.enqueue_due_replans(limit), "dispatched": 0, "errors": 0}
    for job in replan_jobs.list_replan_deliveries(limit):
        if monotonic() >= deadline:
            break
        try:
            if job.dispatched_at is not None:
                task = ReplanTask(job_id=job.id, delivery_token=job.delivery_token)
                if task_exists(task, settings.queue):
                    replan_jobs.mark_replan_dispatched(job.id, task.delivery_token)
                    continue
                job = replan_jobs.recover_replan_delivery(job.id, task.delivery_token)
                if job is None or job.status != "pending":
                    continue
            dispatch_job(job, settings)
            counts["dispatched"] += 1
        except Exception as exc:
            counts["errors"] += 1
            logger.warning("planning reconciliation deferred error_type=%s", type(exc).__name__)
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
        logger.warning("planning dispatcher failed error_type=%s", type(exc).__name__)
        raise HTTPException(503, "planning dispatcher unavailable") from exc
    if result["errors"]:
        raise HTTPException(503, "some planning deliveries need retry")
    return result
