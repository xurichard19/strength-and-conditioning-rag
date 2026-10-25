import asyncio
from datetime import datetime, timezone
from threading import get_ident
import unittest
from unittest.mock import AsyncMock, Mock, patch
from uuid import UUID

import httpx
from fastapi import HTTPException
from fastapi.testclient import TestClient
from google.api_core.exceptions import DeadlineExceeded
from pydantic import ValidationError

from app.contracts import ClaimedReplanJob, PlanningProposal, ReplanDeliveryClaim, ReplanResult
from app.db.supabase import SupabaseDataError, calendar, replan_jobs
from app.jobs import replan_worker, scheduler
from app.jobs.cloud_tasks import ReplanTask
from app.jobs.settings import TaskSettings
from tests.backend.test_endpoints import DAY, JOB


TOKEN = UUID(int=42)
JOB = JOB.model_copy(update={"delivery_token": TOKEN, "lease_token": UUID(int=43)})
TASK = ReplanTask(job_id=JOB.id, delivery_token=TOKEN)
CLAIM = ClaimedReplanJob(job=JOB, effective_from=DAY, effective_through=DAY, horizon_end=DAY)
SETTINGS = TaskSettings(enabled=True, queue="projects/test/locations/us-east1/queues/planning",
    worker_url="https://worker.example.run.app", invoker_email="invoker@test.iam.gserviceaccount.com")


class DispatcherTests(unittest.TestCase):
    def setUp(self):
        self.due = self.enterContext(patch.object(replan_jobs, "enqueue_due_replans", return_value=1))
        self.scan = self.enterContext(patch.object(replan_jobs, "list_replan_deliveries", return_value=[JOB]))
        self.mark = self.enterContext(patch.object(replan_jobs, "mark_replan_dispatched"))
        self.recover = self.enterContext(patch.object(replan_jobs, "recover_replan_delivery"))
        self.enqueue = self.enterContext(patch.object(scheduler, "enqueue_replan"))
        self.exists = self.enterContext(patch.object(scheduler, "task_exists", return_value=True))

    def test_due_jobs_are_dispatched_then_confirmed(self):
        self.enqueue.side_effect = lambda *args, **kwargs: self.mark.assert_not_called()
        result = scheduler.dispatch_due(SETTINGS)
        self.assertEqual(result, {"created": 1, "dispatched": 1, "errors": 0})
        self.mark.assert_called_once_with(JOB.id, TOKEN)
        self.exists.assert_not_called()

    def test_ambiguous_submission_remains_unconfirmed_for_next_tick(self):
        self.enqueue.side_effect = DeadlineExceeded("ambiguous")
        with self.assertLogs(scheduler.logger, level="WARNING"):
            self.assertEqual(scheduler.dispatch_due(SETTINGS)["errors"], 1)
        self.mark.assert_not_called()
        self.recover.assert_not_called()

    def test_existing_task_rotates_scan_order_without_duplicate_submission(self):
        self.scan.return_value = [JOB.model_copy(update={"dispatched_at": datetime.now(timezone.utc)})]
        scheduler.dispatch_due(SETTINGS)
        self.mark.assert_called_once_with(JOB.id, TOKEN)
        self.enqueue.assert_not_called()

    def test_missing_task_uses_database_reserved_generation(self):
        self.scan.return_value = [JOB.model_copy(update={"dispatched_at": datetime.now(timezone.utc)})]
        recovered = JOB.model_copy(update={"delivery_token": UUID(int=44)})
        self.exists.return_value = False
        self.recover.return_value = recovered
        scheduler.dispatch_due(SETTINGS)
        self.recover.assert_called_once_with(JOB.id, TOKEN)
        self.assertEqual(self.enqueue.call_args.args[0].delivery_token, recovered.delivery_token)

    def test_lookup_timeout_never_rotates_delivery_generation(self):
        self.scan.return_value = [JOB.model_copy(update={"dispatched_at": datetime.now(timezone.utc)})]
        self.exists.side_effect = DeadlineExceeded("uncertain")
        with self.assertLogs(scheduler.logger, level="WARNING"):
            scheduler.dispatch_due(SETTINGS)
        self.recover.assert_not_called()
        self.enqueue.assert_not_called()

    def test_terminal_recovery_and_lost_races_are_not_dispatched(self):
        self.scan.return_value = [JOB.model_copy(update={"dispatched_at": datetime.now(timezone.utc)})]
        self.exists.return_value = False
        for result in (None, JOB.model_copy(update={"status": "failed"})):
            self.recover.return_value = result
            scheduler.dispatch_due(SETTINGS)
        self.enqueue.assert_not_called()

    def test_disabled_dispatcher_does_not_touch_database(self):
        with patch.object(scheduler, "get_task_settings", return_value=TaskSettings(enabled=False)), TestClient(scheduler.app) as client:
            self.assertEqual(client.post("/dispatch").status_code, 503)
            scheduler.dispatch_after_commit(JOB)
        self.due.assert_not_called()
        self.enqueue.assert_not_called()

    def test_immediate_submission_failure_keeps_durable_acceptance(self):
        self.enqueue.side_effect = DeadlineExceeded("uncertain")
        with patch.object(scheduler, "get_task_settings", return_value=SETTINGS), self.assertLogs(scheduler.logger):
            self.assertIsNone(scheduler.dispatch_after_commit(JOB))
        self.mark.assert_not_called()

    def test_tick_stops_between_jobs_at_time_budget(self):
        with patch.object(scheduler, "monotonic", side_effect=[0, 46]):
            self.assertEqual(scheduler.dispatch_due(SETTINGS)["dispatched"], 0)
        self.enqueue.assert_not_called()


class WorkerTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.claim = self.enterContext(patch.object(replan_jobs, "claim_replan_delivery",
            return_value=ReplanDeliveryClaim(status="claimed", claim=CLAIM)))
        self.complete = self.enterContext(patch.object(replan_jobs, "complete_replan_job"))
        self.fail = self.enterContext(patch.object(replan_jobs, "fail_replan_job", return_value=JOB))
        self.generate = AsyncMock(return_value=ReplanResult(before_ids=[], workouts=[]))

    async def test_acknowledgement_waits_for_generation_and_atomic_publication(self):
        started, finish = asyncio.Event(), asyncio.Event()

        async def generate(claim):
            started.set()
            await finish.wait()
            return ReplanResult(before_ids=[], workouts=[])

        request = asyncio.create_task(replan_worker.execute(TASK, generate))
        await asyncio.wait_for(started.wait(), 1)
        self.assertFalse(request.done())
        self.complete.assert_not_called()
        finish.set()
        self.assertEqual(await asyncio.wait_for(request, 1), {"status": "succeeded"})
        self.claim.assert_called_once_with(JOB.id, TOKEN, 300)
        self.complete.assert_called_once_with(JOB.id, JOB.lease_token, [], [])

    async def test_terminal_missing_and_stale_deliveries_skip_generation(self):
        for status in ("terminal", "missing", "obsolete"):
            self.claim.return_value = ReplanDeliveryClaim(status=status)
            self.assertEqual(await replan_worker.execute(TASK, self.generate), {"status": status})
        self.generate.assert_not_awaited()
        self.complete.assert_not_called()

    async def test_busy_and_delayed_jobs_request_retry_without_an_attempt(self):
        for status in ("busy", "not_ready"):
            self.claim.return_value = ReplanDeliveryClaim(status=status)
            with self.assertRaises(HTTPException) as raised:
                await replan_worker.execute(TASK, self.generate)
            self.assertEqual(raised.exception.status_code, 503)
        self.generate.assert_not_awaited()
        self.fail.assert_not_called()

    async def test_failure_is_sanitized_and_retry_depends_on_durable_outcome(self):
        self.generate.side_effect = RuntimeError("private input must not be recorded")
        with self.assertLogs(replan_worker.logger), self.assertRaises(HTTPException):
            await replan_worker.execute(TASK, self.generate)
        self.fail.assert_called_with(JOB.id, JOB.lease_token, "RuntimeError", True)
        self.fail.return_value = JOB.model_copy(update={"status": "failed"})
        with self.assertLogs(replan_worker.logger):
            self.assertEqual(await replan_worker.execute(TASK, self.generate), {"status": "failed"})

    async def test_timeout_stops_generation_before_lease_expiry(self):
        async def slow(claim):
            await asyncio.sleep(10)
        with patch.object(replan_worker, "ATTEMPT_SECONDS", 0.01), self.assertLogs(replan_worker.logger), self.assertRaises(HTTPException):
            await replan_worker.execute(TASK, slow)
        self.fail.assert_called_once_with(JOB.id, JOB.lease_token, "TimeoutError", True)
        self.complete.assert_not_called()

    async def test_cancellation_leaves_lease_for_recovery_without_publishing(self):
        self.generate.side_effect = asyncio.CancelledError
        with self.assertRaises(asyncio.CancelledError):
            await replan_worker.execute(TASK, self.generate)
        self.complete.assert_not_called()
        self.fail.assert_not_called()

    async def test_graph_adapter_loads_context_off_event_loop_and_publishes_subclass(self):
        context = object()
        event_thread = get_ident()
        proposal = PlanningProposal(before_ids=[], workouts=[], day_decisions=[])

        def load(claim):
            self.assertNotEqual(get_ident(), event_thread)
            self.assertIs(claim, CLAIM)
            return context

        with patch.object(calendar, "get_replan_context", side_effect=load) as read, \
                patch("app.ai.workflows.plan.graph.generate_plan", new=AsyncMock(return_value=proposal)) as generate:
            self.assertEqual(await replan_worker.execute(TASK, replan_worker.plan_job), {"status": "succeeded"})
        read.assert_called_once_with(CLAIM)
        generate.assert_awaited_once_with(CLAIM, context)
        self.complete.assert_called_once_with(JOB.id, JOB.lease_token, [], [])
        self.fail.assert_not_called()

    async def test_stale_context_never_reaches_graph_or_publication(self):
        with patch.object(calendar, "get_replan_context", side_effect=SupabaseDataError("stale", status_code=409)), \
                patch("app.ai.workflows.plan.graph.generate_plan", new=AsyncMock()) as generate, \
                self.assertLogs(replan_worker.logger), self.assertRaises(HTTPException) as raised:
            await replan_worker.execute(TASK, replan_worker.plan_job)
        self.assertEqual(raised.exception.status_code, 503)
        generate.assert_not_awaited()
        self.complete.assert_not_called()
        self.fail.assert_called_once_with(JOB.id, JOB.lease_token, "SupabaseDataError", True)

    async def test_graph_failure_and_revision_conflict_leave_calendar_unpublished(self):
        with patch.object(calendar, "get_replan_context", return_value=object()), \
                patch("app.ai.workflows.plan.graph.generate_plan", new=AsyncMock(side_effect=ValueError("invalid proposal"))), \
                self.assertLogs(replan_worker.logger), self.assertRaises(HTTPException):
            await replan_worker.execute(TASK, replan_worker.plan_job)
        self.complete.assert_not_called()
        self.fail.assert_called_once_with(JOB.id, JOB.lease_token, "ValueError", True)

        self.fail.reset_mock()
        self.complete.side_effect = SupabaseDataError("revision changed", status_code=409)
        with self.assertLogs(replan_worker.logger), self.assertRaises(HTTPException):
            await replan_worker.execute(TASK, self.generate)
        self.fail.assert_called_once_with(JOB.id, JOB.lease_token, "SupabaseDataError", True)

    async def test_lost_publication_response_is_reconciled_without_regeneration(self):
        self.complete.side_effect = SupabaseDataError("publication response lost")
        self.fail.side_effect = SupabaseDataError("job already completed", status_code=409)
        with self.assertLogs(replan_worker.logger), self.assertRaises(SupabaseDataError):
            await replan_worker.execute(TASK, self.generate)
        self.claim.return_value = ReplanDeliveryClaim(status="terminal")
        self.assertEqual(await replan_worker.execute(TASK, self.generate), {"status": "terminal"})
        self.generate.assert_awaited_once()
        self.complete.assert_called_once()
        self.fail.assert_called_once()


