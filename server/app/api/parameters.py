from datetime import date, datetime
from uuid import UUID

from fastapi import HTTPException


def calendar_range(start_date: date, end_date: date) -> tuple[date, date]:
    """
    validate inclusive local calendar dates before calling range handlers

    - **start_date**: first date requested by the client
    - **end_date**: inclusive last date; at most 31 dates per frontend preload
    - **returns**: ordered date pair; invalid windows produce http 422
    """

    if not 0 <= (end_date - start_date).days < 31:
        raise HTTPException(422, "calendar range must contain 1 to 31 days")
    return start_date, end_date


def message_cursor(
    before_created_at: datetime | None = None, before_id: UUID | None = None,
) -> tuple[datetime | None, UUID | None]:
    """
    validate the exclusive cursor for an older chat-history page

    - **before_created_at**: oldest returned message's timezone-aware timestamp
    - **before_id**: that same message's id; both cursor fields must be supplied together
    - **returns**: timestamp/id pair, or a pair of none values for the newest page
    """

    if (before_created_at is None) != (before_id is None):
        raise HTTPException(422, "message cursor requires timestamp and id")
    if before_created_at is not None and before_created_at.utcoffset() is None:
        raise HTTPException(422, "message cursor must include a timezone")
    return before_created_at, before_id
