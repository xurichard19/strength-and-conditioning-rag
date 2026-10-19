"""Shared, bounded HTTP connections for synchronous backend requests."""

from contextlib import asynccontextmanager
from http.cookiejar import CookieJar, DefaultCookiePolicy
import logging
from threading import Lock

import httpx


# Request URLs can contain private database filters; retain named application spans.
logging.getLogger("httpx").setLevel(logging.WARNING)
_client: httpx.Client | None = None
_lock = Lock()


def get_http_client() -> httpx.Client:
    """reuse one thread-safe pool per process; credentials belong to each request"""
    global _client
    with _lock:
        if _client is None:
            _client = httpx.Client(
                timeout=httpx.Timeout(10, pool=5),
                limits=httpx.Limits(max_connections=40, max_keepalive_connections=20, keepalive_expiry=30),
                follow_redirects=False,
                cookies=CookieJar(policy=DefaultCookiePolicy(allowed_domains=[])),
            )
        return _client


def close_http_client() -> None:
    """release idle connections after the service has drained its requests"""
    global _client
    with _lock:
        if _client is not None:
            _client.close()
            _client = None


@asynccontextmanager
async def http_lifespan(app):
    """close the lazily created pool on shutdown, including failed startup"""
    try:
        yield
    finally:
        close_http_client()
