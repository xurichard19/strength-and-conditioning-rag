import ast
import importlib
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient
from pydantic import BaseModel, TypeAdapter, ValidationError

from app.api import schemas
from app.contracts import Source
from tests.backend.test_endpoints import ID


class ApiSchemaTests(unittest.TestCase):
    def test_source_identifiers_remain_required_and_mutually_exclusive(self):
        for kind, required, excluded in [('research', 'doi', 'url'), ('web', 'url', 'doi')]:
            with self.subTest(kind=kind):
                Source(source_type=kind, content='evidence', **{required: 'identifier'})
                with self.assertRaises(ValidationError):
                    Source(source_type=kind, content='evidence')
                with self.assertRaises(ValidationError):
                    Source(source_type=kind, content='evidence', **{required: 'identifier', excluded: 'other'})
        source = Source(source_type='research', chunk_id='real-chroma-id', content='evidence')
        self.assertIsNone(source.doi)
        self.assertIsNone(source.document_id)
        with self.assertRaises(ValidationError):
            Source(source_type='web', url='https://example.org', chunk_id='research-chunk', content='evidence')

    def test_chat_mode_is_allow_listed_and_clients_cannot_supply_internal_budgets(self):
        self.assertEqual(schemas.ChatRequest(conversation_id=ID, text='question').mode, 'quick')
        self.assertEqual(schemas.ChatRequest(conversation_id=ID, text='question', mode='deep').mode, 'deep')
        for extra in [{'mode': 'unlimited'}, {'retries_left': 100}, {'history': []}, {'user_id': str(ID)}]:
            with self.subTest(extra=extra), self.assertRaises(ValidationError):
                schemas.ChatRequest(conversation_id=ID, text='question', **extra)

    def test_error_reporting_disables_body_pii_and_local_variable_capture(self):
        settings = SimpleNamespace(sentry_dsn='https://public@sentry.test/1', sentry_traces_sample_rate=0,
            app_name='test api', cors_origins=[], environment='test')
        with patch('app.config.get_settings', return_value=settings), patch('dotenv.load_dotenv'), \
             patch('sentry_sdk.init') as initialize:
            importlib.reload(importlib.import_module('app.main'))
        options = initialize.call_args.kwargs
        self.assertFalse(options['send_default_pii'])
        self.assertFalse(options['include_local_variables'])
        self.assertEqual(options['max_request_body_size'], 'never')
        self.assertFalse(options['auto_enabling_integrations'])
        self.assertTrue({'stdlib', 'httpx'}.issubset(
            integration.identifier for integration in options['disabled_integrations']))
        self.assertNotIn('before_send', options)

    def test_api_models_do_not_inherit_business_models(self):
        for name, model in vars(schemas).items():
            if isinstance(model, type) and issubclass(model, BaseModel):
                with self.subTest(model=name):
                    self.assertFalse(any(base.__module__ == 'app.contracts' for base in model.__mro__))

    def test_nested_result_payload_rejects_internal_fields_and_nonfinite_numbers(self):
        for values in ({'actual_weight': float('inf')}, {'planned_reps': 5}, {'actual_rpe': 11}):
            with self.subTest(values=values), self.assertRaises(ValidationError):
                schemas.WorkoutResultsRequest(expected_revision=1, status='planned', sets=[{'id': ID, **values}])

    def test_stream_events_have_explicit_public_shapes(self):
        event = TypeAdapter(schemas.ChatStreamEvent).validate_python({'type': 'text', 'delta': 'hello', 'internal': 'secret'})
        self.assertEqual(event.model_dump(), {'type': 'text', 'delta': 'hello'})
        with self.assertRaises(ValidationError):
            TypeAdapter(schemas.ChatStreamEvent).validate_python({'type': 'done'})

    def test_handlers_and_business_models_do_not_import_api_schemas(self):
        app_dir = Path(__file__).resolve().parents[2] / 'server/app'
        for path in [app_dir / 'contracts.py', *app_dir.glob('db/supabase/*.py')]:
            tree = ast.parse(path.read_text(encoding='utf-8'))
            for node in ast.walk(tree):
                if isinstance(node, ast.ImportFrom):
                    self.assertFalse((node.module or '').startswith('app.api'), str(path))

    def test_actual_app_startup_exposes_current_routes_and_public_schemas(self):
        settings = SimpleNamespace(sentry_dsn=None, app_name='test api', cors_origins=[], environment='test')
        with patch('app.config.get_settings', return_value=settings), patch('dotenv.load_dotenv'):
            main = importlib.import_module('app.main')
        with patch.object(main, 'build_chat_workflow', return_value=object()) as build, TestClient(main.app) as api:
            self.assertEqual(api.get('/health').json(), {'status': 'ok'})
            document = api.get('/openapi.json').json()
            paths, models = document['paths'], document['components']['schemas']
            for path in ('/profile', '/onboarding', '/calendar', '/sports-workouts',
                         '/planning/jobs', '/planning/adjustments', '/chat'):
                self.assertIn(path, paths)
            self.assertNotIn('/plan', paths)
            self.assertNotIn('/profile/onboarding/complete', paths)
            self.assertIn('WorkoutDetailResponse', models)
            self.assertIn('SetResultRequest', models)
            self.assertNotIn('WorkoutRecord', models)
            self.assertNotIn('ReplanJobRecord', models)
            self.assertIn('application/x-ndjson', paths['/chat']['post']['responses']['200']['content'])
            build.assert_called_once_with()


if __name__ == '__main__':
    unittest.main()
