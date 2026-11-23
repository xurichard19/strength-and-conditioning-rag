# generic supabase rest requests and error handling

import json
import re
import httpx
from typing import Any
from urllib.parse import urlencode

from app.config import get_database_settings
from app.http import get_http_client


class SupabaseDataError(Exception):
    """ database or transport failure. status_code and code are optional. a write may have
    committed even when its response failed """

    def __init__(
        self,
        message: str,
        status_code: int | None = None,
        code: str | None = None,
    ) -> None:
        """ - **message**: human-readable description of the database failure
        - **status_code**: upstream http status, if available
        - **code**: database error code, if supplied
        - **returns**: none. stores the upstream status and database code when available """
        super().__init__(message)
        self.status_code = status_code
        self.code = code


settings = get_database_settings()


def _request(
    path: str,
    method: str,
    access_token: str | None,
    query_params: list[tuple[str, str]] | None = None,
    body: dict[str, Any] | list[dict[str, Any]] | None = None,
    prefer: str | None = None,
    rpc: bool = False,
) -> Any:
    """ make one synchronous database request. a missing user token selects backend credentials,
    so callers must authorize the owner. a transport or decoding failure leaves write
    completion uncertain """

    if not re.fullmatch(r"[a-z_][a-z0-9_]*", path):
        raise ValueError("invalid supabase resource name")

    api_key = settings.supabase_publishable_key
    if access_token is None:
        if settings.supabase_secret_key is None:
            raise SupabaseDataError("supabase secret key is not configured")
        api_key = settings.supabase_secret_key.get_secret_value()

    # build request
    resource = f"rpc/{path}" if rpc else path
    url = f'{settings.supabase_url.rstrip("/")}/rest/v1/{resource}'
    if query_params:
        url = f"{url}?{urlencode(query_params, safe=',().')}"

    headers = {
        "apikey": api_key,
        "Accept": "application/json",
    }
    if access_token is not None:
        headers["Authorization"] = f"Bearer {access_token}"
    if body is not None:
        headers["Content-Type"] = "application/json"
    if prefer:
        headers["Prefer"] = prefer

    content = json.dumps(body).encode("utf-8") if body is not None else None

    try:
        with get_http_client().stream(method, url, content=content, headers=headers) as response:
            if response.is_success:
                content = response.read()
                return json.loads(content.decode("utf-8")) if content else None

            try:
                error = json.loads(response.read().decode("utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError, OSError, httpx.RequestError):
                error = {}
            if not isinstance(error, dict):
                error = {}

            code = error.get("code")
            raise SupabaseDataError(
                str(error.get("message", "supabase data api request failed")).lower(),
                response.status_code,
                code if isinstance(code, str) else None,
            )
    except (json.JSONDecodeError, UnicodeDecodeError, OSError, httpx.RequestError) as exc:
        raise SupabaseDataError("supabase data api is unavailable") from exc


def _rows(payload: Any) -> list[dict[str, Any]]:
    """ raise SupabaseDataError if the response is not a list of row objects """

    if not isinstance(payload, list) or any(not isinstance(row, dict) for row in payload):
        raise SupabaseDataError("supabase data api returned an unexpected response")
    return payload


def select_rows(
    table: str,
    query_params: list[tuple[str, str]],
    access_token: str | None,
) -> list[dict[str, Any]]:
    """ fetch one page of visible rows. callers supply owner filters, ordering and pagination

    - **table**: table name
    - **query_params**: tuples representing query parameters for the request
    - **access_token**: user jwt, or none for backend service-role reads
    - **returns**: matching row dictionaries, or an empty list """

    return _rows(_request(table, "GET", access_token, query_params))


def call_rpc(
    function_name: str,
    payload: dict[str, Any],
    access_token: str | None,
) -> Any:
    """ call a database function with json-compatible values. the raw result may be a row list,
    scalar or receipt

    - **function_name**: postgres function name
    - **payload**: named function arguments encoded as json-compatible values
    - **access_token**: verified user jwt for rls; none uses backend service-role credentials
    - **returns**: decoded rpc response; shape depends on the postgres return type """

    return _request(function_name, "POST", access_token, body=payload, rpc=True)


def insert_rows(
    table: str,
    rows: dict[str, Any] | list[dict[str, Any]],
    access_token: str | None,
) -> list[dict[str, Any]]:
    """ insert rows and return their stored values. a retry can duplicate rows without a unique
    key

    - **table**: supabase table name
    - **rows**: json-compatible row or rows to save
    - **access_token**: verified user jwt for rls; none uses trusted backend credentials
    - **returns**: inserted row dictionaries including database defaults """

    return _rows(
        _request(table, "POST", access_token, body=rows, prefer="return=representation")
    )


def upsert_rows(
    table: str,
    rows: dict[str, Any] | list[dict[str, Any]],
    access_token: str,
    on_conflict: str,
) -> list[dict[str, Any]]:
    """ merge rows on a unique database key. supplied json columns are replaced in full and a
    late retry can overwrite a newer value

    - **table**: supabase table name
    - **rows**: json-compatible row or rows to save
    - **access_token**: verified user jwt used to enforce rls
    - **on_conflict**: comma-separated unique-key columns used to match existing rows
    - **returns**: inserted or updated row dictionaries """

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


def _has_row_filter(query_params: list[tuple[str, str]]) -> bool:
    """ require a predicate on the target table.
    modifiers and embedded filters alone are insufficient """

    modifiers = {"select", "order", "limit", "offset", "columns", "on_conflict"}
    return any(
        key in {"and", "or", "not.and", "not.or"} or ("." not in key and key not in modifiers)
        for key, _ in query_params
    )


def update_rows(
    table: str,
    values: dict[str, Any],
    query_params: list[tuple[str, str]],
    access_token: str,
) -> list[dict[str, Any]]:
    """ patch matching rows and return their saved values. callers must scope the owner and
    target. explicit null clears a column

    - **table**: supabase table name
    - **values**: column values to update in every matching row
    - **query_params**: query parameter tuples; mutations require a top-level row predicate
    - **access_token**: verified user jwt used to enforce rls
    - **returns**: updated row dictionaries, or an empty list if no rows match """

    if not _has_row_filter(query_params):
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
    """ delete matching rows and return their old values. callers must scope the owner and
    target. an empty list means no visible row matched

    - **table**: supabase table name
    - **query_params**: query parameter tuples; mutations require a top-level row predicate
    - **access_token**: verified user jwt used to enforce rls
    - **returns**: deleted row dictionaries, or an empty list if no rows match """

    if not _has_row_filter(query_params):
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
