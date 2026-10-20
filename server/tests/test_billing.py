from concurrent.futures import Future
from datetime import UTC, datetime, timedelta
import hashlib
import hmac
import io
import json
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from uuid import UUID

from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import SecretStr, ValidationError

from app.api.routers import billing as routes
from app.api.routers import chat, planning
from app.auth.supabase import require_user
from app.contracts import BillingAccessDecision, BillingEntitlementRecord, BillingSnapshot
from app.db.supabase import billing as database
from app.db.supabase.transport import SupabaseDataError
from app.integrations import revenuecat
from app.services import billing
from server.tests import test_config
from server.tests.test_endpoints import ID, SCHEDULE
from server.tests.test_profile import USER


OWNER = UUID(USER.id)
SECOND = UUID('22222222-2222-4222-8222-222222222222')
NOW = datetime.now(UTC)


def settings(**overrides):
    values = dict(billing_enabled=True, environment='test', revenuecat_api_key=SecretStr('server-key'),
        revenuecat_webhook_authorization=SecretStr('Bearer delivery-secret'),
        revenuecat_webhook_signing_secret=None, revenuecat_app_ids=['app_test'], billing_sandbox_user_ids=[])
    return SimpleNamespace(**(values | overrides))


def record(**overrides):
    values = dict(user_id=OWNER, environment='sandbox', entitlement_key='arcel_pro', product_id='monthly',
        store='app_store', period_type='normal', active=True, expires_at=NOW + timedelta(days=20),
        verified_at=NOW, sync_revision=2, updated_at=NOW, will_renew=True)
    return BillingEntitlementRecord(**(values | overrides))


def customer(**subscription_overrides):
    expiry = (NOW + timedelta(days=20)).isoformat()
    return {'subscriber': {'entitlements': {'arcel_pro': {'product_identifier': 'monthly', 'expires_date': expiry}},
        'subscriptions': {'monthly': {'expires_date': expiry, 'is_sandbox': True, 'store': 'app_store',
            'period_type': 'normal', 'unsubscribe_detected_at': None, **subscription_overrides}}}}


