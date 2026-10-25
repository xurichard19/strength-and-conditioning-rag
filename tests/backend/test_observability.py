import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
import sentry_sdk
from fastapi.testclient import TestClient
from google.api_core.exceptions import DeadlineExceeded
from sentry_sdk.transport import Transport

from app.ai.services import search
from app.ai.workflows.chat.nodes import evaluate
from app.api.routers import chat, profile
from app.config import RuntimeSettings
from app.contracts import MessageRecord, ReplanDeliveryClaim, ReplanResult
from app.db.supabase import SupabaseDataError
from app.jobs import replan_worker, scheduler
from app.jobs.settings import TaskSettings
from app.observability import capture_failure, init_sentry
from tests.backend.test_endpoints import ID, client
from tests.backend.test_planning_runtime import CLAIM, JOB, SETTINGS, TASK
from tests.backend.test_profile import NOW, PROFILE, USER


class MemoryTransport(Transport):
    def __init__(self):
        super().__init__()
        self.items = []

    def capture_envelope(self, envelope):
        self.items.extend(envelope.items)


def observe_errors(test, service):
    """exercise the deployed reporting options with an in-memory transport"""
    transport = MemoryTransport()
    scope = test.enterContext(sentry_sdk.isolation_scope())
    settings = RuntimeSettings(_env_file=None, sentry_dsn='https://public@sentry.test/1',
        environment='test', sentry_traces_sample_rate=1)
    with patch('sentry_sdk.init') as initialize:
        init_sentry(service, settings)
    sdk = sentry_sdk.Client(**initialize.call_args.kwargs, transport=transport, default_integrations=False)
    scope.set_client(sdk)
    test.addCleanup(sdk.close)
    return transport


