import json
from typing import Any
from urllib.parse import urlencode
from urllib.error import HTTPError, URLError
from urllib.request import Request as UrlRequest
from urllib.request import urlopen

from app.config import get_settings


class SupabaseDataError(Exception):
    pass


def select_rows(
    table: str,
    query_params: list[tuple[str, str]],
    access_token: str,
) -> list[dict[str, Any]]:
    settings = get_settings()
    supabase_url = settings.supabase_url.rstrip("/")
    query = urlencode(query_params, safe=",().")
    url = f"{supabase_url}/rest/v1/{table}?{query}"

    request = UrlRequest(
        url,
        method="GET",
        headers={
            "Authorization": f"Bearer {access_token}",
            "apikey": settings.supabase_publishable_key,
            "Accept": "application/json",
        },
    )

    try:
        with urlopen(request, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")
        raise SupabaseDataError(details) from exc
    except URLError as exc:
        raise SupabaseDataError("Supabase data API is unavailable") from exc

    if not isinstance(payload, list):
        raise SupabaseDataError("Supabase data API returned an unexpected response")

    return payload


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


def upsert_rows(
    table: str,
    rows: dict[str, Any] | list[dict[str, Any]],
    access_token: str,
    on_conflict: str,
) -> None:
    settings = get_settings()
    supabase_url = settings.supabase_url.rstrip("/")
    query = urlencode({"on_conflict": on_conflict})
    url = f"{supabase_url}/rest/v1/{table}?{query}"

    request = UrlRequest(
        url,
        data=json.dumps(rows).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {access_token}",
            "apikey": settings.supabase_publishable_key,
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
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
