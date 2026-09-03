# generic supabase rest requests and error handling

import json
import re
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request as UrlRequest
from urllib.request import urlopen

from app.config import get_settings


class SupabaseDataError(Exception):
    def __init__(
        self,
        message: str,
        status_code: int | None = None,
        code: str | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code


settings = get_settings()


def _request(
    path: str,
    method: str,
    access_token: str,
    query_params: list[tuple[str, str]] | None = None,
    body: dict[str, Any] | list[dict[str, Any]] | None = None,
    prefer: str | None = None,
    rpc: bool = False,
) -> Any:
    if not re.fullmatch(r"[a-z_][a-z0-9_]*", path):
        raise ValueError("invalid supabase resource name")

    # build request
    resource = f"rpc/{path}" if rpc else path
    url = f'{settings.supabase_url.rstrip("/")}/rest/v1/{resource}'
    if query_params:
        url = f"{url}?{urlencode(query_params, safe=',().')}"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "apikey": settings.supabase_publishable_key,
        "Accept": "application/json",
    }
    if body is not None:
        headers["Content-Type"] = "application/json"
    if prefer:
        headers["Prefer"] = prefer

    request = UrlRequest(
        url,
        data=json.dumps(body).encode("utf-8") if body is not None else None,
        method=method,
        headers=headers,
    )

    try:
        with urlopen(request, timeout=10) as response:
            content = response.read()
            return json.loads(content.decode("utf-8")) if content else None
    except HTTPError as exc:
        try:
            error = json.loads(exc.read().decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            error = {}
        if not isinstance(error, dict):
            error = {}
        code = error.get("code")
        raise SupabaseDataError(
            str(error.get("message", "supabase data api request failed")).lower(),
            exc.code,
            code if isinstance(code, str) else None,
        ) from exc
    except (json.JSONDecodeError, TimeoutError, UnicodeDecodeError, URLError) as exc:
        raise SupabaseDataError("supabase data api is unavailable") from exc


def _rows(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, list) or any(not isinstance(row, dict) for row in payload):
        raise SupabaseDataError("supabase data api returned an unexpected response")
    return payload


def select_rows(
    table: str,
    query_params: list[tuple[str, str]],
    access_token: str,
) -> list[dict[str, Any]]:
    """
    select rows from supabase table using supabase rest api

    - **table**: table name
    - **query_params**: tuples representing query parameters for the request
    - **access_token**: user jwt
    """

    return _rows(_request(table, "GET", access_token, query_params))


def call_rpc(
    function_name: str,
    payload: dict[str, Any],
    access_token: str,
) -> Any:
    """
    call a postgres function using supabase rest api

    rpc lets the database run multi-step work as one transaction, such as replacing
    future workouts and recording the related plan change together

    - **function_name**: name of postgres function
    - **payload**: arguments passed to the function
    - **access_token**: user jwt
    """

    return _request(function_name, "POST", access_token, body=payload, rpc=True)


def insert_rows(
    table: str,
    rows: dict[str, Any] | list[dict[str, Any]],
    access_token: str,
) -> list[dict[str, Any]]:
    """
    insert rows into supabase table using supabase rest api

    - **table**: table name
    - **rows**: row or rows to insert
    - **access_token**: user jwt
    """

    return _rows(
        _request(table, "POST", access_token, body=rows, prefer="return=representation")
    )


def upsert_rows(
    table: str,
    rows: dict[str, Any] | list[dict[str, Any]],
    access_token: str,
    on_conflict: str,
) -> list[dict[str, Any]]:
    """
    upsert rows into supabase table using supabase rest api

    - **table**: table name
    - **rows**: row or rows to upsert
    - **access_token**: user jwt
    - **on_conflict**: unique column used to find duplicates
    """

    return _rows(
        _request(
            table,
            "POST",
            access_token,
            [("on_conflict", on_conflict)],
            rows,
            "resolution=merge-duplicates,return=representation",
        )
    )


def update_rows(
    table: str,
    values: dict[str, Any],
    query_params: list[tuple[str, str]],
    access_token: str,
) -> list[dict[str, Any]]:
    """
    update rows in supabase table using supabase rest api

    - **table**: table name
    - **values**: column values to update
    - **query_params**: tuples representing query parameters for the request
    - **access_token**: user jwt
    """

    if not query_params:
        raise ValueError("update filters are required")

    return _rows(
        _request(
            table,
            "PATCH",
            access_token,
            query_params,
            values,
            "return=representation",
        )
    )


def delete_rows(
    table: str,
    query_params: list[tuple[str, str]],
    access_token: str,
) -> list[dict[str, Any]]:
    """
    delete rows from supabase table using supabase rest api

    - **table**: table name
    - **query_params**: tuples representing query parameters for the request
    - **access_token**: user jwt
    """

    if not query_params:
        raise ValueError("delete filters are required")

    return _rows(
        _request(
            table,
            "DELETE",
            access_token,
            query_params,
            prefer="return=representation",
        )
    )