class ObservabilityTests(unittest.TestCase):
    def setUp(self):
        self.transport = observe_errors(self, 'api')
        self.api = self.enterContext(client())

    def events(self, kind):
        return [item.payload.json for item in self.transport.items if item.headers['type'] == kind]

    def test_database_5xx_preserves_exception_messages_without_local_variables(self):
        with patch.object(profile.profiles, 'get_profile', side_effect=SupabaseDataError('private database value', 502)):
            self.assertEqual(self.api.get('/profile').status_code, 502)
        errors = self.events('event')
        self.assertEqual(len(errors), 1)
        exceptions = errors[0]['exception']['values']
        self.assertIn('SupabaseDataError', [exc['type'] for exc in exceptions])
        database_error = next(exc for exc in exceptions if exc['type'] == 'SupabaseDataError')
        self.assertEqual(database_error['value'], 'private database value')
        for exc in exceptions:
            for frame in exc.get('stacktrace', {}).get('frames', []):
                self.assertNotIn('vars', frame)

    def test_expected_client_errors_are_not_reported(self):
        for status in (401, 403, 404, 409):
            with self.subTest(status=status), patch.object(profile.profiles, 'get_profile',
                    side_effect=SupabaseDataError('expected rejection', status)):
                self.assertEqual(self.api.get('/profile').status_code, status)
        self.assertEqual(self.events('event'), [])

    def test_unhandled_api_error_is_reported_once(self):
        with patch.object(profile.profiles, 'get_profile', side_effect=RuntimeError('unexpected failure')), \
                self.assertRaises(RuntimeError):
            self.api.get('/profile')
        self.assertEqual(len(self.events('event')), 1)

    def test_startup_failure_is_reported_once(self):
        from app import main
        with patch.object(main, 'build_chat_workflow', side_effect=RuntimeError('startup failed')), \
                self.assertRaises(RuntimeError), TestClient(main.app):
            pass
        self.assertEqual(len(self.events('event')), 1)
        self.assertEqual(self.events('event')[0]['exception']['values'][-1]['type'], 'RuntimeError')

    def test_database_action_is_a_named_child_span(self):
        with patch.object(profile.profiles, 'get_profile', return_value=PROFILE):
            self.assertEqual(self.api.get('/profile').status_code, 200)
        spans = [span for event in self.events('transaction') for span in event.get('spans', [])]
        operations = [span for span in spans if span.get('op') == 'db']
        self.assertEqual(len(operations), 1)
        self.assertEqual(operations[0]['description'], 'profile.get_profile')
        self.assertNotIn(USER.access_token, json.dumps(operations))

    def test_stream_failure_is_reported_once_despite_http_200(self):
        async def failed_stream(graph, **kwargs):
            yield {'type': 'text', 'delta': 'partial'}
            raise RuntimeError('private provider value')

        row = MessageRecord(id=ID, conversation_id=ID, user_id=USER.id,
            role='user', content=' '.join(('private', 'athlete-message')), created_at=NOW)
        with patch.object(chat, 'stream_workflow', side_effect=failed_stream), \
             patch.object(chat.messages, 'append_message', return_value=row):
            response = self.api.post('/chat', json={'text': row.content, 'conversation_id': str(ID)})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(json.loads(response.text.splitlines()[-1])['type'], 'error')
        errors = self.events('event')
        self.assertEqual(len(errors), 1)
        self.assertEqual(errors[0]['exception']['values'][-1]['type'], 'RuntimeError')
        self.assertEqual(errors[0]['exception']['values'][-1]['value'], 'private provider value')
        self.assertFalse(errors[0].get('request', {}).get('data'))
        self.assertNotIn(USER.access_token, json.dumps(errors))
        self.assertNotIn(row.content, json.dumps(errors))

    def test_chat_times_generation_and_both_writes_without_tracing_content(self):
        async def stream(graph, **kwargs):
            yield {'type': 'text', 'delta': 'reply'}
            yield {'type': 'done'}

        row = MessageRecord(id=ID, conversation_id=ID, user_id=USER.id,
            role='user', content='private message', created_at=NOW)
        with patch.dict('sys.modules', {'app.ai.workflows.chat.graph': SimpleNamespace(stream_chat=stream)}), \
             patch.object(chat.messages, 'append_message', return_value=row):
            response = self.api.post('/chat', json={'text': row.content, 'conversation_id': str(ID)})
        self.assertEqual(json.loads(response.text.splitlines()[-1])['type'], 'done')
        spans = [span for event in self.events('transaction') for span in event.get('spans', [])]
        operations = [span for span in spans if span.get('op') in ('db', 'ai.workflow')]
        self.assertEqual([span['description'] for span in operations],
            ['chat.save_user', 'chat.generate', 'chat.save_assistant'])
        self.assertNotIn(row.content, json.dumps(operations))
        self.assertNotIn(USER.access_token, json.dumps(operations))
        self.assertEqual(self.events('event'), [])


