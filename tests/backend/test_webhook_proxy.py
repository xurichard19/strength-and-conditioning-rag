from contextlib import closing, contextmanager
from http.client import HTTPConnection
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import io
import json
from threading import Thread
import unittest
from unittest.mock import patch

from server.scripts import revenuecat_webhook_proxy as proxy


@contextmanager
def running_server(server):
    thread = Thread(target=server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)
    thread.start()
    try:
        yield server.server_port
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=1)


class WebhookProxyTests(unittest.TestCase):
    def setUp(self):
        self.requests = []
        requests = self.requests

        class Backend(BaseHTTPRequestHandler):
            def do_POST(self):
                requests.append((self.path, self.headers, self.rfile.read(int(self.headers["Content-Length"]))))
                self.send_response(401)
                self.send_header("Content-Type", "application/json")
                self.send_header("Cache-Control", "private, no-store")
                self.send_header("X-Internal-Header", "not-forwarded")
                self.end_headers()
                self.wfile.write(b'{"detail":"invalid webhook authorization"}')

            def log_message(self, format, *args):
                pass

        self.backend = self.enterContext(running_server(ThreadingHTTPServer(("127.0.0.1", 0), Backend)))
        self.port = self.enterContext(running_server(proxy.WebhookProxy(0, self.backend)))

    def request(self, method="POST", path=proxy.WEBHOOK_PATH, body=b"{}", headers=None):
        with closing(HTTPConnection("127.0.0.1", self.port, timeout=2)) as client:
            client.request(method, path, body=body, headers=headers or {})
            response = client.getresponse()
            return response.status, dict(response.getheaders()), response.read()

    def test_only_exact_webhook_path_is_forwarded(self):
        for path in ("/", "/docs", "/billing/status", "/" + proxy.WEBHOOK_PATH, proxy.WEBHOOK_PATH + "/",
                proxy.WEBHOOK_PATH + "?secret=private", "/billing/webhooks/%72evenuecat",
                "http://127.0.0.1:8000" + proxy.WEBHOOK_PATH):
            with self.subTest(path=path):
                self.assertEqual(self.request(path=path)[0], 404)
        self.assertEqual(self.requests, [])

    def test_other_methods_are_rejected_even_for_unknown_verbs(self):
        for method in ("GET", "HEAD", "PUT", "PATCH", "DELETE", "OPTIONS", "BREW"):
            with self.subTest(method=method):
                status, headers, _ = self.request(method=method)
                self.assertEqual(status, 405)
                self.assertEqual(headers["Allow"], "POST")
        self.assertEqual(self.requests, [])

    def test_raw_body_and_authentication_headers_are_preserved(self):
        body = b'{ "event": {"type": "TEST"} }\n'
        authorization = "Bearer test-secret"
        signature = "t=123,v1=abc"
        status, headers, response = self.request(body=body, headers={
            "Authorization": authorization, "Content-Type": "application/json",
            "X-RevenueCat-Webhook-Signature": signature, "X-Do-Not-Forward": "private",
            "Host": "public-tunnel.example", "Cookie": "private",
        })
        self.assertEqual(status, 401)
        self.assertEqual(json.loads(response), {"detail": "invalid webhook authorization"})
        self.assertEqual(headers["Cache-Control"], "private, no-store")
        self.assertNotIn("X-Internal-Header", headers)
        path, received_headers, received_body = self.requests[0]
        self.assertEqual(path, proxy.WEBHOOK_PATH)
        self.assertEqual(received_body, body)
        self.assertEqual(received_headers["Authorization"], authorization)
        self.assertEqual(received_headers["X-RevenueCat-Webhook-Signature"], signature)
        self.assertEqual(received_headers["Content-Type"], "application/json")
        self.assertEqual(received_headers["Host"], f"127.0.0.1:{self.backend}")
        self.assertNotIn("X-Do-Not-Forward", received_headers)
        self.assertNotIn("Cookie", received_headers)

    def test_body_limit_rejects_before_reading_and_accepts_boundary(self):
        for length in (str(proxy.MAX_BODY_BYTES + 1), "9" * 5000):
            with self.subTest(length_size=len(length)):
                self.assertEqual(self.request(body=b"", headers={"Content-Length": length})[0], 413)
        self.assertEqual(self.requests, [])
        self.assertEqual(self.request(body=b"a" * proxy.MAX_BODY_BYTES)[0], 401)
        self.assertEqual(len(self.requests[0][2]), proxy.MAX_BODY_BYTES)

    def test_ambiguous_and_invalid_request_framing_is_rejected(self):
        for headers in ({"Transfer-Encoding": "chunked"}, {"Content-Length": "-1"}, {"Content-Length": "1.0"}):
            with self.subTest(headers=headers):
                self.assertEqual(self.request(headers=headers)[0], 400)
        with closing(HTTPConnection("127.0.0.1", self.port, timeout=2)) as client:
            client.putrequest("POST", proxy.WEBHOOK_PATH)
            client.putheader("Content-Length", "0")
            client.putheader("Content-Length", "0")
            client.endheaders()
            self.assertEqual(client.getresponse().status, 400)
        with closing(HTTPConnection("127.0.0.1", self.port, timeout=2)) as client:
            client.putrequest("POST", proxy.WEBHOOK_PATH)
            client.endheaders()
            self.assertEqual(client.getresponse().status, 411)
        self.assertEqual(self.requests, [])

    def test_duplicate_authentication_headers_are_rejected(self):
        with closing(HTTPConnection("127.0.0.1", self.port, timeout=2)) as client:
            client.putrequest("POST", proxy.WEBHOOK_PATH)
            client.putheader("Content-Length", "0")
            client.putheader("Authorization", "Bearer first")
            client.putheader("Authorization", "Bearer second")
            client.endheaders()
            self.assertEqual(client.getresponse().status, 400)
        self.assertEqual(self.requests, [])

    def test_upstream_errors_are_bounded_and_do_not_leak_secrets(self):
        for exception, status in ((OSError("private upstream secret"), 502), (TimeoutError("private timeout secret"), 504)):
            with self.subTest(status=status), patch.object(proxy, "HTTPConnection") as upstream, patch("sys.stderr", new_callable=io.StringIO) as log:
                upstream.return_value.request.side_effect = exception
                actual, _, body = self.request(headers={"Authorization": "Bearer private request secret"})
                self.assertEqual(actual, status)
                self.assertNotIn(b"secret", body)
                self.assertEqual(log.getvalue(), "")
                upstream.assert_called_once_with("127.0.0.1", self.backend, timeout=8)
                upstream.return_value.close.assert_called_once()

    def test_upstream_response_is_bounded(self):
        with patch.object(proxy, "HTTPConnection") as upstream:
            response = upstream.return_value.getresponse.return_value
            response.read.return_value = b"a" * (proxy.MAX_BODY_BYTES + 1)
            self.assertEqual(self.request()[0], 502)
            response.read.assert_called_once_with(proxy.MAX_BODY_BYTES + 1)


if __name__ == "__main__":
    unittest.main()
