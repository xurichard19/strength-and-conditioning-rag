import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app.contracts import OnboardingResponseRecord
from app.db.supabase import SupabaseDataError
from server.tests.test_profile import NOW, USER, api_client


ANSWERS = {"new_question": ["running", "lifting"], "schedule": {"days": 3}, "optional": None}
RECORD = OnboardingResponseRecord(user_id=USER.id, answers=ANSWERS, created_at=NOW, updated_at=NOW)


class OnboardingRouteTests(unittest.TestCase):
    def setUp(self):
        self.client = api_client()
        self.addCleanup(self.client.close)

    @patch("app.api.routers.onboarding.onboarding_responses.get_onboarding_response", return_value=RECORD)
    def test_get_current_answers(self, handler):
        response = self.client.get('/onboarding')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), RECORD.model_dump(mode='json'))
        self.assertEqual(response.headers['cache-control'], 'private, no-store')
        handler.assert_called_once_with(USER.id, USER.access_token)

    @patch("app.api.routers.onboarding.onboarding_responses.get_onboarding_response", return_value=None)
    def test_no_saved_answers_returns_null(self, handler):
        response = self.client.get('/onboarding')
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json())

    @patch("app.api.routers.onboarding.onboarding_responses.save_onboarding_response", return_value=RECORD)
    def test_save_accepts_flexible_json_and_never_sends_completion_time(self, handler):
        response = self.client.put('/onboarding', json={'answers': ANSWERS})
        self.assertEqual(response.status_code, 200)
        handler.assert_called_once_with(USER.id, ANSWERS, USER.access_token)
        self.assertEqual(response.headers['cache-control'], 'private, no-store')

    @patch("app.api.routers.onboarding.onboarding_responses.save_onboarding_response", return_value=RECORD)
    def test_empty_answers_are_allowed(self, handler):
        self.assertEqual(self.client.put('/onboarding', json={'answers': {}}).status_code, 200)
        handler.assert_called_once_with(USER.id, {}, USER.access_token)

    @patch("app.api.routers.onboarding.onboarding_responses.save_onboarding_response")
    def test_invalid_and_server_owned_fields_are_rejected(self, handler):
        for body in ({}, {'answers': []}, {'answers': None}, {'answers': 'serialized json'},
                     {'answers': {}, 'user_id': USER.id}, {'answers': {}, 'completed_at': NOW}):
            with self.subTest(body=body):
                self.assertEqual(self.client.put('/onboarding', json=body).status_code, 422)
        handler.assert_not_called()

    @patch("app.api.routers.onboarding.onboarding_responses.complete_onboarding_response")
    def test_completion_returns_record_without_rewriting_answers(self, handler):
        handler.return_value = RECORD.model_copy(update={'completed_at': RECORD.created_at})
        response = self.client.post('/onboarding/complete')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['answers'], ANSWERS)
        self.assertEqual(response.json()['completed_at'], NOW)
        self.assertEqual(response.headers['cache-control'], 'private, no-store')
        handler.assert_called_once_with(USER.id)

    @patch("app.api.routers.onboarding.onboarding_responses.complete_onboarding_response", return_value=RECORD)
    def test_completion_body_cannot_select_another_owner_or_replace_answers(self, handler):
        other = '22222222-2222-4222-8222-222222222222'
        response = self.client.post(f'/onboarding/complete?user_id={other}',
            json={'user_id': other, 'answers': {'goal': 'overwrite'}, 'completed_at': NOW})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['user_id'], USER.id)
        self.assertEqual(response.json()['answers'], ANSWERS)
        handler.assert_called_once_with(USER.id)

    @patch("app.api.routers.onboarding.onboarding_responses.complete_onboarding_response")
    def test_unauthenticated_completion_never_calls_backend(self, handler):
        with api_client(False) as anonymous, patch('app.auth.supabase.verify_supabase_token',
                side_effect=HTTPException(401, 'invalid session', headers={'WWW-Authenticate': 'Bearer'})) as verify:
            response = anonymous.post('/onboarding/complete', json={'user_id': USER.id})
            self.assertEqual(response.status_code, 401)
            verify.assert_not_called()
            response = anonymous.post('/onboarding/complete', headers={'Authorization': 'Bearer invalid-token'})
            self.assertEqual(response.status_code, 401)
            self.assertEqual(response.headers['www-authenticate'], 'Bearer')
            verify.assert_called_once_with('invalid-token')
        handler.assert_not_called()

    @patch("app.api.routers.onboarding.onboarding_responses.complete_onboarding_response", return_value=None)
    def test_completion_requires_a_saved_row(self, handler):
        response = self.client.post('/onboarding/complete')
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.headers['cache-control'], 'private, no-store')
        handler.assert_called_once_with(USER.id)

    @patch("app.api.routers.onboarding.onboarding_responses.complete_onboarding_response")
    def test_completion_database_failures_are_sanitized_and_keep_status(self, handler):
        for upstream, expected in ((None, 502), (500, 502), (403, 403), (409, 409)):
            with self.subTest(status=upstream):
                handler.side_effect = SupabaseDataError('private-database-detail', status_code=upstream)
                with self.assertLogs('app.api.errors'):
                    response = self.client.post('/onboarding/complete')
                self.assertEqual(response.status_code, expected)
                self.assertNotIn('private-database-detail', response.text)
                self.assertEqual(response.headers['cache-control'], 'private, no-store')

    def test_invalid_completion_rpc_response_is_a_sanitized_upstream_failure(self):
        with patch('app.db.supabase.onboarding_responses.call_rpc', return_value={'private': 'database detail'}), \
                self.assertLogs('app.api.errors'):
            response = self.client.post('/onboarding/complete')
        self.assertEqual(response.status_code, 502)
        self.assertNotIn('database detail', response.text)
        self.assertEqual(response.headers['cache-control'], 'private, no-store')

    @patch("app.api.routers.onboarding.onboarding_responses.save_onboarding_response",
           side_effect=SupabaseDataError('private-database-detail'))
    def test_save_error_is_sanitized(self, handler):
        response = self.client.put('/onboarding', json={'answers': {}})
        self.assertEqual(response.status_code, 502)
        self.assertNotIn('private-database-detail', response.text)


if __name__ == '__main__':
    unittest.main()