class JobObservabilityTests(unittest.TestCase):
    def setUp(self):
        self.transport = observe_errors(self, 'planning-worker')
        self.claim = self.enterContext(patch.object(replan_worker.replan_jobs, 'claim_replan_delivery',
            return_value=ReplanDeliveryClaim(status='claimed', claim=CLAIM)))
        self.complete = self.enterContext(patch.object(replan_worker.replan_jobs, 'complete_replan_job'))
        self.fail = self.enterContext(patch.object(replan_worker.replan_jobs, 'fail_replan_job', return_value=JOB))
        self.generate = AsyncMock(return_value=ReplanResult(before_ids=[], workouts=[]))
        self.worker = self.enterContext(TestClient(replan_worker.create_app(self.generate)))

    def errors(self):
        return [item.payload.json for item in self.transport.items if item.headers['type'] == 'event']

    def run_job(self):
        return self.worker.post('/run', json=TASK.model_dump(mode='json'))

    def test_busy_stale_and_retrying_deliveries_do_not_report_errors(self):
        for status in ('busy', 'not_ready', 'obsolete', 'terminal', 'missing'):
            self.claim.return_value = ReplanDeliveryClaim(status=status)
            self.run_job()
        self.claim.return_value = ReplanDeliveryClaim(status='claimed', claim=CLAIM)
        self.generate.side_effect = RuntimeError('retryable generation failure')
        self.assertEqual(self.run_job().status_code, 503)
        self.generate.side_effect = SupabaseDataError('inputs changed', status_code=409)
        self.assertEqual(self.run_job().status_code, 503)
        self.assertEqual(self.errors(), [])

    def test_terminal_generation_failure_is_reported_once_despite_http_200(self):
        self.generate.side_effect = RuntimeError('generation exhausted')
        self.fail.return_value = JOB.model_copy(update={'status': 'failed'})
        self.assertEqual(self.run_job().json(), {'status': 'failed'})
        self.assertEqual(len(self.errors()), 1)
        self.assertEqual(self.errors()[0]['tags']['operation'], 'planning.execute')
        self.assertFalse(self.errors()[0].get('request', {}).get('data'))

    def test_worker_database_outage_is_reported_once_despite_retry_response(self):
        self.claim.side_effect = SupabaseDataError('database unavailable', status_code=503)
        self.assertEqual(self.run_job().status_code, 503)
        self.assertEqual(len(self.errors()), 1)
        self.assertEqual(self.errors()[0]['tags']['operation'], 'planning.worker')

    def test_lost_publication_response_does_not_report_an_expected_conflict(self):
        self.complete.side_effect = SupabaseDataError('publication response lost')
        self.fail.side_effect = SupabaseDataError('job already completed', status_code=409)
        self.assertEqual(self.run_job().status_code, 503)
        self.assertEqual(self.errors(), [])

    def test_failure_recording_outage_is_reported_once(self):
        self.generate.side_effect = RuntimeError('generation failed')
        self.fail.side_effect = SupabaseDataError('failure record unavailable', status_code=503)
        self.assertEqual(self.run_job().status_code, 503)
        self.assertEqual(len(self.errors()), 1)
        self.assertEqual(self.errors()[0]['tags']['operation'], 'planning.worker')

    def test_dispatcher_reports_one_error_per_failed_batch(self):
        with patch.object(scheduler, 'get_task_settings', return_value=SETTINGS), \
                patch.object(scheduler.replan_jobs, 'enqueue_due_replans', return_value=0), \
                patch.object(scheduler.replan_jobs, 'list_replan_deliveries', return_value=[JOB] * 3), \
                patch.object(scheduler, 'enqueue_replan', side_effect=DeadlineExceeded('queue unavailable')), \
                TestClient(scheduler.app) as dispatcher:
            self.assertEqual(dispatcher.post('/dispatch').status_code, 503)
        self.assertEqual(len(self.errors()), 1)
        self.assertEqual(self.errors()[0]['tags']['operation'], 'planning.dispatch')

    def test_dispatcher_scan_failure_is_reported_once(self):
        with patch.object(scheduler, 'get_task_settings', return_value=SETTINGS), \
                patch.object(scheduler.replan_jobs, 'enqueue_due_replans', side_effect=SupabaseDataError('unavailable')), \
                TestClient(scheduler.app) as dispatcher:
            self.assertEqual(dispatcher.post('/dispatch').status_code, 503)
        self.assertEqual(len(self.errors()), 1)

    def test_exhausted_task_delivery_is_reported(self):
        with patch.object(scheduler.replan_jobs, 'enqueue_due_replans', return_value=0), \
                patch.object(scheduler.replan_jobs, 'list_replan_deliveries',
                    return_value=[JOB.model_copy(update={'dispatched_at': NOW})]), \
                patch.object(scheduler, 'task_exists', return_value=False), \
                patch.object(scheduler.replan_jobs, 'recover_replan_delivery',
                    return_value=JOB.model_copy(update={'status': 'failed'})):
            self.assertEqual(scheduler.dispatch_due(SETTINGS)['errors'], 0)
        self.assertEqual(len(self.errors()), 1)
        self.assertEqual(self.errors()[0]['tags']['operation'], 'planning.delivery')

    def test_disabled_dispatch_and_deferred_submission_remain_quiet(self):
        with patch.object(scheduler, 'get_task_settings', return_value=TaskSettings(enabled=False)), \
                TestClient(scheduler.app) as dispatcher:
            self.assertEqual(dispatcher.post('/dispatch').status_code, 503)
        with patch.object(scheduler, 'get_task_settings', return_value=SETTINGS), \
                patch.object(scheduler, 'enqueue_replan', side_effect=DeadlineExceeded('temporary')):
            scheduler.dispatch_after_commit(JOB)
        self.assertEqual(self.errors(), [])

    def test_job_entrypoints_initialize_their_own_reporting_at_startup(self):
        for app, service in ((replan_worker.app, 'planning-worker'), (scheduler.app, 'planning-dispatcher')):
            with self.subTest(service=service), patch('app.http.init_sentry') as initialize, TestClient(app):
                initialize.assert_called_once_with(service)


class RetrievalObservabilityTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.transport = observe_errors(self, 'api')

    def errors(self):
        return [item.payload.json for item in self.transport.items if item.headers['type'] == 'event']

    async def test_swallowed_retrieval_failure_reports_without_attaching_the_query(self):
        with patch.object(search, 'hybrid_search_research_docs', new=AsyncMock(side_effect=RuntimeError('invalid index'))):
            response = await search.search_sources('private athlete question', providers='research')
        self.assertEqual(response.results, [])
        self.assertEqual(len(self.errors()), 1)
        self.assertEqual(self.errors()[0]['tags']['operation'], 'retrieval.research')
        self.assertNotIn('private athlete question', json.dumps(self.errors()))

    async def test_bounded_retrieval_timeouts_do_not_create_issues(self):
        for error in (TimeoutError(), httpx.ReadTimeout('deadline')):
            with patch.object(search, 'hybrid_search_research_docs', new=AsyncMock(side_effect=error)):
                await search.search_sources('training', providers='research')
        self.assertEqual(self.errors(), [])

    async def test_unexpected_evaluation_failure_reports_but_expected_timeout_does_not(self):
        state = {'searches': [], 'messages': [], 'warnings': [], 'sources': []}
        for error in (TimeoutError(), RuntimeError('model unavailable')):
            with patch.object(evaluate, 'decision_model', return_value=SimpleNamespace(ainvoke=AsyncMock(side_effect=error))):
                self.assertFalse((await evaluate.evaluate_node(state))['retry_search'])
        self.assertEqual(len(self.errors()), 1)
        self.assertEqual(self.errors()[0]['tags']['operation'], 'chat.evaluate')


class ReportingConfigurationTests(unittest.TestCase):
    def test_disabled_reporting_never_initializes_a_transport(self):
        with patch('sentry_sdk.init') as initialize:
            init_sentry('planning-worker', RuntimeSettings(_env_file=None, sentry_dsn=None))
        initialize.assert_not_called()

    def test_background_services_only_exclude_their_expected_retry_status(self):
        settings = RuntimeSettings(_env_file=None, sentry_dsn='https://public@sentry.test/1')
        for service in ('api', 'planning-worker', 'planning-dispatcher'):
            with self.subTest(service=service), patch('sentry_sdk.init') as initialize:
                init_sentry(service, settings)
                for integration in initialize.call_args.kwargs['integrations']:
                    self.assertIn(500, integration.failed_request_status_codes)
                    self.assertIn(504, integration.failed_request_status_codes)
                    self.assertEqual(503 in integration.failed_request_status_codes, service == 'api')

    def test_only_reported_failures_flush_with_a_bounded_wait(self):
        for event in (None, 'event-id'):
            with self.subTest(event=event), patch('sentry_sdk.capture_exception', return_value=event), \
                    patch('sentry_sdk.flush') as flush:
                capture_failure(RuntimeError('failure'), 'test.operation')
                if event:
                    flush.assert_called_once_with(timeout=2)
                else:
                    flush.assert_not_called()


if __name__ == '__main__':
    unittest.main()
