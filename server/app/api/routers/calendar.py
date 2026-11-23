from datetime import date

from fastapi import APIRouter, Depends

from app.api.errors import database_errors, private_response
from app.api.parameters import calendar_range
from app.auth.supabase import AuthUser
from app.auth.billing import require_paid_user
from app.api.schemas import CalendarResponse
from app.db.supabase import calendar


router = APIRouter(prefix="/calendar", tags=["calendar"], dependencies=[Depends(private_response)])


@router.get("", response_model=CalendarResponse)
def get_calendar(dates: tuple[date, date] = Depends(calendar_range), user: AuthUser = Depends(require_paid_user)) -> CalendarResponse:
    """ return workouts, sports and revision from one snapshot for inclusive local dates. a null
    revision means no schedule exists

    - **dates**: inclusive local start_date/end_date query parameters
    - **user**: verified owner and caller jwt
    - **returns**: separately ordered workout/sports lists and matching planning revision """

    with database_errors("calendar.get_calendar"):
        return CalendarResponse.model_validate(calendar.get_calendar_snapshot(user.id, *dates, None))
