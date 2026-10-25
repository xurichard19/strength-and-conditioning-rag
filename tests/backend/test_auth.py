import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import httpx
from fastapi import HTTPException

from app.auth.supabase import verify_supabase_token


class AuthTests(unittest.TestCase):
    def setUp(self):
        self.request = Mock()
        client = self.enterContext(httpx.Client(transport=httpx.MockTransport(self.request), follow_redirects=False))
        self.enterContext(patch('app.auth.supabase.get_http_client', return_value=client))
        self.enterContext(patch('app.auth.supabase.get_settings', return_value=SimpleNamespace(
            supabase_url='https://auth.test/', supabase_publishable_key='publishable-test')))

    def test_requests_keep_each_callers_credentials_and_parse_identity(self):
        for token in ('first-token', 'second-token'):
            with self.subTest(token=token):
                self.request.return_value = httpx.Response(200, json={'id': 'user-id', 'email': 'athlete@example.invalid'})
                user = verify_supabase_token(token)
                request = self.request.call_args.args[0]
                self.assertEqual((request.method, str(request.url)), ('GET', 'https://auth.test/auth/v1/user'))
                self.assertEqual(request.headers['Authorization'], f'Bearer {token}')
                self.assertEqual(request.headers['apikey'], 'publishable-test')
                self.assertEqual((user.id, user.email, user.access_token), ('user-id', 'athlete@example.invalid', token))
        self.assertEqual(self.request.call_count, 2)

    def test_transient_failures_return_503_without_retry(self):
        for error in (httpx.ConnectTimeout('timeout'), httpx.ReadTimeout('timeout'), httpx.PoolTimeout('timeout'),
                      httpx.ConnectError('reset'), httpx.RemoteProtocolError('partial'), httpx.ReadError('partial')):
            with self.subTest(error=type(error).__name__):
                self.request.reset_mock()
                self.request.side_effect = error
                with self.assertRaises(HTTPException) as caught:
                    verify_supabase_token('test-jwt')
                self.assertEqual(caught.exception.status_code, 503)
                self.assertEqual(caught.exception.detail, caught.exception.detail.lower())
                self.request.assert_called_once()

    def test_http_errors_keep_status_even_if_body_cannot_be_read(self):
        class BrokenBody(httpx.SyncByteStream):
            def __iter__(self):
                raise httpx.ReadError('private upstream detail')

        for upstream, expected in ((401, 401), (403, 401), (500, 502), (302, 502)):
            with self.subTest(status=upstream):
                self.request.reset_mock()
                self.request.return_value = httpx.Response(upstream, stream=BrokenBody(),
                    headers={'location': 'https://other.test'})
                with self.assertRaises(HTTPException) as caught:
                    verify_supabase_token('test-jwt')
                self.assertEqual(caught.exception.status_code, expected)
                self.assertNotIn('private', caught.exception.detail)
                if expected == 401:
                    self.assertEqual(caught.exception.headers['WWW-Authenticate'], 'Bearer')
                self.assertTrue(self.request.return_value.is_closed)
                self.request.assert_called_once()

    def test_nonobject_auth_response_does_not_crash(self):
        self.request.return_value = httpx.Response(200, json=[])
        with self.assertRaises(HTTPException) as caught:
            verify_supabase_token('test-jwt')
        self.assertEqual(caught.exception.status_code, 401)

    def test_malformed_payload_returns_502(self):
        for content in (b'not-json', b'\xff'):
            with self.subTest(content=content):
                self.request.return_value = httpx.Response(200, content=content)
                with self.assertRaises(HTTPException) as caught:
                    verify_supabase_token('test-jwt')
                self.assertEqual(caught.exception.status_code, 502)


if __name__ == '__main__':
    unittest.main()
