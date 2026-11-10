"""Service credentials retain explicit owner boundaries after direct access is removed."""

import json
import unittest
from unittest.mock import Mock, patch

import httpx
from pydantic import SecretStr

from app.contracts import SportsWorkoutInput, SportsWorkoutUpdate
from app.db.supabase import messages, planning_changes, sports_workouts, workouts
from app.db.supabase.transport import SupabaseDataError
from tests.backend.test_supabase_queries import DAY, JOB, USER, WORKOUT, duplicate_sport_error


class PaidDatabaseAccessTests(unittest.TestCase):
    def setUp(self):
        self.http = Mock(return_value=httpx.Response(200, json=[]))
        client = self.enterContext(httpx.Client(transport=httpx.MockTransport(self.http)))
        self.enterContext(patch('app.db.supabase.transport.get_http_client', return_value=client))
        settings = self.enterContext(patch('app.db.supabase.transport.settings'))
        settings.supabase_url = 'https://test.invalid'
        settings.supabase_publishable_key = 'public-key'
        settings.supabase_secret_key = SecretStr('sb_secret_test-key')

    def assert_owned_service_request(self, request, object_id=None):
        self.assertEqual(request.headers.get('Apikey'), 'sb_secret_test-key')
        self.assertIsNone(request.headers.get('Authorization'))
        self.assertEqual(request.url.params['user_id'], f'eq.{USER}')
        if object_id is not None:
            self.assertEqual(request.url.params['id'], f'eq.{object_id}')

    def test_protected_reads_and_mutations_scope_service_access_to_the_verified_owner(self):
        operations = [
            lambda: messages.get_conversation(USER, JOB, None),
            lambda: messages.rename_conversation(USER, JOB, 'renamed', None),
            lambda: messages.delete_conversation(USER, JOB, None),
            lambda: sports_workouts.get_sports_workout(USER, JOB, None),
            lambda: sports_workouts.update_sports_workout(USER, JOB, SportsWorkoutUpdate(notes='updated'), None),
            lambda: sports_workouts.set_sports_workout_status(USER, JOB, 'completed', None),
            lambda: sports_workouts.delete_sports_workout(USER, JOB, None),
            lambda: workouts.get_workout(USER, JOB, None),
            lambda: planning_changes.get_planning_change(USER, JOB, None),
        ]
        for operation in operations:
            with self.subTest(operation=operation):
                self.assertIsNone(operation())
                self.assert_owned_service_request(self.http.call_args.args[0], JOB)

    def test_foreign_conversation_cursor_cannot_read_another_accounts_page(self):
        self.assertEqual(messages.get_conversations(USER, None, before=JOB), [])
        self.http.assert_called_once()
        self.assert_owned_service_request(self.http.call_args.args[0], JOB)

    def test_message_history_always_filters_both_thread_and_owner(self):
        self.assertEqual(messages.get_recent_messages(USER, None, conversation_id=JOB), [])
        request = self.http.call_args.args[0]
        self.assert_owned_service_request(request)
        self.assertEqual(request.url.params['conversation_id'], f'eq.{JOB}')

    def test_sports_id_collision_cannot_overwrite_another_accounts_commitment(self):
        self.http.side_effect = [duplicate_sport_error(), httpx.Response(200, json=[])]
        with self.assertRaises(SupabaseDataError) as failure:
            sports_workouts.create_sports_workout(USER,
                SportsWorkoutInput(id=WORKOUT, sport='running', scheduled_date=DAY), None)
        self.assertEqual(failure.exception.status_code, 409)
        requests = [call.args[0] for call in self.http.call_args_list]
        self.assertEqual([request.method for request in requests], ['POST', 'GET'])
        self.assertEqual(json.loads(requests[0].content)['user_id'], str(USER))
        self.assert_owned_service_request(requests[1], WORKOUT)