class RuntimeBoundaryTests(unittest.TestCase):
    def test_unconfigured_worker_rejects_before_claiming(self):
        with patch.object(replan_jobs, "claim_replan_delivery") as claim, TestClient(replan_worker.create_app()) as client:
            self.assertFalse(client.get("/health").json()["planner_ready"])
            self.assertEqual(client.post("/run", json=TASK.model_dump(mode="json")).status_code, 503)
        claim.assert_not_called()

    def test_deployed_worker_has_a_plan_handler(self):
        with TestClient(replan_worker.app) as client:
            self.assertTrue(client.get("/health").json()["planner_ready"])

    def test_uncertain_database_outcome_is_retryable_without_leaking_details(self):
        worker = replan_worker.create_app(AsyncMock())
        with patch.object(replan_jobs, "claim_replan_delivery", side_effect=SupabaseDataError("private")), TestClient(worker) as client:
            with self.assertLogs(replan_worker.logger):
                response = client.post("/run", json=TASK.model_dump(mode="json"))
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("private", response.text)

    def test_enabled_configuration_requires_queue_and_identity(self):
        with self.assertRaises(ValidationError):
            TaskSettings(enabled=True, queue="", worker_url="", invoker_email="")

    def test_new_rpc_wrappers_use_backend_credentials_and_expected_shapes(self):
        http = Mock()
        with httpx.Client(transport=httpx.MockTransport(http)) as client, \
                patch("app.db.supabase.transport.get_http_client", return_value=client):
            http.return_value = httpx.Response(200, json=[JOB.model_dump(mode="json")])
            self.assertEqual(replan_jobs.list_replan_deliveries()[0].delivery_token, TOKEN)
            http.return_value = httpx.Response(200, json={"status": "terminal"})
            self.assertEqual(replan_jobs.claim_replan_delivery(JOB.id, TOKEN).status, "terminal")
            http.return_value = httpx.Response(200, json=JOB.model_dump(mode="json"))
            self.assertEqual(replan_jobs.recover_replan_delivery(JOB.id, TOKEN).id, JOB.id)
            http.return_value = httpx.Response(200, json=None)
            self.assertIsNone(replan_jobs.recover_replan_delivery(JOB.id, TOKEN))
            self.assertIsNone(replan_jobs.mark_replan_dispatched(JOB.id, TOKEN))
            for call in http.call_args_list:
                self.assertIsNone(call.args[0].headers.get("Authorization"))
