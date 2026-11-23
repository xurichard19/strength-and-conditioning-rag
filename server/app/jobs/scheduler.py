""" bounded scheduling and durable task dispatch; deploy separately with cloud run iam """

import logging
from functools import partial
from itertools import zip_longest
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
    """ verify before task lookup/recovery, which must not exhaust unpaid deliveries """
    if not billing.billing_enabled():
        return job
    try:
        planning_access.permission_for(job.user_id)
    except planning_access.PlanningDeferred as exc:
        if not planning_access.defer(job.user_id, exc.reason, permission=exc.permission):
            # a newer payment superseded this denial. keep the delivery retryable.
            raise billing.BillingUnavailable("planning authorization changed") from exc
        return None
    current = replan_jobs.get_delivery_job(job.id, job.delivery_token)
    return current if current is not None and current.status in ("pending", "running") else None


def _submit_delivery(job: ReplanJobRecord, settings: TaskSettings) -> None:
    """ submit a committed generation, then confirm it; either failure remains recoverable """
    task = ReplanTask(job_id=job.id, delivery_token=job.delivery_token)
    enqueue_replan(task, queue=settings.queue, worker_url=settings.worker_url, invoker_email=settings.invoker_email)
    replan_jobs.mark_replan_dispatched(task.job_id, task.delivery_token)


def dispatch_job(job: ReplanJobRecord, settings: TaskSettings) -> None:
    current = _eligible_delivery(job)
    if current is not None:
        _submit_delivery(current, settings)


def dispatch_after_commit(job: ReplanJobRecord) -> None:
    """ try immediate submission after commit; a delivery failure must not erase durable
    acceptance

    - **job**: job already committed to the database
    - **returns**: none. unsuccessful submission is left for reconciliation """
    try:
        settings = get_task_settings()
        if settings.enabled and job.status == "pending" and job.dispatched_at is None:
            dispatch_job(job, settings)
    except Exception as exc:
        logger.warning("planning dispatch deferred job_id=%s error_type=%s", job.id, type(exc).__name__)


def _dispatch_delivery(job: ReplanJobRecord, settings: TaskSettings) -> bool:
    """ authorize before recovery, then submit only a current delivery generation

    - **job**: stored job and delivery generation
    - **settings**: cloud tasks destination for this dispatch
    - **returns**: true if this pass submitted a task """
    job = _eligible_delivery(job)
    if job is None:
        return False
    if job.dispatched_at is not None:
        task = ReplanTask(job_id=job.id, delivery_token=job.delivery_token)
        if task_exists(task, settings.queue):
            replan_jobs.mark_replan_dispatched(job.id, task.delivery_token)
            return False
        job = replan_jobs.recover_replan_delivery(job.id, task.delivery_token)
        if job is not None and job.status == "failed":
            capture_failure(RuntimeError("planning task delivery exhausted"), "planning.delivery")
        if job is None or job.status != "pending":
            return False
    _submit_delivery(job, settings)
    return True


def dispatch_due(settings: TaskSettings, limit: int = 20) -> dict:
    """ queue due refreshes and reconcile deliveries in bounded batches. counts describe
    dispatch activity, not completed plans

    - **settings**: validated queue and authenticated worker destination
    - **limit**: maximum due schedules and delivery records examined per tick
    - **returns**: counts, not planning outcomes; later ticks retry submission failures """
    deadline = monotonic() + 45
    enabled = billing.billing_enabled()
    # queueing a job does not spend a generation attempt
    # skip paused accounts and verify payment before delivery and again when the worker claims the job
    counts = {"created": replan_jobs.enqueue_due_replans(limit, include_paused=not enabled),
              "dispatched": 0, "errors": 0}
    first_error = None
    work = planning_schedules.list_billing_work(limit) if enabled else []
    deliveries = replan_jobs.list_replan_deliveries(limit, include_paused=not enabled)
    if enabled:
        counts["reconciled"] = 0

    # alternate billing wakeups and retries with deliveries so a slow provider batch cannot block the queue
    # stop starting work at the deadline and let in-flight calls use their own timeouts
    exhausted = False
    for recheck, job in zip_longest(work, deliveries):
        for kind, item in (("recheck", recheck), ("delivery", job)):
            if item is None:
                continue
            if monotonic() >= deadline:
                exhausted = True
                break
            try:
                if kind == "recheck":
                    if planning_access.reconcile_user(item.user_id, wake_token=item.wake_token):
                        counts["reconciled"] += 1
                elif _dispatch_delivery(item, settings):
                    counts["dispatched"] += 1
            except Exception as exc:
                counts["errors"] += 1
                if first_error is None:
                    first_error = exc
        if exhausted:
            break

    if first_error is not None:
        logger.warning("planning reconciliation deferred failures=%s error_type=%s", counts["errors"], type(first_error).__name__)
        capture_failure(first_error, "planning.dispatch")
    return counts


@app.get("/health")
def health():
    """ **inputs**: none. **returns**: dispatcher liveness and whether dispatch is enabled """
    return {"status": "ok", "dispatch_enabled": get_task_settings().enabled}


@app.post("/dispatch")
def dispatch():
    """ **inputs**: none. **returns**: dispatch counts. disabled or unsuccessful dispatch returns 503 """
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