class BillingProviderTests(unittest.TestCase):
    def test_paid_trial_cancelled_and_expired_state(self):
        for options, active in (({}, True), ({'period_type': 'trial'}, True),
                ({'unsubscribe_detected_at': NOW.isoformat()}, True),
                ({'expires_date': (NOW - timedelta(seconds=1)).isoformat()}, False),
                ({'refunded_at': NOW.isoformat()}, False)):
            with self.subTest(options=options):
                result = revenuecat.normalize_subscriber(customer(**options), 'sandbox', NOW)
                self.assertEqual(result.active, active)
        self.assertFalse(revenuecat.normalize_subscriber(customer(unsubscribe_detected_at=NOW.isoformat()), 'sandbox', NOW).will_renew)

    def test_provider_grace_without_both_redundant_fields_is_honored(self):
        payload = customer(expires_date=(NOW - timedelta(hours=1)).isoformat(),
            grace_period_expires_date=(NOW + timedelta(hours=1)).isoformat())
        payload['subscriber']['entitlements']['arcel_pro']['expires_date'] = (NOW - timedelta(hours=1)).isoformat()
        result = revenuecat.normalize_subscriber(payload, 'sandbox', NOW)
        self.assertTrue(result.active)
        self.assertEqual(result.grace_expires_at, NOW + timedelta(hours=1))

    def test_missing_entitlement_is_inactive_and_sandbox_never_grants_production(self):
        self.assertFalse(revenuecat.normalize_subscriber({'subscriber': {'entitlements': {}, 'subscriptions': {}}}, 'production', NOW).active)
        self.assertFalse(revenuecat.normalize_subscriber(customer(), 'production', NOW).active)
        self.assertTrue(revenuecat.normalize_subscriber(customer(is_sandbox=False), 'production', NOW).active)
        self.assertFalse(revenuecat.normalize_subscriber(customer(is_sandbox=False, store='play_store'), 'production', NOW).active)

    def test_mixed_environment_ambiguity_does_not_report_unpaid(self):
        payload = customer()
        payload['subscriber']['subscriptions']['annual'] = {
            'is_sandbox': False, 'expires_date': (NOW + timedelta(days=20)).isoformat()}
        with self.assertRaises(revenuecat.RevenueCatError):
            revenuecat.normalize_subscriber(payload, 'production', NOW)

    def test_malformed_and_unlimited_subscription_responses_are_unavailable(self):
        cases = [None, {'subscriber': {}}, customer(is_sandbox='true'), customer(expires_date=None),
            customer(expires_date='2026-09-19T12:00:00'), customer(expires_date='not-a-date')]
        for payload in cases:
            with self.subTest(payload=payload), self.assertRaises(revenuecat.RevenueCatError):
                revenuecat.normalize_subscriber(payload, 'sandbox', NOW)

    def test_fetch_is_bounded_and_uses_server_identity(self):
        with patch.object(revenuecat, 'urlopen', return_value=io.BytesIO(json.dumps(customer()).encode())) as request:
            self.assertTrue(revenuecat.fetch_entitlement(OWNER, 'sandbox', 'private-key').active)
        call = request.call_args
        self.assertEqual(call.kwargs['timeout'], 8)
        self.assertEqual(call.args[0].full_url, f'https://api.revenuecat.com/v1/subscribers/{OWNER}')
        self.assertEqual(call.args[0].headers['Authorization'], 'Bearer private-key')
        with patch.object(revenuecat, 'urlopen', side_effect=HTTPError('https://api.revenuecat.com', 500, 'private', {}, None)), \
             self.assertRaises(revenuecat.RevenueCatError) as failure:
            revenuecat.fetch_entitlement(OWNER, 'sandbox', 'private-key')
        self.assertNotIn('private', str(failure.exception))

    def test_hmac_authentication_uses_raw_bytes_and_replay_tolerance(self):
        raw = b'{"event": {"id": "event-1"}}'
        timestamp = 1700000000
        digest = hmac.new(b'signing-secret', str(timestamp).encode() + b'.' + raw, hashlib.sha256).hexdigest()
        signature = f't={timestamp},v1={digest}'
        with patch.object(revenuecat.time, 'time', return_value=timestamp):
            self.assertTrue(revenuecat.authorized_webhook('Bearer secret', 'Bearer secret', raw, signature, 'signing-secret'))
            self.assertFalse(revenuecat.authorized_webhook('Bearer wrong', 'Bearer secret', raw, signature, 'signing-secret'))
            self.assertFalse(revenuecat.authorized_webhook('Bearer secret', 'Bearer secret', raw + b' ', signature, 'signing-secret'))
            self.assertFalse(revenuecat.authorized_webhook('Bearer secret', 'Bearer secret', raw, 'broken', 'signing-secret'))
        with patch.object(revenuecat.time, 'time', return_value=timestamp + 301):
            self.assertFalse(revenuecat.authorized_webhook('Bearer secret', 'Bearer secret', raw, signature, 'signing-secret'))


