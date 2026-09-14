import ast
import importlib
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient
from pydantic import BaseModel, TypeAdapter, ValidationError

from app.api import schemas
from app.api.routers import profile, sports_workouts, workouts
from app.contracts import ExerciseSetResult, ProfileUpdate, SportsWorkoutInput, SportsWorkoutUpdate
from server.tests.test_endpoints import DAY, ID, SPORT, client
from server.tests.test_profile import PROFILE


class ApiSchemaTests(unittest.TestCase):
    def test_api_models_do_not_inherit_business_models(self):
        for name, model in vars(schemas).items():
            if isinstance(model, type) and issubclass(model, BaseModel):
                with self.subTest(model=name):
                    self.assertFalse(any(base.__module__ == 'app.contracts' for base in model.__mro__))

    def test_writes_convert_api_inputs_to_business_inputs_without_losing_omissions(self):
        with client() as api, \
             patch.object(profile.profiles, 'update_profile', return_value=PROFILE) as save_profile, \
             patch.object(sports_workouts.sports_workouts, 'create_sports_workout', return_value=SPORT) as create, \
             patch.object(sports_workouts.sports_workouts, 'update_sports_workout', return_value=SPORT) as update, \
             patch.object(workouts.workouts, 'record_workout_results', return_value=5) as results:
            self.assertEqual(api.patch('/profile', json={'display_name': None}).status_code, 200)
            self.assertIs(type(save_profile.call_args.args[1]), ProfileUpdate)
            self.assertEqual(save_profile.call_args.args[1].model_dump(exclude_unset=True), {'display_name': None})
            self.assertEqual(api.post('/sports-workouts', json={'sport': 'running', 'scheduled_date': str(DAY)}).status_code, 201)
            self.assertIs(type(create.call_args.args[1]), SportsWorkoutInput)
            self.assertEqual(api.patch(f'/sports-workouts/{ID}', json={'notes': None}).status_code, 200)
            self.assertIs(type(update.call_args.args[2]), SportsWorkoutUpdate)
            self.assertEqual(update.call_args.args[2].model_dump(exclude_unset=True), {'notes': None})
            self.assertEqual(api.put(f'/workouts/{ID}/results', json={'expected_revision': 4, 'status': 'in_progress',
                'sets': [{'id': str(ID), 'actual_reps': 2}]}).status_code, 200)
            self.assertIs(type(results.call_args.args[4][0]), ExerciseSetResult)

    def test_nested_result_payload_rejects_internal_fields_and_nonfinite_numbers(self):
        for values in ({'actual_weight': float('inf')}, {'planned_reps': 5}, {'actual_rpe': 11}):
            with self.subTest(values=values), self.assertRaises(ValidationError):
                schemas.WorkoutResultsRequest(expected_revision=1, status='planned', sets=[{'id': ID, **values}])

    def test_stream_events_have_explicit_public_shapes(self):
        event = TypeAdapter(schemas.ChatStreamEvent).validate_python({'type': 'text', 'delta': 'hello', 'internal': 'secret'})
        self.assertEqual(event.model_dump(), {'type': 'text', 'delta': 'hello'})
        with self.assertRaises(ValidationError):
            TypeAdapter(schemas.ChatStreamEvent).validate_python({'type': 'done'})

    def test_http_documentation_exposes_only_api_models(self):
        with client() as api:
            document = api.get('/openapi.json').json()
        models = document['components']['schemas']
        self.assertIn('WorkoutDetailResponse', models)
        self.assertIn('SetResultRequest', models)
        self.assertNotIn('WorkoutRecord', models)
        self.assertNotIn('ReplanJobRecord', models)
        self.assertIn('application/x-ndjson', document['paths']['/chat']['post']['responses']['200']['content'])

    def test_handlers_and_business_models_do_not_import_api_schemas(self):
        app_dir = Path(__file__).resolve().parents[1] / 'app'
        for path in [app_dir / 'contracts.py', *app_dir.glob('db/supabase/*.py')]:
            tree = ast.parse(path.read_text(encoding='utf-8'))
            for node in ast.walk(tree):
                if isinstance(node, ast.ImportFrom):
                    self.assertFalse((node.module or '').startswith('app.api'), str(path))

    def test_actual_app_startup_with_mocked_ai_has_all_new_routes(self):
        settings = SimpleNamespace(sentry_dsn=None, app_name='test api', cors_origins=[], environment='test')
        with patch('app.config.get_settings', return_value=settings), patch('dotenv.load_dotenv'):
            main = importlib.import_module('app.main')
        with patch.object(main, 'build_chat_workflow', return_value=object()) as build, TestClient(main.app) as api:
            self.assertEqual(api.get('/health').json(), {'status': 'ok'})
            paths = api.get('/openapi.json').json()['paths']
            for path in ('/profile', '/onboarding', '/calendar', '/sports-workouts', '/planning/jobs', '/chat'):
                self.assertIn(path, paths)
            self.assertNotIn('/plan', paths)
            build.assert_called_once_with()


if __name__ == '__main__':
    unittest.main()
