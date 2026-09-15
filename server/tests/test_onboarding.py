import unittest
from unittest.mock import patch

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
        handler.assert_called_once_with(USER.id, USER.access_token)

    @patch("app.api.routers.onboarding.onboarding_responses.complete_onboarding_response", return_value=None)
    def test_completion_requires_a_saved_row(self, handler):
        response = self.client.post('/onboarding/complete')
        self.assertEqual(response.status_code, 404)

    @patch("app.api.routers.onboarding.onboarding_responses.save_onboarding_response",
           side_effect=SupabaseDataError('private-database-detail'))
    def test_save_error_is_sanitized(self, handler):
        response = self.client.put('/onboarding', json={'answers': {}})
        self.assertEqual(response.status_code, 502)
        self.assertNotIn('private-database-detail', response.text)


if __name__ == '__main__':
    unittest.main()
