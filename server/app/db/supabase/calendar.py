# combined calendar and worker context reads

from datetime import date, timedelta
from uuid import UUID

from app.contracts import CalendarRecords, ClaimedReplanJob, ReplanContext
from app.db.supabase.onboarding_responses import get_onboarding_response
from app.db.supabase.planning_schedules import get_planning_schedule
from app.db.supabase.profiles import get_profile
from app.db.supabase.sports_workouts import get_sports_workouts_in_range
from app.db.supabase.transport import SupabaseDataError
from app.db.supabase.workouts import get_recent_workouts, get_workouts_in_range


def get_calendar(user_id: str | UUID, start_date: date, end_date: date, access_token: str | None) -> CalendarRecords:
    """
    read current app workouts and sports commitments for the same calendar range

    combines two separately ordered lists: current app workouts (all statuses) and
    non-cancelled sports commitments. dates are inclusive user-calendar dates; the
    caller owns timezone selection and merging the lists for display. does not
    synthesize rest-day entries.

    the component reads paginate independently and are not a transaction snapshot.
    use this for display; a worker needing a revision check should call
    get_replan_context instead.

    - **user_id**: authenticated owner's user id; backend callers must authorize this user
    - **start_date**: first calendar date to include
    - **end_date**: last calendar date to include
    - **access_token**: verified user jwt for rls; none uses backend service-role credentials
    - **returns**: current workouts and non-cancelled sports commitments for the same date range
    """

    return CalendarRecords(
        workouts=get_workouts_in_range(user_id, start_date, end_date, access_token),
        sports_workouts=get_sports_workouts_in_range(user_id, start_date, end_date, access_token),
    )


def get_replan_context(claim: ClaimedReplanJob, history_days: int = 30) -> ReplanContext:
    """
    load worker context through the horizon and reject input changes during the reads

    backend-only context loader after claim_replan_job. verifies the schedule
    matches claim.job.expected_revision, loads profile/onboarding, history ending
    the day before effective_from, and the calendar through horizon_end, then checks
    revision again. the broader calendar gives context beyond a short adjustment;
    it does not authorize editing beyond claim.effective_through.

    missing onboarding is allowed; missing profile raises a 404. missing/stale
    schedule or a revision change during reads raises a 409. discard that context
    and release/reclaim the job before regenerating. this is an optimistic consistency
    check, not a database snapshot or a lease renewal. inputs may change afterward;
    complete_replan_job performs the final lease/revision check.

    - **claim**: claimed job with its expected revision, edit window, and horizon end
    - **history_days**: number of prior calendar days to load, from 1 to 366
    - **returns**: profile, onboarding, history, calendar, and schedule; raises on revision conflicts
    """

    user_id = claim.job.user_id
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
        recent_workouts=get_recent_workouts(user_id, claim.effective_from - timedelta(days=1), None, history_days),
        calendar=get_calendar(user_id, claim.effective_from, claim.horizon_end, None),
    )
    current = get_planning_schedule(user_id, None)
    if current is None or current.revision != schedule.revision:
        raise SupabaseDataError("planning inputs changed during context read", status_code=409)
    return context
