# shared query validation and pagination

from datetime import date
from uuid import UUID

from app.db.supabase.transport import SupabaseDataError, call_rpc, select_rows


def rpc_row(name: str, payload: dict) -> dict:
    """unwrap the single-row array returned by a table-valued backend rpc"""

    rows = call_rpc(name, payload, None)
    if not isinstance(rows, list) or len(rows) != 1 or not isinstance(rows[0], dict):
        raise SupabaseDataError("rpc did not return exactly one row")
    return rows[0]


def identifier(value: str | UUID) -> str:
    """normalize a uuid before placing it in a query filter"""

    return str(UUID(str(value)))


def date_range(start: date, end: date) -> None:
    """reject reversed or excessive calendar ranges"""

    if not 0 <= (end - start).days <= 366:
        raise ValueError("date range must be ordered and no longer than 366 days")


def page_limit(limit: int) -> None:
    """bound a single history page"""

    if not 1 <= limit <= 100:
        raise ValueError("limit must be between 1 and 100")


def all_rows(table: str, filters: list[tuple[str, str]], access_token: str | None) -> list[dict]:
    """read all matching rows without silently hitting the server row cap"""

    rows = []
    while True:
        page = select_rows(table, [*filters, ("limit", "200"), ("offset", str(len(rows)))], access_token)
        if not page:
            return rows
        rows.extend(page)
