"""Payment waiting is durable scheduling state, never a failed generation attempt."""

from datetime import UTC, datetime, timedelta
import unittest
from unittest.mock import AsyncMock, patch
from uuid import UUID

from fastapi import HTTPException

from app.api.routers import planning
from app.contracts import BillingEntitlementRecord, PlanningBillingWork, ReplanDeliveryClaim, ReplanResult
from app.jobs import replan_worker, scheduler
from app.services import billing, planning_access
from tests.backend.test_endpoints import SCHEDULE, USER
from tests.backend.test_planning_runtime import CLAIM, JOB, SETTINGS, TASK


WAKE = UUID(int=99)
PROOF = planning_access.PlanningPermission("sandbox", 7)


def entitlement(**updates):
    now = datetime.now(UTC)
    return BillingEntitlementRecord(user_id=USER.id, environment="sandbox", sync_revision=7,
        active=True, period_type="normal", product_id="monthly", store="test_store",
        verified_at=now, updated_at=now, expires_at=now + timedelta(days=1)).model_copy(update=updates)


class PlanningAccessTests(unittest.TestCase):
    def setUp(self):
        self.verify = self.enterContext(patch.object(billing, "get_verified_entitlement", return_value=entitlement()))
        self.resume = self.enterContext(patch.object(planning_access.planning_schedules, "resume_planning", return_value=True))
        self.defer = self.enterContext(patch.object(planning_access.planning_schedules, "defer_planning", return_value=True))

    def test_verified_payment_resumes_with_the_exact_environment_and_revision(self):
        self.assertTrue(planning_access.reconcile_user(USER.id))
        self.resume.assert_called_once_with(USER.id, billing_environment="sandbox", billing_revision=7, wake_token=None)
        self.defer.assert_not_called()

    def test_unpaid_trial_and_grace_wait_without_resuming(self):
        now = datetime.now(UTC)
        for updates in ({"active": False}, {"period_type": "trial"},
                        {"expires_at": now - timedelta(seconds=1), "grace_expires_at": now + timedelta(days=1)}):
            with self.subTest(updates=updates):
                self.verify.return_value = entitlement(**updates)
                self.assertFalse(planning_access.reconcile_user(USER.id))
                self.defer.assert_called_with(USER.id, "subscription_required", None,
                    billing_environment="sandbox", billing_revision=7, wake_token=None)
        self.resume.assert_not_called()

    def test_provider_failure_defers_with_a_shorter_recheck(self):
        self.verify.side_effect = billing.BillingUnavailable()
        self.assertFalse(planning_access.reconcile_user(USER.id))
        self.defer.assert_called_once_with(USER.id, "billing_unavailable", 60,
            billing_environment=None, billing_revision=None, wake_token=None)
        self.resume.assert_not_called()

    def test_invalidation_between_verification_and_resume_remains_recoverable(self):
        self.resume.return_value = False
        self.assertFalse(planning_access.reconcile_user(USER.id))
        self.defer.assert_called_once_with(USER.id, "billing_unavailable", 60,
            billing_environment=None, billing_revision=None, wake_token=None)

    def test_disabled_billing_does_not_supply_a_fake_entitlement(self):
        self.verify.return_value = None
        self.assertEqual(planning_access.permission_for(USER.id), planning_access.PlanningPermission())

    def test_post_purchase_activation_failure_does_not_fail_the_purchase(self):
        self.resume.side_effect = RuntimeError("scheduling unavailable")
        with patch.object(billing, "billing_enabled", return_value=True), \
                patch.object(planning_access.planning_schedules, "get_planning_schedule",
                    return_value=SCHEDULE.model_copy(update={"billing_wake_token": WAKE})), \
                self.assertLogs(planning_access.logger):
            self.assertIsNone(planning_access.after_verification(USER.id))

    def test_activation_reuses_proof_and_resumes_once_for_multiple_deliveries(self):
        with patch.object(billing, "billing_enabled", return_value=True), \
                patch.object(planning_access.planning_schedules, "get_planning_schedule",
                    return_value=SCHEDULE.model_copy(update={"billing_wake_token": WAKE})), \
                patch.object(scheduler.replan_jobs, "get_pending_replans", return_value=[JOB, JOB]), \
                patch.object(scheduler, "dispatch_after_commit") as dispatch:
            planning_access.after_verification(USER.id, PROOF)
        self.verify.assert_not_called()
        self.resume.assert_called_once_with(USER.id, billing_environment="sandbox", billing_revision=7, wake_token=WAKE)
        self.assertEqual(dispatch.call_count, 2)

    def test_healthy_sync_without_a_wake_does_not_repeat_activation(self):
        with patch.object(billing, "billing_enabled", return_value=True), \
                patch.object(planning_access.planning_schedules, "get_planning_schedule", return_value=SCHEDULE):
            planning_access.after_verification(USER.id, PROOF)
        self.resume.assert_not_called()
        self.verify.assert_not_called()

    def test_reconciliation_acknowledges_only_its_observed_wake_when_deferring(self):
        self.verify.return_value = entitlement(active=False)
        self.assertFalse(planning_access.reconcile_user(USER.id, wake_token=WAKE))
        self.defer.assert_called_once_with(USER.id, "subscription_required", None,
            billing_environment="sandbox", billing_revision=7, wake_token=WAKE)


class PaidWorkerTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.enterContext(patch.object(billing, "billing_enabled", return_value=True))
        self.read = self.enterContext(patch.object(replan_worker.replan_jobs, "get_delivery_job", return_value=JOB))
        self.permission = self.enterContext(patch.object(planning_access, "permission_for",
            return_value=planning_access.PlanningPermission("sandbox", 7)))
        self.claim = self.enterContext(patch.object(replan_worker.replan_jobs, "claim_replan_delivery",
            return_value=ReplanDeliveryClaim(status="claimed", claim=CLAIM)))
        self.complete = self.enterContext(patch.object(replan_worker.replan_jobs, "complete_replan_job"))
        self.fail = self.enterContext(patch.object(replan_worker.replan_jobs, "fail_replan_job"))
        self.defer = self.enterContext(patch.object(planning_access, "defer", return_value=True))
        self.generate = AsyncMock(return_value=ReplanResult(before_ids=[], workouts=[]))

    async def test_unpaid_or_unavailable_does_not_claim_or_consume_an_attempt(self):
        for reason in ("subscription_required", "billing_unavailable"):
            proof = PROOF if reason == "subscription_required" else None
            self.permission.side_effect = planning_access.PlanningDeferred(reason, proof)
            self.assertEqual(await replan_worker.execute(TASK, self.generate), {"status": "deferred"})
            self.defer.assert_called_with(JOB.user_id, reason, permission=proof)
        self.claim.assert_not_called()
        self.generate.assert_not_awaited()
        self.fail.assert_not_called()

    async def test_claim_receives_the_verified_entitlement_revision(self):
        self.assertEqual(await replan_worker.execute(TASK, self.generate), {"status": "succeeded"})
        self.claim.assert_called_once_with(JOB.id, TASK.delivery_token, 300,
            billing_environment="sandbox", billing_revision=7)

    async def test_invalidation_at_claim_time_prevents_generation(self):
        self.claim.return_value = ReplanDeliveryClaim(status="billing_unavailable")
        self.assertEqual(await replan_worker.execute(TASK, self.generate), {"status": "deferred"})
        self.generate.assert_not_awaited()
        self.fail.assert_not_called()
        self.defer.assert_called_once_with(JOB.user_id, "billing_unavailable", permission=PROOF)

    async def test_superseded_denial_retries_instead_of_acknowledging_an_unretired_delivery(self):
        self.permission.side_effect = planning_access.PlanningDeferred("subscription_required", PROOF)
        self.defer.return_value = False
        with self.assertRaises(HTTPException) as raised:
            await replan_worker.execute(TASK, self.generate)
        self.assertEqual(raised.exception.status_code, 503)
        self.generate.assert_not_awaited()
        self.claim.assert_not_called()
        self.fail.assert_not_called()

    async def test_expiry_at_claim_time_passes_the_same_proof_to_permanent_deferral(self):
        self.claim.return_value = ReplanDeliveryClaim(status="billing_required")
        self.assertEqual(await replan_worker.execute(TASK, self.generate), {"status": "deferred"})
        self.defer.assert_called_once_with(JOB.user_id, "subscription_required", permission=PROOF)
        self.generate.assert_not_awaited()

    async def test_authorized_attempt_finishes_even_if_payment_expires_during_generation(self):
        async def generate(claim):
            self.permission.side_effect = planning_access.PlanningDeferred("subscription_required")
            return ReplanResult(before_ids=[], workouts=[])

        self.assertEqual(await replan_worker.execute(TASK, generate), {"status": "succeeded"})
        self.permission.assert_called_once()
        self.complete.assert_called_once()
        self.defer.assert_not_called()

    async def test_duplicate_live_delivery_does_not_pause_an_authorized_lease(self):
        self.read.return_value = JOB.model_copy(update={"status": "running",
            "lease_expires_at": datetime.now(UTC) + timedelta(minutes=1)})
        with self.assertRaises(HTTPException):
            await replan_worker.execute(TASK, self.generate)
        self.permission.assert_not_called()
        self.defer.assert_not_called()

    async def test_old_and_terminal_deliveries_do_not_reverify_or_generate(self):
        for stored in (None, JOB.model_copy(update={"status": "succeeded"})):
            self.read.return_value = stored
            await replan_worker.execute(TASK, self.generate)
        self.permission.assert_not_called()
        self.generate.assert_not_awaited()


