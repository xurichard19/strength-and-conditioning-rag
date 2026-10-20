"""expose only the local revenuecat webhook to a development tunnel"""

import argparse
from http.client import HTTPConnection, HTTPException
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json


WEBHOOK_PATH = "/billing/webhooks/revenuecat"
# Matches app.integrations.revenuecat.MAX_RESPONSE_BYTES without importing app settings.
MAX_BODY_BYTES = 1024 * 1024
UPSTREAM_TIMEOUT_SECONDS = 8
CLIENT_TIMEOUT_SECONDS = 10
REQUEST_HEADERS = ("Authorization", "Content-Type", "X-RevenueCat-Webhook-Signature")
RESPONSE_HEADERS = ("Content-Type", "Cache-Control", "Vary", "Retry-After")


class WebhookProxy(ThreadingHTTPServer):
    """serve a loopback-only proxy for a loopback-only backend"""

    daemon_threads = True

    def __init__(self, port: int = 8001, upstream_port: int = 8000):
        self.upstream_port = upstream_port
        super().__init__(("127.0.0.1", port), WebhookHandler)


class WebhookHandler(BaseHTTPRequestHandler):
    """forward one exact route without exposing other backend endpoints"""

    protocol_version = "HTTP/1.1"
    server: WebhookProxy

    def setup(self) -> None:
        super().setup()
        self.connection.settimeout(CLIENT_TIMEOUT_SECONDS)

    def log_message(self, format: str, *args) -> None:
        # Request URLs, headers, bodies and upstream exceptions must never enter logs.
        pass

    def handle_expect_100(self) -> bool:
        # Validate routing and length before inviting the client to send its body.
        return True

    def parse_request(self) -> bool:
        if not super().parse_request():
            return False
        # BaseHTTPRequestHandler normalizes leading double slashes; check the raw target too.
        if self.requestline.split()[1] != WEBHOOK_PATH:
            self._error(404, "not_found")
            return False
        if self.command != "POST":
            self._error(405, "method_not_allowed", {"Allow": "POST"})
            return False
        return True

    def _respond(self, status: int, body: bytes, headers: dict[str, str]) -> None:
        self.close_connection = True
        try:
            self.send_response(status)
            for name, value in headers.items():
                self.send_header(name, value)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Connection", "close")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)
        except OSError:
            # Clients can disconnect while the bounded upstream request completes.
            pass

    def _error(self, status: int, detail: str, headers: dict[str, str] | None = None) -> None:
        self._respond(status, json.dumps({"detail": detail}).encode(), {
            "Content-Type": "application/json",
            "Cache-Control": "private, no-store",
            **(headers or {}),
        })

    def do_POST(self) -> None:
        """relay the original payload and authentication headers with bounded i/o"""

        lengths = self.headers.get_all("Content-Length", [])
        if self.headers.get("Transfer-Encoding") or len(lengths) > 1:
            self._error(400, "invalid_request_framing")
            return
        if not lengths:
            self._error(411, "content_length_required")
            return
        if not lengths[0].isascii() or not lengths[0].isdigit():
            self._error(400, "invalid_content_length")
            return
        # Bound the decimal representation before conversion as well as the body.
        if len(lengths[0]) > 10 or int(lengths[0]) > MAX_BODY_BYTES:
            self._error(413, "webhook_body_too_large")
            return
        if any(len(self.headers.get_all(name, [])) > 1 for name in REQUEST_HEADERS):
            self._error(400, "duplicate_webhook_header")
            return
        length = int(lengths[0])
        if self.headers.get("Expect", "").lower() == "100-continue":
            self.send_response_only(100)
            self.end_headers()
        try:
            body = self.rfile.read(length)
        except TimeoutError:
            self._error(408, "request_timeout")
            return
        except OSError:
            self._error(400, "incomplete_request_body")
            return
        if len(body) != length:
            self._error(400, "incomplete_request_body")
            return

        headers = {name: self.headers[name] for name in REQUEST_HEADERS if name in self.headers}
        connection = HTTPConnection("127.0.0.1", self.server.upstream_port, timeout=UPSTREAM_TIMEOUT_SECONDS)
        try:
            connection.request("POST", WEBHOOK_PATH, body=body, headers=headers)
            response = connection.getresponse()
            response_body = response.read(MAX_BODY_BYTES + 1)
            if len(response_body) > MAX_BODY_BYTES:
                self._error(502, "upstream_response_too_large")
                return
            response_headers = {name: value for name in RESPONSE_HEADERS if (value := response.getheader(name))}
            self._respond(response.status, response_body, response_headers)
        except TimeoutError:
            self._error(504, "upstream_timeout")
        except (HTTPException, OSError):
            self._error(502, "upstream_unavailable")
        finally:
            connection.close()


def _port(value: str) -> int:
    """validate the local listening and upstream tcp ports"""

    port = int(value)
    if not 1 <= port <= 65535:
        raise argparse.ArgumentTypeError("port must be between 1 and 65535")
    return port


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=_port, default=8001)
    parser.add_argument("--upstream-port", type=_port, default=8000)
    args = parser.parse_args()
    with WebhookProxy(args.port, args.upstream_port) as server:
        print(f"local webhook proxy: http://127.0.0.1:{args.port}{WEBHOOK_PATH} -> backend port {args.upstream_port}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
