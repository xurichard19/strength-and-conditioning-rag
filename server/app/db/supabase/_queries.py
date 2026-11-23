# shared query validation and pagination

from datetime import date
from collections.abc import Callable
from typing import TypeVar
from uuid import UUID

from app.db.supabase.transport import SupabaseDataError, call_rpc, select_rows


T = TypeVar("T")


def read_with_revision(user_id: str | UUID, access_token: str | None, read: Callable[[], T]) -> tuple[T, int | None]:
    """ return the read result and matching revision. a change during the read raises 409.
    writes still need the returned revision

    - **user_id**: authenticated owner
    - **access_token**: user jwt or none for backend reads
    - **read**: zero-argument read operation, never a write
    - **returns**: data and matching revision; raises a 409 if revision changed """

    filters = [("select", "revision"), ("user_id", f"eq.{identifier(user_id)}"), ("limit", "1")]
    before = select_rows("planning_schedules", filters, access_token)
    result = read()
    after = select_rows("planning_schedules", filters, access_token)
    if before != after:
        raise SupabaseDataError("planning inputs changed during read", status_code=409)
    return result, before[0]["revision"] if before else None


def rpc_row(name: str, payload: dict) -> dict:
    """ unwrap a service-role rpc that must return exactly one row. unexpected shapes raise
    SupabaseDataError

    - **name**: name of the table-valued postgres function
    - **payload**: named function arguments encoded as json-compatible values
    - **returns**: the single result row; raises if the rpc returns any other shape """

    rows = call_rpc(name, payload, None)
    if not isinstance(rows, list) or len(rows) != 1 or not isinstance(rows[0], dict):
        raise SupabaseDataError("rpc did not return exactly one row")
    return rows[0]


def identifier(value: str | UUID) -> str:
    """ validate a uuid before interpolating it into a database filter

    - **value**: uuid value to validate and normalize
    - **returns**: normalized uuid string; raises for an invalid uuid """

    return str(UUID(str(value)))


def date_range(start: date, end: date) -> None:
    """ validate inclusive dates up to 366 days apart. equal endpoints select one day

    - **start**: inclusive first date
    - **end**: inclusive last date
    - **returns**: none; raises for reversed ranges or spans exceeding 366 days """

    if not 0 <= (end - start).days <= 366:
        raise ValueError("date range must be ordered and no longer than 366 days")


def page_limit(limit: int) -> None:
    """ reject limits outside the supported bounds before requesting a history page

    - **limit**: maximum records to return, from 1 to 100
    - **returns**: none; raises unless the limit is between 1 and 100 """

    if not 1 <= limit <= 100:
        raise ValueError("limit must be between 1 and 100")


def all_rows(table: str, filters: list[tuple[str, str]], access_token: str | None, *, max_rows: int | None = None) -> list[dict]:
    """ page until empty or the requested maximum. callers supply owner filters and stable
    ordering with a unique tie-breaker. concurrent writes can shift offset-based pages

    - **table**: supabase table name
    - **filters**: ordered query filters with deterministic ordering for pagination
    - **access_token**: verified user jwt for rls; none uses backend service-role credentials
    - **max_rows**: known upper bound from the query, such as its unique requested ids
    - **returns**: all matching rows across server pages; concurrent writes can change results between
      pages """

    rows = []
    while max_rows is None or len(rows) < max_rows:
        page = select_rows(table, [*filters, ("limit", "200"), ("offset", str(len(rows)))], access_token)
        if not page:
            return rows
        rows.extend(page)
    return rows
