from datetime import date

from fastapi import APIRouter, Depends

from app.api.errors import database_errors, private_response
from app.api.parameters import calendar_range
from app.auth.supabase import AuthUser, require_user
from app.api.schemas import CalendarResponse
from app.db.supabase import calendar


router = APIRouter(prefix="/calendar", tags=["calendar"], dependencies=[Depends(private_response)])


@router.get("", response_model=CalendarResponse)
def get_calendar(dates: tuple[date, date] = Depends(calendar_range), user: AuthUser = Depends(require_user)) -> CalendarResponse:
    """
    load current generated workouts and non-cancelled sports for the calendar

    use the returned revision for guarded mutations. none means planning has not
    been configured; it is not revision zero. retry the read on a 409 conflict.

    - **dates**: inclusive local start_date/end_date query parameters
    - **user**: verified owner and caller jwt
    - **returns**: separately ordered workout/sports lists and matching planning revision
    """

    with database_errors("calendar.get_calendar"):
        return CalendarResponse.model_validate(calendar.get_calendar_snapshot(user.id, *dates, user.access_token))
