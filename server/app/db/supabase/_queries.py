# shared query validation and pagination

from datetime import date
from collections.abc import Callable
from typing import TypeVar
from uuid import UUID

from app.db.supabase.transport import SupabaseDataError, call_rpc, select_rows


T = TypeVar("T")


def read_with_revision(user_id: str | UUID, access_token: str | None, read: Callable[[], T]) -> tuple[T, int | None]:
    """
    bracket a frontend data read with planning revision checks

    prevents returning stale data labelled with a newer revision. this is an
    optimistic check, not a transaction snapshot; mutations must still supply
    the returned revision. no configured schedule is represented by none.

    - **user_id**: authenticated owner
    - **access_token**: user jwt or none for backend reads
    - **read**: zero-argument read operation, never a write
    - **returns**: data and matching revision; raises a 409 if revision changed
    """

    filters = [("select", "revision"), ("user_id", f"eq.{identifier(user_id)}"), ("limit", "1")]
    before = select_rows("planning_schedules", filters, access_token)
    result = read()
    after = select_rows("planning_schedules", filters, access_token)
    if before != after:
        raise SupabaseDataError("planning inputs changed during read", status_code=409)
    return result, before[0]["revision"] if before else None


def rpc_row(name: str, payload: dict) -> dict:
    """
    unwrap the single-row array returned by a table-valued backend rpc

    internal adapter for functions returning a table/composite row, whose http
    response is a one-element array. always uses service-role credentials. do not
    use for json receipts, scalars, or claim_replan_job's nullable json result.
    raises supabasedataerror on wrong cardinality/shape before contract validation.

    - **name**: name of the table-valued postgres function
    - **payload**: named function arguments encoded as json-compatible values
    - **returns**: the single result row; raises if the rpc returns any other shape
    """

    rows = call_rpc(name, payload, None)
    if not isinstance(rows, list) or len(rows) != 1 or not isinstance(rows[0], dict):
        raise SupabaseDataError("rpc did not return exactly one row")
    return rows[0]


def identifier(value: str | UUID) -> str:
    """
    normalize a uuid before placing it in a query filter

    validates and canonicalizes before interpolating an id into postgrest filters;
    this prevents raw caller text from becoming filter syntax. accepts a uuid object
    or string and raises valueerror if invalid. this is format validation, not proof
    of ownership or existence.

    - **value**: uuid value to validate and normalize
    - **returns**: normalized uuid string; raises for an invalid uuid
    """

    return str(UUID(str(value)))


def date_range(start: date, end: date) -> None:
    """
    reject reversed or excessive calendar ranges

    shared calendar range guard. equal endpoints are valid; the difference between
    end and start may be at most 366 days, meaning up to 367 inclusive dates.
    does not validate local today, planning coverage, or timezone; those are separate
    application/rpc concerns. raises valueerror before a range query is sent.

    - **start**: inclusive first date
    - **end**: inclusive last date
    - **returns**: none; raises for reversed ranges or spans exceeding 366 days
    """

    if not 0 <= (end - start).days <= 366:
        raise ValueError("date range must be ordered and no longer than 366 days")


def page_limit(limit: int) -> None:
    """
    bound a single history page

    shared bound for single-page history/status handlers, not worker batch sizes
    or the internal all_rows page size. raises valueerror for out-of-range limits;
    the server may still return fewer rows than requested.

    - **limit**: maximum records to return, from 1 to 100
    - **returns**: none; raises unless the limit is between 1 and 100
    """

    if not 1 <= limit <= 100:
        raise ValueError("limit must be between 1 and 100")


def all_rows(table: str, filters: list[tuple[str, str]], access_token: str | None) -> list[dict]:
    """
    read all matching rows without silently hitting the server row cap

    internal offset-pagination helper requesting 200 rows at a time until an empty
    page. does not stop on a short page because the server row cap may be smaller.
    the caller must include owner scoping and deterministic ordering with a unique
    tie-breaker, and must not supply its own limit/offset.

    collects the full result in memory with no total-row cap. concurrent inserts,
    deletes, or version switches can cause skips/duplicates across pages; use the
    worker's revision checks for planning, not this helper as a snapshot guarantee.

    - **table**: supabase table name
    - **filters**: ordered query filters with deterministic ordering for pagination
    - **access_token**: verified user jwt for rls; none uses backend service-role credentials
    - **returns**: all matching rows across server pages; concurrent writes can change results between pages
    """

    rows = []
    while True:
        page = select_rows(table, [*filters, ("limit", "200"), ("offset", str(len(rows)))], access_token)
        if not page:
            return rows
        rows.extend(page)
