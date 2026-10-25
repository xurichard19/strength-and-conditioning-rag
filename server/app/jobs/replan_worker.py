"""Private task handler for revision-fenced planning and atomic publication."""

import asyncio
from collections.abc import Awaitable, Callable
from functools import partial
import logging

from fastapi import FastAPI, HTTPException

from app.contracts import ClaimedReplanJob, ReplanResult
from app.db.supabase import SupabaseDataError, calendar, replan_jobs
from app.http import http_lifespan
from app.jobs.cloud_tasks import ReplanTask
from app.observability import capture_failure


logger = logging.getLogger(__name__)
PlanHandler = Callable[[ClaimedReplanJob], Awaitable[ReplanResult]]
ATTEMPT_SECONDS = 240
LEASE_SECONDS = 300


async def plan_job(claim: ClaimedReplanJob) -> ReplanResult:
    """load authoritative context off the event loop, then generate validated changes"""
    from app.ai.workflows.plan.graph import generate_plan

    context = await asyncio.to_thread(calendar.get_replan_context, claim)
    return await generate_plan(claim, context)


async def execute(job: ReplanTask, generate_plan: PlanHandler) -> dict:
    """
    claim exactly one delivery and publish its result under the existing database fences

    the bounded attempt finishes before its lease, so this baseline needs no
    heartbeat loop. cancellation abandons the lease for recovery. database calls
    run off the event loop; a timed-out write can still finish, so retries re-read
    durable state and never assume that a timeout means nothing was committed.

    - **job**: validated id and delivery generation; Cloud Run IAM authenticates the caller
    - **generate_plan**: async context loading, generation and validation handler
    - **returns**: durable completion or harmless obsolete/terminal delivery acknowledgement
    """
    delivery = await asyncio.to_thread(replan_jobs.claim_replan_delivery,
        job.job_id, job.delivery_token, LEASE_SECONDS)
    if delivery.status in ("missing", "obsolete", "terminal"):
        return {"status": delivery.status}
    if delivery.status != "claimed":
        raise HTTPException(503, "planning job is not ready")

    claim = delivery.claim
    try:
        async with asyncio.timeout(ATTEMPT_SECONDS):
            proposal = ReplanResult.model_validate(await generate_plan(claim))
            await asyncio.to_thread(replan_jobs.complete_replan_job, job.job_id,
                claim.job.lease_token, proposal.before_ids, proposal.workouts)
        return {"status": "succeeded"}
    except Exception as exc:
        logger.warning("planning attempt failed job_id=%s error_type=%s", job.job_id, type(exc).__name__)
        failed = await asyncio.to_thread(replan_jobs.fail_replan_job,
            job.job_id, claim.job.lease_token, type(exc).__name__, True)
        if failed.status == "failed":
            await asyncio.to_thread(capture_failure, exc, "planning.execute")
            return {"status": "failed"}
        raise HTTPException(503, "planning attempt needs retry") from exc


def create_app(generate_plan: PlanHandler | None = None) -> FastAPI:
    """build a private worker; without a plan handler reject delivery before claiming any job"""
    worker = FastAPI(title="planning worker", lifespan=partial(http_lifespan, service="planning-worker"))

    @worker.get("/health")
    def health():
        return {"status": "ok", "planner_ready": generate_plan is not None}

    @worker.post("/run")
    async def run(job: ReplanTask):
        if generate_plan is None:
            raise HTTPException(503, "plan generation is not configured")

        try:
            return await execute(job, generate_plan)
        except HTTPException:
            raise
        except Exception as exc:
            if not isinstance(exc, SupabaseDataError) or exc.status_code not in (404, 409):
                await asyncio.to_thread(capture_failure, exc, "planning.worker")
            logger.warning("planning worker unavailable error_type=%s", type(exc).__name__)
            raise HTTPException(503, "planning worker unavailable") from exc

    return worker


app = create_app(plan_job)