class PaidDispatcherTests(unittest.TestCase):
    def setUp(self):
        self.enterContext(patch.object(billing, "billing_enabled", return_value=True))
        self.due = self.enterContext(patch.object(scheduler.replan_jobs, "enqueue_due_replans", return_value=0))
        self.work = self.enterContext(patch.object(scheduler.planning_schedules, "list_billing_work", return_value=[]))
        self.deliveries = self.enterContext(patch.object(scheduler.replan_jobs, "list_replan_deliveries", return_value=[]))

    def test_due_discovery_and_wake_batch_use_full_limit_without_paused_accounts(self):
        self.work.return_value = [PlanningBillingWork(user_id=UUID(int=i + 1), wake_token=WAKE) for i in range(20)]
        with patch.object(planning_access, "reconcile_user", return_value=True) as resume:
            result = scheduler.dispatch_due(SETTINGS)
        self.due.assert_called_once_with(20, include_paused=False)
        self.deliveries.assert_called_once_with(20, include_paused=False)
        self.work.assert_called_once_with(20)
        self.assertEqual(result["reconciled"], 20)
        self.assertEqual(resume.call_count, 20)
        resume.assert_any_call(UUID(int=1), wake_token=WAKE)

    def test_unpaid_delivery_is_paused_before_cloud_task_recovery(self):
        self.deliveries.return_value = [JOB]
        with patch.object(planning_access, "permission_for",
                    side_effect=planning_access.PlanningDeferred("subscription_required", PROOF)), \
                patch.object(planning_access, "defer", return_value=True) as defer, \
                patch.object(scheduler, "task_exists") as exists, \
                patch.object(scheduler.replan_jobs, "recover_replan_delivery") as recover, \
                patch.object(scheduler, "enqueue_replan") as enqueue:
            self.assertEqual(scheduler.dispatch_due(SETTINGS)["dispatched"], 0)
        defer.assert_called_once_with(JOB.user_id, "subscription_required", permission=PROOF)
        exists.assert_not_called()
        recover.assert_not_called()
        enqueue.assert_not_called()

    def test_paid_delivery_verifies_without_repeating_resume(self):
        self.deliveries.return_value = [JOB]
        with patch.object(planning_access, "permission_for", return_value=PROOF) as verify, \
                patch.object(planning_access, "reconcile_user") as resume, \
                patch.object(scheduler.replan_jobs, "get_delivery_job", return_value=JOB), \
                patch.object(scheduler, "enqueue_replan") as enqueue, \
                patch.object(scheduler.replan_jobs, "mark_replan_dispatched"):
            self.assertEqual(scheduler.dispatch_due(SETTINGS)["dispatched"], 1)
        verify.assert_called_once_with(JOB.user_id)
        resume.assert_not_called()
        enqueue.assert_called_once()

    def test_outage_rechecks_and_ready_deliveries_alternate_within_time_budget(self):
        self.work.return_value = [PlanningBillingWork(user_id=USER.id, wake_token=WAKE)] * 20
        self.deliveries.return_value = [JOB] * 20
        elapsed = [0]
        calls = []

        def slow(kind, result):
            def call(*args, **kwargs):
                calls.append(kind)
                elapsed[0] += 8
                return result
            return call

        with patch.object(scheduler, "monotonic", side_effect=lambda: elapsed[0]), \
                patch.object(planning_access, "reconcile_user", side_effect=slow("recheck", False)), \
                patch.object(scheduler, "_dispatch_delivery", side_effect=slow("delivery", True)):
            result = scheduler.dispatch_due(SETTINGS)
        self.assertEqual(calls, ["recheck", "delivery"] * 3)
        self.assertEqual(result["dispatched"], 3)
        self.assertEqual(result["reconciled"], 0)

    def test_disabled_billing_includes_paused_work_without_verification(self):
        with patch.object(billing, "billing_enabled", return_value=False), \
                patch.object(planning_access, "permission_for") as verify:
            self.assertEqual(scheduler.dispatch_due(SETTINGS), {"created": 0, "dispatched": 0, "errors": 0})
        self.due.assert_called_once_with(20, include_paused=True)
        self.deliveries.assert_called_once_with(20, include_paused=True)
        self.work.assert_not_called()
        verify.assert_not_called()


