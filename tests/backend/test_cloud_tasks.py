import json
import unittest
from unittest.mock import patch
from uuid import UUID

from google.api_core.exceptions import AlreadyExists, DeadlineExceeded, NotFound, PermissionDenied
from google.cloud import tasks_v2
from pydantic import ValidationError

from app.jobs import cloud_tasks


JOB = cloud_tasks.ReplanTask(job_id=UUID(int=1), delivery_token=UUID(int=2))
QUEUE = "projects/example/locations/us-east1/queues/planning"
URL = "https://planning-worker.example.run.app"
INVOKER = "planning-invoker@example.iam.gserviceaccount.com"


class PlanningTasksTests(unittest.TestCase):
    def setUp(self):
        cloud_tasks._get_client.cache_clear()
        self.addCleanup(cloud_tasks._get_client.cache_clear)
        self.factory = self.enterContext(patch.object(cloud_tasks.tasks_v2, "CloudTasksClient"))
        self.client = self.factory.return_value

    def enqueue(self, job=JOB, **changes):
        return cloud_tasks.enqueue_replan(job,
            **{"queue": QUEUE, "worker_url": URL, "invoker_email": INVOKER, **changes})

    def test_delivery_contains_only_job_identity_and_uses_private_worker_authentication(self):
        name = self.enqueue(worker_url=URL + "/")
        kwargs = self.client.create_task.call_args.kwargs
        request = tasks_v2.CreateTaskRequest(kwargs["request"])
        self.assertEqual(request.parent, QUEUE)
        self.assertEqual(request.task.name, name)
        self.assertEqual(request.task.dispatch_deadline.total_seconds(), 360)
        delivery = request.task.http_request
        self.assertEqual(delivery.http_method, tasks_v2.HttpMethod.POST)
        self.assertEqual(delivery.url, URL + "/run")
        self.assertEqual(delivery.headers["Content-Type"], "application/json")
        self.assertEqual(delivery.oidc_token.service_account_email, INVOKER)
        self.assertEqual(delivery.oidc_token.audience, URL)
        self.assertEqual(json.loads(delivery.body), JOB.model_dump(mode="json"))
        self.assertIsNone(kwargs["retry"])
        self.assertEqual(kwargs["timeout"], 5)

    def test_uncertain_submission_reuses_identical_request_and_connection(self):
        self.client.create_task.side_effect = [DeadlineExceeded("uncertain"), AlreadyExists("accepted")]
        with self.assertRaises(DeadlineExceeded):
            self.enqueue()
        name = self.enqueue()
        first, second = self.client.create_task.call_args_list
        self.assertEqual(first, second)
        self.assertEqual(name, f"{QUEUE}/tasks/{JOB.job_id.hex}-{JOB.delivery_token.hex}")
        self.factory.assert_called_once_with()

    def test_explicit_recovery_uses_new_task_name_for_same_job(self):
        first = self.enqueue()
        recovery = cloud_tasks.ReplanTask(job_id=JOB.job_id, delivery_token=UUID(int=3))
        second = self.enqueue(recovery)
        self.assertNotEqual(first, second)
        body = self.client.create_task.call_args.kwargs["request"]["task"]["http_request"]["body"]
        self.assertEqual(json.loads(body)["job_id"], str(JOB.job_id))

    def test_permission_failure_is_not_reported_as_acceptance(self):
        self.client.create_task.side_effect = PermissionDenied("denied")
        with self.assertRaises(PermissionDenied):
            self.enqueue()
        self.client.create_task.assert_called_once()

    def test_only_confirmed_missing_task_allows_recovery(self):
        self.assertTrue(cloud_tasks.task_exists(JOB, QUEUE))
        self.client.get_task.assert_called_once_with(
            request={"name": cloud_tasks.task_name(JOB, QUEUE)}, retry=None, timeout=5)
        self.client.get_task.side_effect = NotFound("missing")
        self.assertFalse(cloud_tasks.task_exists(JOB, QUEUE))
        for failure in (DeadlineExceeded("uncertain"), PermissionDenied("denied")):
            self.client.get_task.side_effect = failure
            with self.subTest(failure=type(failure).__name__), self.assertRaises(type(failure)):
                cloud_tasks.task_exists(JOB, QUEUE)

    def test_invalid_destination_is_rejected_before_credentials_are_loaded(self):
        for url in ("http://localhost:8000", URL + "/run", URL + "?query=1", URL + "#fragment",
                "https://user:password@planning-worker.example.run.app"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                self.enqueue(worker_url=url)
        for changes in ({"queue": "planning"}, {"queue": QUEUE + "/tasks/id"}, {"invoker_email": " "}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                self.enqueue(**changes)
        self.factory.assert_not_called()

    def test_delivery_rejects_invalid_ids_and_extra_athlete_data(self):
        for changes in ({"job_id": "invalid"}, {"delivery_token": None}, {"user_id": str(UUID(int=4))}):
            with self.subTest(changes=changes), self.assertRaises(ValidationError):
                cloud_tasks.ReplanTask.model_validate({**JOB.model_dump(), **changes})
        self.factory.assert_not_called()
