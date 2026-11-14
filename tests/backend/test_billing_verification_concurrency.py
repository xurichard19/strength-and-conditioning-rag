"""Separate API instances must not repeatedly invalidate each other's verification."""

from datetime import timedelta
import importlib.util
from threading import Event, Lock, Thread, current_thread
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from app.contracts import BillingSnapshot
from app.db.supabase import billing as database
from app.integrations.revenuecat import RevenueCatUnavailable
from app.services import billing
from tests.backend.test_billing import NOW, OWNER, record, settings


class BillingVerificationConcurrencyTests(unittest.TestCase):
    def check_two_instances(self, outcome, *, slow=False):
        # Loading twice gives each server its own lock, in-flight Future, and rate limit.
        instances = {}
        for name in ('first', 'second'):
            spec = importlib.util.spec_from_file_location('billing_' + name, billing.__file__)
            instance = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(instance)
            instances[name] = instance
        row = record(verified_at=None, outage_access_until=NOW + timedelta(hours=23))
        original_revision = row.sync_revision
        original_allowance = row.outage_access_until
        lock = Lock()
        first_claimed, second_claimed, first_waiting, second_finished = (Event() for _ in range(4))
        first_reclaimed, second_reclaimed, final_wait = (Event() for _ in range(3))
        counts = {'claims': 0, 'provider': 0}
        attempts = {'first': 0, 'second': 0}
        elapsed = 0
        results, errors = {}, []

        def wait(event):
            if not event.wait(2):
                raise AssertionError('concurrent verification did not reach the expected step')

        def claim(*args):
            nonlocal row
            name = current_thread().name
            if name == 'second':
                wait(first_claimed)
            with lock:
                counts['claims'] += 1
                attempts[name] += 1
                row = row.model_copy(update={'sync_revision': row.sync_revision + 1,
                    'verified_at': None, 'verification_retry_at': None})
                (first_claimed if name == 'first' else second_claimed).set()
                if attempts[name] == 2:
                    (first_reclaimed if name == 'first' else second_reclaimed).set()
                return row

        def fetch(*args, **kwargs):
            with lock:
                counts['provider'] += 1
            name = current_thread().name
            if slow:
                # A/B first claim at t0, A reclaims at t2, B at t4. Hold B's last
                # response until t7, beyond A's second two-second wait but before t10.
                waits = {('first', 1): second_claimed, ('second', 1): first_reclaimed,
                    ('first', 2): second_reclaimed, ('second', 2): final_wait}
                wait(waits[(name, attempts[name])])
            else:
                wait(second_claimed if name == 'first' else first_waiting)
            if outcome == 'outage':
                raise RevenueCatUnavailable('temporary')
            return BillingSnapshot(active=outcome == 'paid', period_type='normal',
                expires_at=NOW + timedelta(days=1))

        def save(user, environment, revision, snapshot=None):
            nonlocal row
            with lock:
                # Match the database revision fence, including its single-result guard.
                if row.sync_revision != revision or row.verified_at is not None:
                    return None
                if snapshot is None:
                    if row.verification_retry_at is not None:
                        return None
                    row = row.model_copy(update={'verification_retry_at': NOW + timedelta(seconds=60)})
                else:
                    row = row.model_copy(update={**snapshot.model_dump(), 'verified_at': NOW,
                        'verification_retry_at': None,
                        'outage_access_until': min(NOW + timedelta(hours=24), snapshot.expires_at)
                            if snapshot.active else None})
                second_finished.set()
                return row

        def read(*args):
            with lock:
                return row

        def poll_delay(seconds):
            nonlocal elapsed
            if slow:
                elapsed += seconds
                if current_thread().name == 'first' and attempts['first'] == 2 and elapsed >= 7:
                    final_wait.set()
                    wait(second_finished)
                return
            first_waiting.set()
            wait(second_finished)

        def run(name):
            try:
                results[name] = instances[name].get_billing_status(OWNER, force=True)
            except Exception as error:
                errors.append(error)

        with patch.object(database, 'claim_verification', side_effect=claim), \
                patch.object(database, 'commit_entitlement', side_effect=save), \
                patch.object(database, 'defer_verification', side_effect=save), \
                patch.object(database, 'get_entitlement', side_effect=read):
            for instance in instances.values():
                self.enterContext(patch.object(instance, 'get_billing_settings', return_value=settings()))
                self.enterContext(patch.object(instance, 'fetch_entitlement', side_effect=fetch))
                self.enterContext(patch.object(instance, 'time', SimpleNamespace(
                    monotonic=(lambda: elapsed) if slow else time.monotonic, sleep=poll_delay)))
            threads = [Thread(target=run, args=(name,), name=name) for name in instances]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(3)
            self.assertFalse(any(thread.is_alive() for thread in threads))
        self.assertEqual(errors, [])
        expected = 4 if slow else 2
        self.assertEqual(counts, {'claims': expected, 'provider': expected})
        self.assertEqual(row.sync_revision, original_revision + expected)
        if slow:
            self.assertEqual(elapsed, 7)
        self.assertEqual(set(results), set(instances))
        self.assertEqual(results['first'], results['second'])
        self.assertEqual(results['first'].has_access, outcome != 'inactive')
        if outcome == 'outage':
            self.assertIsNone(row.verified_at)
            self.assertEqual(row.outage_access_until, original_allowance)
            self.assertIsNotNone(row.verification_retry_at)
        else:
            self.assertEqual(row.verified_at, NOW)

    def test_successful_verifications_share_the_newer_paid_result(self):
        self.check_two_instances('paid')

    def test_outage_verifications_share_the_newer_deferred_result(self):
        self.check_two_instances('outage')

    def test_newer_inactive_result_replaces_the_older_paid_state(self):
        self.check_two_instances('inactive')

    def test_slow_paid_verification_survives_both_instances_reclaiming_once(self):
        self.check_two_instances('paid', slow=True)

    def test_slow_outage_verification_survives_both_instances_reclaiming_once(self):
        self.check_two_instances('outage', slow=True)
