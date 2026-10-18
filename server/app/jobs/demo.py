"""Standalone Cloud Tasks experiment; no planning, database or AI dependencies."""

import argparse
from asyncio import sleep
import json
import logging
from urllib.parse import urlsplit
from uuid import UUID, uuid4

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field


app = FastAPI(title="Cloud Tasks demo")
logger = logging.getLogger("uvicorn.error")


class DemoJob(BaseModel):
    model_config = ConfigDict(extra="forbid")

    job_id: UUID
    number: int = Field(ge=-1_000_000, le=1_000_000)
    delay_seconds: int = Field(default=5, ge=0, le=30)
    fail_first_attempt: bool = False


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/run")
async def run(job: DemoJob,
    retry_count: int = Header(default=0, alias="X-CloudTasks-TaskRetryCount", ge=0)):
    """
    finish one harmless job before acknowledging its delivery

    - **job**: bounded test input; results are logged, not stored
    - **retry_count**: Google delivery metadata, never proof of authentication
    - **returns**: squared number after completion, or 503 for a deliberate retry
    """
    # Cloud Run IAM authenticates requests in deployment; bind only to loopback locally.
    logger.info("demo started job_id=%s retry_count=%s", job.job_id, retry_count)
    await sleep(job.delay_seconds)
    if job.fail_first_attempt and retry_count == 0:
        logger.warning("demo retry requested job_id=%s", job.job_id)
        raise HTTPException(503, "deliberate first-attempt failure")
    result = job.number ** 2
    logger.info("demo completed job_id=%s result=%s", job.job_id, result)
    return {"job_id": str(job.job_id), "result": result}


def enqueue(job: DemoJob, queue: str, worker_url: str, invoker_email: str) -> dict:
    """
    submit one named task using application default Google credentials

    - **job**: reuse both its id and payload after an uncertain submission
    - **queue**: full projects/PROJECT/locations/REGION/queues/QUEUE path
    - **worker_url**: private Cloud Run service origin, without /run
    - **invoker_email**: service account permitted to invoke that worker
    - **returns**: queue acceptance only; AlreadyExists does not prove completion
    """
    from google.api_core.exceptions import AlreadyExists
    from google.cloud import tasks_v2

    origin = urlsplit(worker_url)
    if (origin.scheme != "https" or not origin.hostname or origin.username is not None
            or origin.password is not None or origin.path not in ("", "/") or origin.query or origin.fragment):
        raise ValueError("worker URL must be a bare HTTPS service origin")
    worker_url = worker_url.rstrip("/")
    name = f"{queue}/tasks/{job.job_id.hex}"
    task = {"name": name, "dispatch_deadline": {"seconds": 120},
        "http_request": {"http_method": "POST", "url": worker_url + "/run",
            "headers": {"Content-Type": "application/json"}, "body": job.model_dump_json().encode(),
            "oidc_token": {"service_account_email": invoker_email, "audience": worker_url}}}
    with tasks_v2.CloudTasksClient() as client:
        try:
            client.create_task(request={"parent": queue, "task": task}, retry=None, timeout=10)
        except AlreadyExists:
            return {"task": name, "status": "already_exists"}
    return {"task": name, "status": "enqueued"}


def main():
    """submit a demo job; print its id first so ambiguous submissions can be retried"""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--queue", required=True)
    parser.add_argument("--worker-url", required=True)
    parser.add_argument("--invoker-email", required=True)
    parser.add_argument("--number", type=int, default=7)
    parser.add_argument("--delay-seconds", type=int, default=5)
    parser.add_argument("--fail-first-attempt", action="store_true")
    parser.add_argument("--job-id", type=UUID, default=None)
    args = parser.parse_args()
    job = DemoJob(job_id=args.job_id or uuid4(), number=args.number,
        delay_seconds=args.delay_seconds, fail_first_attempt=args.fail_first_attempt)
    print(json.dumps({"job_id": str(job.job_id), "status": "submitting"}), flush=True)
    print(json.dumps(enqueue(job, args.queue, args.worker_url, args.invoker_email)))


if __name__ == "__main__":
    main()
