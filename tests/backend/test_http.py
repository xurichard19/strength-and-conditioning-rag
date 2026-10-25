import asyncio
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import socket
from threading import Barrier, Event, Thread
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from pydantic import SecretStr

from app import http
from app.auth import supabase as auth
from app.db.supabase import transport


class HttpPoolTests(unittest.TestCase):
    def setUp(self):
        http.close_http_client()
        self.addCleanup(http.close_http_client)

    def test_keepalive_reuses_connections_without_sharing_credentials_or_cookies(self):
        requests, connections = [], []

        class Handler(BaseHTTPRequestHandler):
            protocol_version = 'HTTP/1.1'

            def setup(self):
                super().setup()
                connections.append(self.connection)

            def do_GET(self):
                self.rfile.read(int(self.headers.get('Content-Length', 0)))
                requests.append({key.lower(): value for key, value in self.headers.items()})
                payload = {'id': self.headers.get('Authorization', '').removeprefix('Bearer ')}
                body = json.dumps(payload if self.path == '/auth/v1/user' else [payload]).encode()
                self.send_response(302 if self.path == '/redirect' else 200)
                self.send_header('Content-Length', str(len(body)))
                self.send_header('Content-Type', 'application/json')
                self.send_header('Set-Cookie', 'session=private; Path=/')
                if self.path == '/redirect':
                    self.send_header('Location', '/auth/v1/user')
                self.end_headers()
                self.wfile.write(body)

            do_POST = do_GET

            def log_message(self, *_args):
                pass

        def loopback(host, port, *_args, **_kwargs):
            self.assertEqual(host, '127.0.0.1')
            return [(socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, '', (host, port))]

        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = Thread(target=server.serve_forever, kwargs={'poll_interval': 0.01}, daemon=True)
        thread.start()
        settings = SimpleNamespace(supabase_url=f'http://127.0.0.1:{server.server_port}',
            supabase_publishable_key='public-test', supabase_secret_key=SecretStr('backend-test'))
        try:
            with patch('socket.getaddrinfo', side_effect=loopback), \
                    patch.dict('os.environ', {'NO_PROXY': '127.0.0.1', 'no_proxy': '127.0.0.1'}), \
                    patch.object(auth, 'get_settings', return_value=settings), patch.object(transport, 'settings', settings):
                self.assertEqual(auth.verify_supabase_token('user-a').id, 'user-a')
                transport.insert_rows('profiles', {'id': 'user-a'}, 'user-a')
                self.assertEqual(transport.select_rows('profiles', [], 'user-a'), [{'id': 'user-a'}])
                self.assertEqual(auth.verify_supabase_token('user-b').id, 'user-b')
                self.assertEqual(transport.select_rows('profiles', [], 'user-b'), [{'id': 'user-b'}])
                transport.select_rows('profiles', [], None)
                client = http.get_http_client()
                self.assertEqual(client.get(f'{settings.supabase_url}/redirect').status_code, 302)
                self.assertFalse(client.cookies)
            self.assertEqual(len(connections), 1)
            self.assertEqual(len(requests), 7, 'redirects must not forward credentials or add another request')
            self.assertEqual([row.get('authorization') for row in requests],
                ['Bearer user-a'] * 3 + ['Bearer user-b'] * 2 + [None, None])
            self.assertEqual([row.get('apikey') for row in requests], ['public-test'] * 5 + ['backend-test', None])
            self.assertTrue(all('cookie' not in row for row in requests))
            self.assertEqual([row.get('prefer') for row in requests], [None, 'return=representation'] + [None] * 5)
            self.assertTrue(all('content-type' not in row for row in requests[2:]))
        finally:
            http.close_http_client()
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def test_concurrent_initialization_shares_one_client_and_shutdown_allows_recreation(self):
        barrier, entered, release = Barrier(8), Event(), Event()
        first, second = Mock(), Mock()

        def create(**_kwargs):
            entered.set()
            if not release.wait(2):
                raise TimeoutError('test did not release client initialization')
            return first

        def acquire():
            barrier.wait(timeout=2)
            return http.get_http_client()

        with patch('app.http.httpx.Client', side_effect=create) as constructor:
            with ThreadPoolExecutor(max_workers=8) as executor:
                futures = [executor.submit(acquire) for _ in range(8)]
                try:
                    self.assertTrue(entered.wait(2))
                finally:
                    release.set()
                self.assertTrue(all(future.result(timeout=2) is first for future in futures))
            constructor.assert_called_once()
            http.close_http_client()
            http.close_http_client()
            first.close.assert_called_once_with()
            constructor.side_effect = None
            constructor.return_value = second
            self.assertIs(http.get_http_client(), second)
            self.assertEqual(constructor.call_count, 2)
            http.close_http_client()
            second.close.assert_called_once_with()

    def test_every_app_closes_the_pool_on_shutdown(self):
        from app import main
        from app.jobs import replan_worker, scheduler

        async def exercise():
            with patch.object(main, 'build_chat_workflow', return_value=object()):
                for app in (main.app, scheduler.app, replan_worker.app):
                    with self.subTest(app=app.title), patch.object(http, 'close_http_client') as close:
                        async with app.router.lifespan_context(app):
                            close.assert_not_called()
                        close.assert_called_once_with()

        asyncio.run(exercise())

    def test_main_closes_the_pool_when_graph_startup_fails(self):
        from app import main

        async def start():
            async with main.app.router.lifespan_context(main.app):
                self.fail('startup should fail before accepting requests')

        with patch.object(main, 'build_chat_workflow', side_effect=RuntimeError('startup failed')), \
                patch.object(http, 'close_http_client') as close:
            with self.assertRaisesRegex(RuntimeError, 'startup failed'):
                asyncio.run(start())
            close.assert_called_once_with()