class BillingServiceTests(unittest.TestCase):
    def setUp(self):
        self.config = patch.object(billing, 'get_settings', return_value=settings()).start()
        self.addCleanup(patch.stopall)
        billing._attempts.clear()
        billing._inflight.clear()

    def test_disabled_and_legacy_settings_skip_every_provider_database_call(self):
        for config in (settings(billing_enabled=False), SimpleNamespace(environment='test')):
            self.config.return_value = config
            with patch.object(database, 'get_entitlement') as read, patch.object(billing, 'fetch_entitlement') as fetch:
                result = billing.get_billing_status(OWNER, force=True)
                self.assertFalse(result.enabled)
                self.assertTrue(result.has_access)
                read.assert_not_called()
                fetch.assert_not_called()

    def test_environment_comes_only_from_server_configuration(self):
        self.config.return_value = settings(environment='production')
        self.assertEqual(billing.billing_environment(OWNER), 'production')
        self.config.return_value = settings(environment='production', billing_sandbox_user_ids=[OWNER])
        self.assertEqual(billing.billing_environment(OWNER), 'sandbox')

    def test_fresh_cache_and_small_database_clock_skew_do_not_call_provider(self):
        for timestamp in (NOW, NOW + timedelta(seconds=15)):
            with self.subTest(timestamp=timestamp), patch.object(database, 'get_entitlement', return_value=record(verified_at=timestamp)), \
                 patch.object(billing, 'fetch_entitlement') as fetch:
                self.assertTrue(billing.get_billing_status(OWNER).has_access)
                fetch.assert_not_called()
        self.assertFalse(billing._fresh(record(verified_at=NOW + timedelta(minutes=2)), NOW))
        self.assertFalse(billing._fresh(record(verified_at=NOW - timedelta(minutes=6)), NOW))

    def test_trial_grace_and_expiry_decisions(self):
        self.assertEqual(billing._decision(record(period_type='trial'), NOW).phase, 'trial')
        self.assertEqual(billing._decision(record(expires_at=NOW - timedelta(hours=1),
            grace_expires_at=NOW + timedelta(hours=1)), NOW).phase, 'grace')
        self.assertFalse(billing._decision(record(expires_at=NOW - timedelta(hours=1)), NOW).has_access)

    def test_invalidated_cache_fetches_and_commits_exact_claim(self):
        stale = record(verified_at=None)
        saved = record(sync_revision=3)
        snapshot = BillingSnapshot(active=True, expires_at=NOW + timedelta(days=20))
        with patch.object(database, 'get_entitlement', side_effect=[stale, saved]), \
             patch.object(database, 'invalidate_entitlements', return_value=[record(verified_at=None, sync_revision=3)]) as invalidate, \
             patch.object(billing, 'fetch_entitlement', return_value=snapshot) as fetch, \
             patch.object(database, 'commit_entitlement', return_value=saved) as commit:
            self.assertTrue(billing.get_billing_status(OWNER).has_access)
        invalidate.assert_called_once_with([OWNER], 'sandbox')
        fetch.assert_called_once_with(OWNER, 'sandbox', 'server-key')
        commit.assert_called_once_with(OWNER, 'sandbox', 3, snapshot)

    def test_provider_failure_never_reuses_invalidated_positive_state(self):
        with patch.object(database, 'get_entitlement', return_value=record(verified_at=None)), \
             patch.object(database, 'invalidate_entitlements', return_value=[record(verified_at=None)]), \
             patch.object(billing, 'fetch_entitlement', side_effect=revenuecat.RevenueCatError('private')), \
             patch.object(database, 'commit_entitlement') as commit, self.assertRaises(billing.BillingUnavailable):
            billing.get_billing_status(OWNER)
        commit.assert_not_called()

    def test_lost_claim_and_late_webhook_do_not_grant_stale_access(self):
        for committed in (None, record()):
            with self.subTest(committed=committed), patch.object(database, 'get_entitlement', return_value=record(verified_at=None)), \
                 patch.object(database, 'invalidate_entitlements', return_value=[record(verified_at=None)]), \
                 patch.object(billing, 'fetch_entitlement', return_value=BillingSnapshot()), \
                 patch.object(database, 'commit_entitlement', return_value=committed), self.assertRaises(billing.BillingUnavailable):
                billing.get_billing_status(OWNER)

    def test_lost_claim_can_use_newer_verified_canonical_state(self):
        newer = record(sync_revision=3, active=False)
        with patch.object(database, 'get_entitlement', side_effect=[record(verified_at=None), newer, newer]), \
             patch.object(database, 'invalidate_entitlements', return_value=[record(verified_at=None)]), \
             patch.object(billing, 'fetch_entitlement', return_value=BillingSnapshot(active=True)), \
             patch.object(database, 'commit_entitlement', return_value=None):
            self.assertFalse(billing.get_billing_status(OWNER).has_access)

    def test_concurrent_waiter_shares_existing_verification_and_repeated_refresh_is_bounded(self):
        pending = Future()
        pending.set_result(record())
        billing._inflight[(OWNER, 'sandbox')] = pending
        with patch.object(billing, '_verify') as verify:
            self.assertEqual(billing._coalesced_verify(OWNER, 'sandbox'), record())
            verify.assert_not_called()
        billing._inflight.clear()
        with patch.object(billing, '_verify', return_value=record()) as verify:
            for _ in range(5):
                billing._coalesced_verify(OWNER, 'sandbox')
            with self.assertRaises(billing.BillingUnavailable):
                billing._coalesced_verify(OWNER, 'sandbox')
            self.assertEqual(verify.call_count, 5)

    def test_transfer_invalidates_deduplicated_known_uuids_in_both_partitions(self):
        with patch.object(database, 'invalidate_entitlements') as invalidate:
            billing.invalidate_webhook_users([str(OWNER), str(SECOND), str(OWNER), '$RCAnonymousID:x'], None)
        self.assertEqual(invalidate.call_count, 2)
        self.assertEqual(invalidate.call_args_list[0].args, ([OWNER, SECOND], 'sandbox'))
        self.assertEqual(invalidate.call_args_list[1].args, ([OWNER, SECOND], 'production'))


