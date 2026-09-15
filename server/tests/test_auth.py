import unittest
from http.client import IncompleteRead
from unittest.mock import patch

from fastapi import HTTPException

from app.auth.supabase import verify_supabase_token
from server.tests.test_supabase_data import FakeResponse


class AuthFailureTests(unittest.TestCase):
    @patch('app.auth.supabase.urlopen')
    def test_transient_failures_return_503_without_retry(self, request):
        for error in (TimeoutError(), ConnectionResetError(), IncompleteRead(b'partial')):
            with self.subTest(error=type(error).__name__):
                request.reset_mock()
                request.side_effect = error
                with self.assertRaises(HTTPException) as caught:
                    verify_supabase_token('test-jwt')
                self.assertEqual(caught.exception.status_code, 503)
                self.assertEqual(caught.exception.detail, caught.exception.detail.lower())
                request.assert_called_once()

    @patch('app.auth.supabase.urlopen', return_value=FakeResponse([]))
    def test_nonobject_auth_response_does_not_crash(self, request):
        with self.assertRaises(HTTPException) as caught:
            verify_supabase_token('test-jwt')
        self.assertEqual(caught.exception.status_code, 401)

    @patch('app.auth.supabase.urlopen')
    def test_invalid_json_returns_502(self, request):
        request.return_value.__enter__.return_value.read.return_value = b'not-json'
        with self.assertRaises(HTTPException) as caught:
            verify_supabase_token('test-jwt')
        self.assertEqual(caught.exception.status_code, 502)


if __name__ == '__main__':
    unittest.main()
