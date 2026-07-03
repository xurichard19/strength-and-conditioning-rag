import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request as UrlRequest
from urllib.request import urlopen

from app.core.config import get_settings


class SupabaseDataError(Exception):
    pass


def insert_rows(table: str, rows: dict[str, Any] | list[dict[str, Any]], access_token: str) -> None:
    settings = get_settings()
    supabase_url = settings.supabase_url.rstrip("/")
    url = f"{supabase_url}/rest/v1/{table}"

    request = UrlRequest(
        url,
        data=json.dumps(rows).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {access_token}",
            "apikey": settings.supabase_publishable_key,
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
    )

    try:
        with urlopen(request, timeout=10):
            return
    except HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")
        raise SupabaseDataError(details) from exc
    except URLError as exc:
        raise SupabaseDataError("Supabase data API is unavailable") from exc