class BillingRouteTests(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(routes.router)
        app.include_router(chat.router)
        app.include_router(planning.router)
        app.dependency_overrides[require_user] = lambda: USER
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def test_status_and_sync_never_accept_client_ownership_or_paid_claims(self):
        result = BillingAccessDecision(enabled=True, has_access=False)
        with patch.object(billing, 'get_billing_status', return_value=result) as status:
            self.assertEqual(self.client.get('/billing/status').status_code, 200)
            self.assertEqual(self.client.post('/billing/sync').status_code, 200)
            self.assertEqual(self.client.post('/billing/sync', json={}).status_code, 200)
            self.assertEqual(status.call_args.args, (USER.id,))
            self.assertEqual(status.call_args.kwargs, {'force': True})
            count = status.call_count
            for body in ({'user_id': str(SECOND)}, {'has_access': True}, {'environment': 'sandbox'}):
                self.assertEqual(self.client.post('/billing/sync', json=body).status_code, 422)
            self.assertEqual(status.call_count, count)

    def test_status_requires_auth_and_redacts_verification_failures(self):
        app = FastAPI()
        app.include_router(routes.router)
        with TestClient(app) as anonymous:
            self.assertEqual(anonymous.get('/billing/status').status_code, 401)
            self.assertEqual(anonymous.post('/billing/sync').status_code, 401)
        with patch.object(billing, 'get_billing_status', side_effect=billing.BillingUnavailable('private')):
            response = self.client.get('/billing/status')
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.json(), {'detail': 'billing_unavailable'})
            self.assertEqual(response.headers['cache-control'], 'private, no-store')

    def test_paid_mutations_are_denied_before_chat_persistence(self):
        cases = [('/chat', {'conversation_id': str(ID), 'text': 'hi'}, 'post'),
            ('/planning/schedule', {'next_refresh_at': NOW.isoformat()}, 'put'),
            ('/planning/adjustments', {'deduplication_key': 'x', 'reason': 'sleep',
                'effective_from': '2026-09-19', 'effective_through': '2026-09-19'}, 'post'),
            (f'/planning/jobs/{ID}/retry', None, 'post')]
        with patch('app.auth.billing.get_billing_status', return_value=BillingAccessDecision(enabled=True, has_access=False)), \
             patch.object(chat.messages, 'append_message') as save:
            for url, payload, method in cases:
                response = self.client.request(method, url, json=payload)
                self.assertEqual(response.status_code, 403)
                self.assertEqual(response.json(), {'detail': 'subscription_required'})
        save.assert_not_called()

    def test_read_and_cancel_paths_keep_original_auth_dependency(self):
        with patch('app.auth.billing.get_billing_status') as gate, \
             patch.object(planning.planning_schedules, 'get_planning_schedule', return_value=SCHEDULE):
            self.assertEqual(self.client.get('/planning/schedule').status_code, 200)
            gate.assert_not_called()

    def test_webhook_scoping_unknown_fields_and_transfer_without_app_id(self):
        headers = {'Authorization': 'Bearer delivery-secret'}
        with patch.object(billing, 'billing_enabled', return_value=True), \
             patch.object(routes, 'get_settings', return_value=settings()), \
             patch.object(billing, 'invalidate_webhook_users') as invalidate:
            event = {'id': 'event', 'type': 'RENEWAL', 'app_id': 'app_test', 'app_user_id': str(OWNER),
                'environment': 'SANDBOX', 'future_field': {'any': 'value'}}
            self.assertEqual(self.client.post('/billing/webhooks/revenuecat', json={'event': event}, headers=headers).status_code, 200)
            invalidate.assert_called_once_with([str(OWNER)], 'SANDBOX')
            invalidate.reset_mock()
            self.assertEqual(self.client.post('/billing/webhooks/revenuecat', json={'event': event}).status_code, 401)
            self.assertEqual(self.client.post('/billing/webhooks/revenuecat', json={'event': event | {'app_id': 'other'}}, headers=headers).status_code, 403)
            invalidate.assert_not_called()
            transfer = {'id': 'move', 'type': 'TRANSFER', 'transferred_from': [str(OWNER)], 'transferred_to': [str(SECOND)]}
            self.assertEqual(self.client.post('/billing/webhooks/revenuecat', json={'event': transfer}, headers=headers).status_code, 200)
            invalidate.assert_called_once_with([str(OWNER), str(SECOND)], None)

    def test_webhook_oversized_identity_union_and_failed_commit_are_not_acknowledged(self):
        headers = {'Authorization': 'Bearer delivery-secret'}
        event = {'id': 'event', 'type': 'TRANSFER', 'app_id': 'app_test',
            'transferred_from': [str(UUID(int=index)) for index in range(100)],
            'transferred_to': [str(UUID(int=101))]}
        with patch.object(billing, 'billing_enabled', return_value=True), \
             patch.object(routes, 'get_settings', return_value=settings()), \
             patch.object(billing, 'invalidate_webhook_users') as invalidate:
            self.assertEqual(self.client.post('/billing/webhooks/revenuecat', json={'event': event}, headers=headers).status_code, 422)
            invalidate.assert_not_called()
            event['transferred_from'] = [str(OWNER)]
            invalidate.side_effect = billing.BillingUnavailable('private')
            self.assertEqual(self.client.post('/billing/webhooks/revenuecat', json={'event': event}, headers=headers).status_code, 503)