class InitialPlanStatusTests(unittest.TestCase):
    def test_terminal_failure_remains_visible_and_redacts_worker_details(self):
        with patch.object(planning.replan_jobs, "get_latest_initial_job", return_value=JOB.model_copy(update={"status": "failed"})):
            result = planning._schedule_response(SCHEDULE.model_copy(update={"billing_wake_token": WAKE}))
        self.assertEqual(result.initial_plan_status, "failed")
        self.assertEqual(result.initial_plan_job.id, JOB.id)
        self.assertNotIn("lease_token", result.model_dump_json())
        self.assertNotIn("billing_wake_token", result.model_dump_json())
        self.assertNotIn("private-error", result.model_dump_json())

    def test_ready_plan_does_not_query_initial_job_history(self):
        with patch.object(planning.replan_jobs, "get_latest_initial_job") as read:
            result = planning._schedule_response(SCHEDULE.model_copy(update={"horizon_end": CLAIM.horizon_end}))
        self.assertEqual(result.initial_plan_status, "ready")
        read.assert_not_called()

    def test_payment_pause_does_not_hide_an_authorized_running_attempt(self):
        schedule = SCHEDULE.model_copy(update={"billing_pause_reason": "subscription_required"})
        with patch.object(planning.replan_jobs, "get_latest_initial_job", return_value=JOB.model_copy(update={"status": "running"})):
            self.assertEqual(planning._schedule_response(schedule).initial_plan_status, "running")
        with patch.object(planning.replan_jobs, "get_latest_initial_job", return_value=None):
            self.assertEqual(planning._schedule_response(schedule).initial_plan_status, "deferred")
