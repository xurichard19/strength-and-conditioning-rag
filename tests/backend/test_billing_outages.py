"""Provider outages preserve bounded paid access, never planning authorization."""

from datetime import timedelta
import io
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

from fastapi import HTTPException

from app.auth.billing import require_paid_user
from app.contracts import BillingSnapshot
from app.integrations import revenuecat
from app.services import billing, planning_access
from app.db.supabase import billing as database
from tests.backend.test_billing import NOW, OWNER, SECOND, record, settings
from tests.backend.test_profile import USER


class BillingOutageTests(unittest.TestCase):
    def setUp(self):
        billing._attempts.clear(); billing._inflight.clear()
        self.elapsed = 0
        self.enterContext(patch.object(billing, 'time', SimpleNamespace(
            monotonic=lambda: self.elapsed, sleep=self.advance_time)))
        self.row = record(verified_at=NOW - timedelta(minutes=6), outage_access_until=NOW + timedelta(hours=23))
        self.enterContext(patch.object(billing, 'get_billing_settings', return_value=settings()))
        self.read = self.enterContext(patch.object(database, 'get_entitlement', side_effect=lambda *_: self.row))
        self.claim = self.enterContext(patch.object(database, 'claim_verification', side_effect=self.claim_row))
        self.defer = self.enterContext(patch.object(database, 'defer_verification', side_effect=self.defer_row))
        self.commit = self.enterContext(patch.object(database, 'commit_entitlement', side_effect=self.commit_row))
        self.fetch = self.enterContext(patch.object(billing, 'fetch_entitlement',
            side_effect=revenuecat.RevenueCatUnavailable('temporary')))

    def advance_time(self, seconds):
        self.elapsed += seconds

    def claim_row(self, owner, environment):
        self.assertEqual((owner, environment), (OWNER, 'sandbox'))
        self.row = self.row.model_copy(update={'verified_at': None, 'verification_retry_at': None,
            'sync_revision': self.row.sync_revision + 1})
        return self.row

    def defer_row(self, owner, environment, revision):
        if self.row.sync_revision != revision or self.row.verified_at is not None:
            return None
        self.row = self.row.model_copy(update={'verification_retry_at': NOW + timedelta(seconds=60)})
        return self.row

    def commit_row(self, owner, environment, revision, snapshot):
        if self.row.sync_revision != revision or self.row.verified_at is not None:
            return None
        self.row = self.row.model_copy(update={**snapshot.model_dump(), 'verified_at': NOW,
            'verification_retry_at': None, 'outage_access_until': min(NOW + timedelta(hours=24), snapshot.expires_at)
                if snapshot.active and snapshot.period_type in ('normal', 'intro') and snapshot.expires_at > NOW else None})
        return self.row

    def invalidate(self):
        self.row = self.row.model_copy(update={'verified_at': None, 'outage_access_until': None,
            'verification_retry_at': None, 'sync_revision': self.row.sync_revision + 1})

    def paid_snapshot(self):
        return BillingSnapshot(**{name: getattr(record(), name) for name in BillingSnapshot.model_fields})

    def test_outage_preserves_paid_access_and_shares_cooldown_without_extending_allowance(self):
        deadline = self.row.outage_access_until
        for _ in range(3):
            self.assertTrue(billing.get_billing_status(OWNER).has_access)
        self.assertEqual(self.row.outage_access_until, deadline)
        self.assertIsNone(self.row.verified_at)
        self.fetch.assert_called_once(); self.claim.assert_called_once(); self.defer.assert_called_once()
        self.commit.assert_not_called()

    def test_cooldown_expiry_checks_again_without_extending_access(self):
        billing.get_billing_status(OWNER)
        deadline = self.row.outage_access_until
        self.row = self.row.model_copy(update={'verification_retry_at': NOW - timedelta(seconds=1)})
        self.assertTrue(billing.get_billing_status(OWNER).has_access)
        self.assertEqual(self.fetch.call_count, 2)
        self.assertEqual(self.row.outage_access_until, deadline)

    def test_explicit_sync_can_retry_during_cooldown_and_recover(self):
        billing.get_billing_status(OWNER)
        self.fetch.side_effect = None; self.fetch.return_value = self.paid_snapshot()
        result = billing.get_billing_status(OWNER, force=True)
        self.assertTrue(result.has_access); self.assertEqual(result.verified_at, NOW)
        self.assertIsNone(self.row.verification_retry_at)
        self.assertEqual(self.fetch.call_count, 2)

    def test_current_outage_cannot_authorize_new_planning(self):
        self.assertTrue(billing.get_billing_status(OWNER).has_access)
        with self.assertRaises(planning_access.PlanningDeferred) as error:
            planning_access.permission_for(OWNER)
        self.assertEqual(error.exception.reason, 'billing_unavailable')
        self.fetch.assert_called_once()

    def test_protected_requests_keep_working_until_confirmed_payment_loss(self):
        self.assertEqual(require_paid_user(USER), USER)
        self.fetch.side_effect = None
        self.fetch.return_value = BillingSnapshot(active=False)
        self.assertFalse(billing.get_billing_status(OWNER, force=True).has_access)
        self.assertIsNone(self.row.outage_access_until)
        with self.assertRaises(HTTPException) as error:
            require_paid_user(USER)
        self.assertEqual(error.exception.status_code, 403)
        self.assertEqual(error.exception.detail, 'subscription_required')

    def test_only_an_unexpired_previously_paid_allowance_is_eligible(self):
        cases = [{'outage_access_until': None}, {'outage_access_until': NOW},
            {'expires_at': NOW}, {'active': False}, {'period_type': 'trial'},
            {'expires_at': NOW - timedelta(seconds=1), 'grace_expires_at': NOW + timedelta(hours=1)}]
        for changes in cases:
            with self.subTest(changes=changes):
                self.row = record(verified_at=None, outage_access_until=NOW + timedelta(hours=1),
                    verification_retry_at=NOW + timedelta(seconds=60)).model_copy(update=changes)
                with self.assertRaises(billing.BillingUnavailable):
                    billing.get_billing_status(OWNER)
        self.fetch.assert_not_called()

    def test_deadline_without_a_recorded_provider_failure_does_not_grant_access(self):
        self.fetch.side_effect = revenuecat.RevenueCatError('malformed payload')
        with self.assertRaises(billing.BillingUnavailable):
            billing.get_billing_status(OWNER)
        self.defer.assert_not_called()
        self.assertIsNone(self.row.verification_retry_at)

    def test_force_failure_from_invalid_payload_or_credentials_does_not_use_old_allowance(self):
        billing.get_billing_status(OWNER)
        self.fetch.side_effect = revenuecat.RevenueCatError('configuration or payload failure')
        with self.assertRaises(billing.BillingUnavailable):
            billing.get_billing_status(OWNER, force=True)
        self.assertIsNone(self.row.verification_retry_at)
        self.assertEqual(self.defer.call_count, 1)

    def test_webhook_during_outage_cannot_be_undone_by_late_failure(self):
        def fail_after_webhook(*args, **kwargs):
            self.invalidate()
            raise revenuecat.RevenueCatUnavailable('temporary')
        self.fetch.side_effect = fail_after_webhook
        with self.assertRaises(billing.BillingUnavailable):
            billing.get_billing_status(OWNER)
        self.assertIsNone(self.row.outage_access_until)
        self.assertIsNone(self.row.verification_retry_at)

    def test_webhook_after_outage_blocks_allowance_until_successful_verification(self):
        billing.get_billing_status(OWNER)
        self.invalidate()
        with self.assertRaises(billing.BillingUnavailable):
            billing.get_billing_status(OWNER)
        self.fetch.side_effect = None; self.fetch.return_value = self.paid_snapshot()
        self.assertTrue(billing.get_billing_status(OWNER, force=True).has_access)

    def test_final_read_rejects_a_webhook_after_failure_was_recorded(self):
        initial = self.row
        failed = initial.model_copy(update={'verified_at': None, 'sync_revision': 3,
            'verification_retry_at': NOW + timedelta(seconds=60)})
        invalid = failed.model_copy(update={'outage_access_until': None, 'verification_retry_at': None,
            'sync_revision': 4})
        self.read.side_effect = [initial, failed, invalid]
        with self.assertRaises(billing.BillingUnavailable):
            billing.get_billing_status(OWNER)

    def test_superseded_verification_waits_for_current_state_without_reclaiming(self):
        self.fetch.side_effect = None; self.fetch.return_value = self.paid_snapshot()
        self.commit.side_effect = lambda *args: self.invalidate()
        def complete_newer_claim(seconds):
            self.advance_time(seconds)
            self.commit_row(OWNER, 'sandbox', self.row.sync_revision, self.paid_snapshot())
        with patch.object(billing.time, 'sleep', side_effect=complete_newer_claim):
            self.assertTrue(billing.get_billing_status(OWNER).has_access)
        self.fetch.assert_called_once()
        self.claim.assert_called_once()
        self.commit.assert_called_once()

    def test_webhook_during_verification_reclaims_once_after_a_short_wait(self):
        self.fetch.side_effect = None; self.fetch.return_value = self.paid_snapshot()
        saves = []
        def webhook_then_save(*args):
            saves.append(args)
            return self.invalidate() if len(saves) == 1 else self.commit_row(*args)
        self.commit.side_effect = webhook_then_save
        self.assertTrue(billing.get_billing_status(OWNER, force=True).has_access)
        self.assertEqual(self.elapsed, billing.SUPERSEDED_WAIT_SECONDS)
        self.assertEqual(self.claim.call_count, 2)
        self.assertEqual(self.fetch.call_count, 2)
        self.assertEqual(self.row.verified_at, NOW)

    def test_repeated_webhooks_allow_one_reclaim_and_never_a_third_claim(self):
        self.fetch.side_effect = None; self.fetch.return_value = self.paid_snapshot()
        self.commit.side_effect = lambda *args: self.invalidate()
        def another_webhook(seconds):
            self.advance_time(seconds)
            self.invalidate()
        with patch.object(billing.time, 'sleep', side_effect=another_webhook), self.assertRaises(billing.BillingUnavailable):
            billing.get_billing_status(OWNER)
        self.assertEqual(self.elapsed, billing.VERIFICATION_BUDGET_SECONDS)
        self.assertEqual(self.claim.call_count, 2)
        self.assertEqual(self.fetch.call_count, 2)

    def test_stalled_newer_claim_wait_uses_only_the_remaining_provider_budget(self):
        read_times = []
        def timed_read(*args):
            read_times.append(self.elapsed)
            return self.row
        def slow_provider(*args, **kwargs):
            self.advance_time(8)
            return self.paid_snapshot()
        self.read.side_effect = timed_read
        self.fetch.side_effect = slow_provider
        self.commit.side_effect = lambda *args: self.invalidate()
        with self.assertRaises(billing.BillingUnavailable):
            billing._verify(OWNER, 'sandbox')
        self.assertEqual(self.elapsed, billing.VERIFICATION_BUDGET_SECONDS)
        self.assertGreater(len(read_times), 1)
        self.assertTrue(all(stamp < billing.VERIFICATION_BUDGET_SECONDS for stamp in read_times))
        self.fetch.assert_called_once_with(OWNER, 'sandbox', 'server-key', timeout=8)
        self.claim.assert_called_once()

    def test_webhook_after_waiting_for_success_still_fails_the_final_read(self):
        initial = self.row
        pending = initial.model_copy(update={'verified_at': None, 'sync_revision': 4})
        saved = pending.model_copy(update={'verified_at': NOW})
        invalid = pending.model_copy(update={'sync_revision': 5, 'outage_access_until': None})
        self.read.side_effect = [initial, pending, saved, invalid]
        self.fetch.side_effect = None; self.fetch.return_value = self.paid_snapshot()
        self.commit.return_value = None; self.commit.side_effect = None
        with self.assertRaises(billing.BillingUnavailable):
            billing.get_billing_status(OWNER)
        self.claim.assert_called_once()
        self.fetch.assert_called_once()

    def test_slow_poll_cannot_reclaim_after_deadline_or_clear_newer_paid_result(self):
        self.fetch.side_effect = None; self.fetch.return_value = self.paid_snapshot()
        self.commit.side_effect = lambda *args: self.invalidate()
        def slow_poll(*args):
            observed = self.row
            if self.elapsed == billing.SUPERSEDED_WAIT_SECONDS:
                # Another verifier succeeds while an older query response is still in flight.
                self.commit_row(OWNER, 'sandbox', self.row.sync_revision, self.paid_snapshot())
                self.advance_time(9)
            return observed
        self.read.side_effect = slow_poll
        with self.assertRaises(billing.BillingUnavailable):
            billing._verify(OWNER, 'sandbox')
        self.assertGreater(self.elapsed, billing.VERIFICATION_BUDGET_SECONDS)
        self.assertEqual(self.row.verified_at, NOW)
        self.claim.assert_called_once()
        self.fetch.assert_called_once()

    def test_expired_budget_does_not_start_a_claim(self):
        with patch.object(billing.time, 'monotonic', side_effect=[0, billing.VERIFICATION_BUDGET_SECONDS]), \
                self.assertRaises(billing.BillingUnavailable):
            billing._verify(OWNER, 'sandbox')
        self.claim.assert_not_called()
        self.fetch.assert_not_called()

    def test_expired_cooldown_on_a_newer_claim_does_not_end_the_wait(self):
        self.fetch.side_effect = None; self.fetch.return_value = self.paid_snapshot()
        def expired_deferral(*args):
            self.invalidate()
            self.row = self.row.model_copy(update={'verification_retry_at': NOW - timedelta(seconds=1)})
        self.commit.side_effect = expired_deferral
        with self.assertRaises(billing.BillingUnavailable):
            billing.get_billing_status(OWNER)
        # The stale marker is never returned; the final attempt uses the remaining budget.
        self.assertEqual(self.elapsed, billing.VERIFICATION_BUDGET_SECONDS)
        self.assertEqual(self.claim.call_count, 2)

    def test_account_removed_during_verification_stops_without_waiting(self):
        self.read.side_effect = [self.row, None]
        with self.assertRaises(billing.BillingUnavailable):
            billing.get_billing_status(OWNER)
        self.assertEqual(self.elapsed, 0)
        self.claim.assert_called_once()

    def test_database_failure_never_falls_back_to_the_pre_read_snapshot(self):
        self.read.side_effect = [self.row, database.SupabaseDataError('unavailable')]
        with self.assertRaises(billing.BillingUnavailable):
            billing.get_billing_status(OWNER)

    def test_different_account_has_its_own_database_lookup(self):
        self.read.return_value = None; self.read.side_effect = None
        self.claim.side_effect = None; self.claim.return_value = None
        with self.assertRaises(billing.BillingUnavailable):
            billing.get_billing_status(SECOND)
        self.read.assert_called_once_with(SECOND, 'sandbox')
        self.fetch.assert_not_called()


class RevenueCatFailureClassificationTests(unittest.TestCase):
    def test_only_transient_http_and_network_failures_qualify_for_outage_fallback(self):
        for code in (400, 401, 403, 404, 429, 500, 502, 503):
            with self.subTest(code=code), patch.object(revenuecat, 'urlopen', side_effect=HTTPError(
                    'https://example.invalid', code, 'private', {}, None)), self.assertRaises(revenuecat.RevenueCatError) as error:
                revenuecat.fetch_entitlement(OWNER, 'sandbox', 'test')
            self.assertEqual(isinstance(error.exception, revenuecat.RevenueCatUnavailable), code == 429 or code >= 500)
        with patch.object(revenuecat, 'urlopen', side_effect=TimeoutError()), self.assertRaises(revenuecat.RevenueCatUnavailable):
            revenuecat.fetch_entitlement(OWNER, 'sandbox', 'test')
        with patch.object(revenuecat, 'urlopen', return_value=io.BytesIO(b'not json')), self.assertRaises(revenuecat.RevenueCatError) as error:
            revenuecat.fetch_entitlement(OWNER, 'sandbox', 'test')
        self.assertNotIsInstance(error.exception, revenuecat.RevenueCatUnavailable)
