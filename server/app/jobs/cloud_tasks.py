"""cloud tasks delivery for persisted planning jobs; execution stays in the worker."""

from functools import lru_cache
import re
from urllib.parse import urlsplit
from uuid import UUID

from google.api_core.exceptions import AlreadyExists, NotFound
from google.cloud import tasks_v2
from pydantic import BaseModel, ConfigDict


class ReplanTask(BaseModel):
    model_config = ConfigDict(extra="forbid")

    job_id: UUID
    delivery_token: UUID


@lru_cache(maxsize=1)
def _get_client() -> tasks_v2.CloudTasksClient:
    """reuse one authenticated connection per process; initialize only on submission"""
    return tasks_v2.CloudTasksClient()


def validate_destination(queue: str, worker_url: str, invoker_email: str) -> None:
    """validate configured destinations before initializing credentials or making a request"""
    origin = urlsplit(worker_url)
    if (origin.scheme != "https" or not origin.hostname or origin.username is not None
            or origin.password is not None or origin.path not in ("", "/") or origin.query or origin.fragment):
        raise ValueError("worker url must be a bare https service origin")
    if not re.fullmatch(r"projects/[^/\s]+/locations/[^/\s]+/queues/[^/\s]+", queue) or not invoker_email.strip():
        raise ValueError("a full queue path and invoker service account are required")


def task_name(job: ReplanTask, queue: str) -> str:
    """name one durable delivery generation identically across concurrent submitters"""
    return f"{queue}/tasks/{job.job_id.hex}-{job.delivery_token.hex}"


def task_exists(job: ReplanTask, queue: str) -> bool:
    """only a confirmed not-found permits recovery; access errors and timeouts propagate"""
    try:
        _get_client().get_task(request={"name": task_name(job, queue)}, retry=None, timeout=5)
    except NotFound:
        return False
    return True


def enqueue_replan(job: ReplanTask, *, queue: str, worker_url: str, invoker_email: str) -> str:
    """
    deliver a saved planning job to a private cloud run worker

    persist both ids before calling; reuse them after an uncertain submission.
    a new delivery token is reserved in the database only for explicit recovery,
    not for ordinary Cloud Tasks retries. the worker must claim this exact job
    and token before generating a plan; delivery may happen more than once.

    - **job**: persisted job id and delivery generation; no athlete data or credentials
    - **queue**: full projects/PROJECT/locations/REGION/queues/QUEUE path
    - **worker_url**: bare https service origin; the worker will handle POST /run
    - **invoker_email**: service account granted Cloud Run Invoker on that worker
    - **returns**: stable task name, including on AlreadyExists; not proof of completion
    """
    validate_destination(queue, worker_url, invoker_email)
    worker_url = worker_url.rstrip("/")
    name = task_name(job, queue)
    task = {"name": name, "dispatch_deadline": {"seconds": 360},
        "http_request": {"http_method": "POST", "url": worker_url + "/run",
            "headers": {"Content-Type": "application/json"}, "body": job.model_dump_json().encode(),
            "oidc_token": {"service_account_email": invoker_email, "audience": worker_url}}}
    try:
        _get_client().create_task(request={"parent": queue, "task": task}, retry=None, timeout=5)
    except AlreadyExists:
        pass
    return name
