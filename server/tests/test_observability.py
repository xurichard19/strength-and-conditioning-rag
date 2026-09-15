import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration
from sentry_sdk.transport import Transport

from app.api.routers import chat, profile
from app.contracts import MessageRecord
from app.db.supabase import SupabaseDataError
from server.tests.test_endpoints import ID, client
from server.tests.test_profile import NOW, PROFILE, USER


class MemoryTransport(Transport):
    def __init__(self):
        super().__init__()
        self.items = []

    def capture_envelope(self, envelope):
        self.items.extend(envelope.items)


class ObservabilityTests(unittest.TestCase):
    def setUp(self):
        self.transport = MemoryTransport()
        sdk = sentry_sdk.Client(
            dsn='https://public@sentry.test/1', transport=self.transport,
            default_integrations=False, auto_enabling_integrations=False,
            integrations=[StarletteIntegration(), FastApiIntegration()],
            send_default_pii=False, max_request_body_size='never',
            include_local_variables=False,
            traces_sample_rate=1,
        )
        scope = self.enterContext(sentry_sdk.isolation_scope())
        scope.set_client(sdk)
        self.addCleanup(sdk.close)
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
            role='user', content='private message', created_at=NOW)
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


if __name__ == '__main__':
    unittest.main()
