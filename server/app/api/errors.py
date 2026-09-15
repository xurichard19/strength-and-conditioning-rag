from contextlib import contextmanager
import logging
import sentry_sdk

from fastapi import HTTPException, Response
from pydantic import ValidationError

from app.db.supabase import SupabaseDataError


logger = logging.getLogger(__name__)
PRIVATE_HEADERS = {"Cache-Control": "private, no-store"}


def private_response(response: Response) -> None:
    """disable caching of authenticated responses; response is the current http response"""

    response.headers.update(PRIVATE_HEADERS)


@contextmanager
def database_errors(operation: str = "database.operation"):
    """
    time a database action and translate handler failures into safe http responses

    wrap handler calls, not request validation. malformed database records are
    upstream failures, not invalid user requests. never retry writes here.

    - **operation**: stable action name for sentry; never include ids, filters, or payloads
    - **yields**: control to the route's database operation inside a child span
    - **raises**: http 401/403/404/409/422 for recognized failures, otherwise 502
    """

    try:
        with sentry_sdk.start_span(op="db", name=operation):
            yield
    except SupabaseDataError as exc:
        code = {"PT400": 422, "PT404": 404}.get(exc.code,
            exc.status_code if exc.status_code in (401, 403, 404, 409) else 502)
        detail = {401: "session expired", 403: "access denied", 404: "record not found",
            409: "data conflict; reload current state", 422: "invalid operation"}.get(code, "data service unavailable")
        headers = {**PRIVATE_HEADERS, **({"WWW-Authenticate": "Bearer"} if code == 401 else {})}
        logger.warning("database operation failed status=%s code=%s", exc.status_code, exc.code)
        raise HTTPException(code, detail, headers=headers) from exc
    except ValidationError as exc:
        logger.warning("database response failed contract validation")
        raise HTTPException(502, "invalid data service response", headers=PRIVATE_HEADERS) from exc