class BillingDatabaseConfigurationTests(unittest.TestCase):
    def test_database_rpc_payload_and_lost_commit(self):
        with patch.object(database, 'call_rpc', return_value=[record().model_dump(mode='json')]) as rpc:
            database.invalidate_entitlements([OWNER, OWNER], 'sandbox')
            self.assertEqual(rpc.call_args.args, ('invalidate_billing_entitlements', {
                'p_user_ids': [str(OWNER)], 'p_environment': 'sandbox', 'p_entitlement_key': 'arcel_pro'}, None))
        with patch.object(database, 'call_rpc', return_value=[]) as rpc:
            self.assertIsNone(database.commit_entitlement(OWNER, 'sandbox', 2, BillingSnapshot()))
            self.assertIsNone(rpc.call_args.args[-1])
            self.assertEqual(rpc.call_args.args[1]['p_expected_revision'], 2)
            self.assertNotIn('verified_at', rpc.call_args.args[1]['p_snapshot'])
        with patch.object(database, 'call_rpc', return_value={'active': True}), self.assertRaises(SupabaseDataError):
            database.invalidate_entitlements([OWNER], 'sandbox')

    def test_enabled_configuration_is_explicit_and_optional_signing_secret_can_be_blank(self):
        build = test_config.SupabaseURLTests().settings
        self.assertFalse(build('https://test.supabase.co').billing_enabled)
        with self.assertRaises(ValidationError):
            build('https://test.supabase.co', billing_enabled=True)
        configured = build('https://test.supabase.co', billing_enabled=True, supabase_secret_key='db-secret',
            revenuecat_api_key='server-key', revenuecat_webhook_authorization='Bearer webhook-secret',
            revenuecat_app_ids=['app_test'], revenuecat_webhook_signing_secret='')
        self.assertIsNone(configured.revenuecat_webhook_signing_secret)
        self.assertEqual(configured.revenuecat_app_ids, ['app_test'])
