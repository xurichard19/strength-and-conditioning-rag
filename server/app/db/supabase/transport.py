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
    """
    database/transport failure passed to the application without http translation

    - **message**: human-readable error; transport and local guard messages are lowercase
    - **status_code**: upstream http status, or none for local/network/decoding failures
    - **code**: postgres/postgrest error identifier when supplied, otherwise none

    callers decide the public response and retry policy. a missing status code
    does not prove a write failed to commit. keep the structured code for debugging
    and avoid exposing raw database diagnostics directly to a client.
    """

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
    access_token: str | None,
    query_params: list[tuple[str, str]] | None = None,
    body: dict[str, Any] | list[dict[str, Any]] | None = None,
    prefer: str | None = None,
    rpc: bool = False,
) -> Any:
    """
    send one supabase request without automatic write retries

    synchronous call with a 10-second urlopen timeout, not an overall multi-query
    handler deadline. use a worker thread when called from an async route. a user
    token uses the publishable api key; none selects the backend service-role jwt
    for both authorization and apikey. this does not authenticate the application
    caller or authorize a user id on their behalf.

    invalid resource names raise valueerror before network access. missing backend
    credentials, http failures, and supported network/decoding failures become
    supabasedataerror. request serialization errors are not wrapped. a timeout or
    unreadable response leaves write completion uncertain; only an operation's
    explicit idempotency contract can make a replay safe.

    - **path**: validated table or function name
    - **method**: http method for this operation
    - **access_token**: user jwt, or none for backend service-role credentials
    - **query_params**: optional query parameter tuples
    - **body**: json-compatible request payload, or none
    - **prefer**: optional postgrest preference header
    - **rpc**: true routes the request to a postgres function
    - **returns**: decoded json, or none for an empty response; failures raise structured errors
    """

    if not re.fullmatch(r"[a-z_][a-z0-9_]*", path):
        raise ValueError("invalid supabase resource name")

    api_key = settings.supabase_publishable_key
    if access_token is None:
        if settings.supabase_service_role_key is None:
            raise SupabaseDataError("supabase service role key is not configured")
        access_token = api_key = settings.supabase_service_role_key.get_secret_value()

    # build request
    resource = f"rpc/{path}" if rpc else path
    url = f'{settings.supabase_url.rstrip("/")}/rest/v1/{resource}'
    if query_params:
        url = f"{url}?{urlencode(query_params, safe=',().')}"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "apikey": api_key,
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
    """
    validate a table response before returning rows to a handler

    - **payload**: decoded supabase response
    - **returns**: row dictionaries; raises if the response is not a list of objects
    """

    if not isinstance(payload, list) or any(not isinstance(row, dict) for row in payload):
        raise SupabaseDataError("supabase data api returned an unexpected response")
    return payload


def select_rows(
    table: str,
    query_params: list[tuple[str, str]],
    access_token: str | None,
) -> list[dict[str, Any]]:
    """
    select rows from supabase table using supabase rest api

    low-level single request: the caller must supply owner filters, ordering,
    selection, and pagination. the server row cap still applies; this does not
    fetch all pages or convert dictionaries into contracts. application code
    should normally use a domain reader rather than construct these parameters.

    - **table**: table name
    - **query_params**: tuples representing query parameters for the request
    - **access_token**: user jwt, or none for backend service-role reads
    - **returns**: matching row dictionaries, or an empty list
    """

    return _rows(_request(table, "GET", access_token, query_params))


def call_rpc(
    function_name: str,
    payload: dict[str, Any],
    access_token: str | None,
) -> Any:
    """
    call a postgres function using supabase rest api

    rpc runs multi-step database work in one transaction, so related writes
    either all commit or all roll back; it does not cover external ai calls

    payload values must already be json-compatible; dates and uuids are converted
    by domain wrappers. this adapter neither unwraps table-valued result arrays
    nor validates receipts. the current planning rpcs require service-role access;
    use their domain wrappers to get credential selection and typed return values.

    - **function_name**: postgres function name
    - **payload**: named function arguments encoded as json-compatible values
    - **access_token**: verified user jwt for rls; none uses backend service-role credentials
    - **returns**: decoded rpc response; shape depends on the postgres return type
    """

    return _request(function_name, "POST", access_token, body=payload, rpc=True)


def insert_rows(
    table: str,
    rows: dict[str, Any] | list[dict[str, Any]],
    access_token: str,
) -> list[dict[str, Any]]:
    """
    insert rows into supabase table using supabase rest api

    requests return=representation so database-generated ids/defaults are included.
    this call is not a nested workout writer or an idempotent operation. callers
    must enforce an appropriate unique key if retries should not create duplicates.
    the input must be json-compatible; owner permissions are enforced by rls.

    - **table**: supabase table name
    - **rows**: json-compatible row or rows to save
    - **access_token**: verified user jwt used to enforce rls
    - **returns**: inserted row dictionaries including database defaults
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

    uses merge-duplicates on the supplied unique-key columns and returns saved
    rows. on_conflict must match a database unique constraint/index. this is not
    a deep merge of json columns: a supplied answers object replaces that column.
    omitted column handling follows postgrest defaults. replaying an older write
    can overwrite newer values even though a duplicate row is not created.

    - **table**: supabase table name
    - **rows**: json-compatible row or rows to save
    - **access_token**: verified user jwt used to enforce rls
    - **on_conflict**: comma-separated unique-key columns used to match existing rows
    - **returns**: inserted or updated row dictionaries
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


def _has_row_filter(query_params: list[tuple[str, str]]) -> bool:
    """
    require a top-level predicate rather than only modifiers or embedded filters

    - **query_params**: query parameter tuples for a mutation
    - **returns**: true if at least one parameter filters the target table
    """

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
    """
    update rows in supabase table using supabase rest api

    patches every visible row matching the predicates and returns the saved rows.
    rejects empty/modifier-only/embedded-only queries, but a broad valid predicate
    can still affect many rows. domain handlers must supply owner and target ids.
    explicit null clears a column; omitted keys are not patched. no concurrency
    revision or automatic retry is added by this primitive.

    - **table**: supabase table name
    - **values**: column values to update in every matching row
    - **query_params**: query parameter tuples; mutations require a top-level row predicate
    - **access_token**: verified user jwt used to enforce rls
    - **returns**: updated row dictionaries, or an empty list if no rows match
    """

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
    """
    delete rows from supabase table using supabase rest api

    deletes every visible row matching the predicates and returns removed rows.
    database cascades and restrictions still apply. the filter guard prevents
    modifier-only requests, not overly broad valid predicates; domain handlers
    must scope ownership and target ids. an empty result means nothing visible
    matched, including a repeated delete of an already-removed row.

    - **table**: supabase table name
    - **query_params**: query parameter tuples; mutations require a top-level row predicate
    - **access_token**: verified user jwt used to enforce rls
    - **returns**: deleted row dictionaries, or an empty list if no rows match
    """

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
