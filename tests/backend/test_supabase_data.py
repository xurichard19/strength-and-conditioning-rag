import json
import unittest
from unittest.mock import Mock, patch

import httpx

from app.db.supabase.transport import (
    SupabaseDataError, call_rpc, delete_rows, insert_rows, select_rows, update_rows, upsert_rows,
)


class TransportTests(unittest.TestCase):
    def setUp(self):
        self.http = Mock(return_value=httpx.Response(200, json=[]))
        client = self.enterContext(httpx.Client(transport=httpx.MockTransport(self.http)))
        self.enterContext(patch('app.db.supabase.transport.get_http_client', return_value=client))
        self.settings = self.enterContext(patch('app.db.supabase.transport.settings'))
        self.settings.supabase_url = 'https://project.supabase.co/'
        self.settings.supabase_publishable_key = 'publishable-key'

    def test_patch_forwards_caller_auth_filters_and_returns_representation(self):
        returned_profile = {'display_name': 'Ada'}
        self.http.return_value = httpx.Response(200, json=[returned_profile])
        result = update_rows('profiles', returned_profile,
            [('select', 'display_name,onboarding_completed_at'), ('id', 'eq.user-123'),
             ('onboarding_completed_at', 'is.null')], 'caller-jwt')
        self.assertEqual(result, [returned_profile])
        self.http.assert_called_once()
        request = self.http.call_args.args[0]
        self.assertEqual(request.method, 'PATCH')
        self.assertEqual(str(request.url), 'https://project.supabase.co/rest/v1/profiles?'
            'select=display_name,onboarding_completed_at&id=eq.user-123&onboarding_completed_at=is.null')
        self.assertEqual(json.loads(request.content), returned_profile)
        self.assertEqual(request.headers['Authorization'], 'Bearer caller-jwt')
        self.assertEqual(request.headers['apikey'], 'publishable-key')
        self.assertEqual(request.headers['Prefer'], 'return=representation')
        self.assertTrue(self.http.return_value.is_closed)

    def test_patch_rejects_an_unexpected_data_api_response(self):
        for payload in ({'message': 'unexpected'}, [None]):
            with self.subTest(payload=payload):
                self.http.return_value = httpx.Response(200, json=payload)
                with self.assertRaises(SupabaseDataError):
                    update_rows('profiles', {'display_name': 'Ada'}, [('id', 'eq.user-123')], 'caller-jwt')

    def test_network_failures_are_structured_and_never_retried(self):
        for error in (httpx.ConnectError, httpx.ReadError, httpx.RemoteProtocolError,
                      httpx.ConnectTimeout, httpx.ReadTimeout, httpx.WriteTimeout, httpx.PoolTimeout):
            with self.subTest(error=error.__name__):
                self.http.reset_mock()
                self.http.side_effect = error('unavailable')
                with self.assertRaises(SupabaseDataError) as caught:
                    insert_rows('messages', {'content': 'hello'}, 'caller-jwt')
                self.assertIsNone(caught.exception.status_code)
                self.http.assert_called_once()

    def test_broken_error_body_keeps_http_status_and_releases_response(self):
        def broken_body():
            raise httpx.ReadError('partial response')
            yield b''
        for status in (200, 409):
            with self.subTest(status=status):
                self.http.return_value = httpx.Response(status, content=broken_body())
                with self.assertRaises(SupabaseDataError) as caught:
                    select_rows('profiles', [], 'caller-jwt')
                self.assertEqual(caught.exception.status_code, 409 if status == 409 else None)
                self.assertTrue(self.http.return_value.is_closed)

    def test_rpc_uses_rpc_path_and_allows_empty_responses(self):
        for response, expected in ((httpx.Response(200, json={'status': 'applied'}), {'status': 'applied'}),
                                   (httpx.Response(204), None)):
            with self.subTest(status=response.status_code):
                self.http.return_value = response
                self.assertEqual(call_rpc('complete_replan_job', {'id': '123'}, 'caller-jwt'), expected)
                self.assertEqual(str(self.http.call_args.args[0].url),
                    'https://project.supabase.co/rest/v1/rpc/complete_replan_job')

    def test_mutations_return_rows(self):
        row = {'id': '123'}
        self.http.side_effect = [httpx.Response(200, json=[row]) for _ in range(3)]
        self.assertEqual(insert_rows('profiles', row, 'caller-jwt'), [row])
        self.assertEqual(upsert_rows('profiles', row, 'caller-jwt', 'id'), [row])
        self.assertEqual(delete_rows('profiles', [('id', 'eq.123')], 'caller-jwt'), [row])
        insert, upsert, delete = [call.args[0] for call in self.http.call_args_list]
        self.assertEqual(insert.headers['Prefer'], 'return=representation')
        self.assertEqual(upsert.headers['Prefer'], 'resolution=merge-duplicates,return=representation')
        self.assertEqual(delete.method, 'DELETE')
        self.assertEqual(delete.headers['Prefer'], 'return=representation')

    def test_http_errors_preserve_status_codes_without_following_redirects(self):
        for status, body, message, code in (
            (409, b'{"message":"Duplicate Row","code":"23505"}', 'duplicate row', '23505'),
            (502, b'not-json', 'supabase data api request failed', None),
            (302, b'[]', 'supabase data api request failed', None),
        ):
            with self.subTest(status=status):
                self.http.reset_mock()
                self.http.return_value = httpx.Response(status, content=body,
                    headers={'Location': 'https://elsewhere.invalid'})
                with self.assertRaises(SupabaseDataError) as caught:
                    insert_rows('profiles', {'id': '123'}, 'caller-jwt')
                self.assertEqual(str(caught.exception), message)
                self.assertEqual((caught.exception.status_code, caught.exception.code), (status, code))
                self.assertIsNone(caught.exception.__cause__)
                self.http.assert_called_once()
                self.assertTrue(self.http.return_value.is_closed)

    def test_table_and_rpc_names_are_validated(self):
        with self.assertRaisesRegex(ValueError, 'invalid supabase resource name'):
            select_rows('../profiles', [], 'caller-jwt')
        with self.assertRaisesRegex(ValueError, 'invalid supabase resource name'):
            call_rpc('apply-change', {}, 'caller-jwt')
        self.http.assert_not_called()

    def test_update_and_delete_require_filters(self):
        with self.assertRaisesRegex(ValueError, 'update filters are required'):
            update_rows('profiles', {}, [], 'caller-jwt')
        with self.assertRaisesRegex(ValueError, 'delete filters are required'):
            delete_rows('profiles', [], 'caller-jwt')
        self.http.assert_not_called()

    def test_mutations_reject_modifiers_and_embedded_filters(self):
        for filters in ([('select', '*')], [('order', 'id.asc'), ('limit', '1')],
                        [('offset', '1')], [('exercises.id', 'eq.123')]):
            with self.subTest(filters=filters):
                with self.assertRaisesRegex(ValueError, 'update filters are required'):
                    update_rows('profiles', {}, filters, 'caller-jwt')
                with self.assertRaisesRegex(ValueError, 'delete filters are required'):
                    delete_rows('profiles', filters, 'caller-jwt')
        self.http.assert_not_called()


if __name__ == '__main__':
    unittest.main()
