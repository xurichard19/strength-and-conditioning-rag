# combined calendar and worker context reads

from datetime import date, timedelta
from uuid import UUID

from app.contracts import CalendarRecords, CalendarSnapshot, ClaimedReplanJob, ReplanContext
from app.db.supabase._queries import identifier
from app.db.supabase.onboarding_responses import get_onboarding_response
from app.db.supabase.planning_schedules import get_planning_schedule
from app.db.supabase.profiles import get_profile
from app.db.supabase.sports_workouts import get_sports_workouts_in_range
from app.db.supabase.transport import SupabaseDataError, call_rpc
from app.db.supabase.workouts import get_recent_workouts, get_workouts_in_range


def get_calendar(user_id: str | UUID, start_date: date, end_date: date, access_token: str | None) -> CalendarRecords:
    """ load current workouts and non-cancelled sports for inclusive local dates. these lists
    paginate independently. use get_replan_context when a worker needs revision checks

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **start_date**: first calendar date to include
    - **end_date**: last calendar date to include
    - **access_token**: verified user jwt for rls; none uses backend service-role credentials
    - **returns**: current workouts and non-cancelled sports commitments for the same date range """

    return CalendarRecords(
        workouts=get_workouts_in_range(user_id, start_date, end_date, access_token),
        sports_workouts=get_sports_workouts_in_range(user_id, start_date, end_date, access_token),
    )


def get_calendar_snapshot(user_id: str | UUID, start_date: date, end_date: date, access_token: str | None) -> CalendarSnapshot:
    """ read workouts, sports and revision in one snapshot for up to 31 inclusive local dates

    - **user_id**: authenticated owner
    - **start_date**: inclusive first local date
    - **end_date**: inclusive last local date, at most 30 days after start_date
    - **access_token**: caller jwt, or none for backend access
    - **returns**: current workouts, sports, and revision for later guarded writes """

    if not 0 <= (end_date - start_date).days < 31:
        raise ValueError("calendar range must contain 1 to 31 days")
    return CalendarSnapshot.model_validate(call_rpc("get_calendar_snapshot", {
        "p_user_id": identifier(user_id), "p_start_date": start_date.isoformat(), "p_end_date": end_date.isoformat(),
    }, access_token))


def get_replan_context(claim: ClaimedReplanJob, history_days: int = 30) -> ReplanContext:
    """ load history and calendar data under the claim revision. a missing profile raises 404
    and stale planning inputs raise 409. only the claimed dates may be edited, even when the
    context includes neighboring days

    - **claim**: claimed job with its expected revision, edit window, and horizon end
    - **history_days**: number of prior calendar days to load, from 1 to 366
    - **returns**: profile, onboarding, history, calendar, and schedule; raises on revision conflicts """

    user_id = claim.job.user_id
    today = claim.job.claimed_on
    if today is None:
        raise ValueError("planning context requires a frozen claim date")

    schedule = get_planning_schedule(user_id, None)
    if schedule is None or schedule.revision != claim.job.expected_revision:
        raise SupabaseDataError("planning inputs changed; reload the job", status_code=409)
    profile = get_profile(user_id, None)
    if profile is None:
        raise SupabaseDataError("profile not found", status_code=404)

    context = ReplanContext(
        schedule=schedule,
        profile=profile,
        onboarding=get_onboarding_response(user_id, None),
        recent_workouts=get_recent_workouts(user_id, today - timedelta(days=1), None, history_days),
        calendar=CalendarRecords(
            workouts=get_workouts_in_range(user_id, today, claim.horizon_end, None),
            sports_workouts=get_sports_workouts_in_range(user_id,
                today - timedelta(days=3), claim.horizon_end + timedelta(days=3), None),
        ),
    )

    current = get_planning_schedule(user_id, None)
    if current is None or current.revision != schedule.revision:
        raise SupabaseDataError("planning inputs changed during context read", status_code=409)
    return context
