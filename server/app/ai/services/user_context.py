import asyncio
from datetime import date, timedelta

from app.ai.services.context_formatting import compact_training
from app.ai.workflows.chat.state import ChatRoute, WorkflowContext
from app.db.supabase.calendar import get_calendar
from app.db.supabase._queries import date_range
from app.db.supabase.onboarding_responses import get_onboarding_response


async def load_profile_context(context: WorkflowContext) -> dict:
    """ load onboarding answers for chat. the onboarding field is null before the first save

    - **context**: user id and access token
    - **returns**: onboarding context; missing answers are null """
    onboarding = await asyncio.to_thread(get_onboarding_response, context.user_id, context.access_token)
    return {"onboarding": onboarding.answers if onboarding else None}


async def load_training_context(context: WorkflowContext, start: date, end: date) -> dict:
    """ load current workouts and sports with five days of context on each side of the requested
    range

    - **context**: user id and access token
    - **start**: first requested date
    - **end**: last requested date
    - **returns**: calendar data and its coverage range, padded by five days on each side """
    date_range(start, end)
    start, end = start - timedelta(days=5), end + timedelta(days=5)
    calendar = await asyncio.to_thread(get_calendar, context.user_id, start, end, None)
    return {"range": {"start": str(start), "end": str(end)},
        "coverage": "current app workouts and non-cancelled sports sessions in this range; not lifetime history",
        "training": compact_training(calendar.model_dump(mode="json", exclude_none=True))}


async def load_user_context(context: WorkflowContext, route: ChatRoute, today: date) -> dict:
    """ include the user's local date and the context selected by the router. training requests
    also load the profile

    - **context**: user id and access token
    - **route**: none, profile or training; training includes profile context
    - **today**: user's local date, used when the route has no dates
    - **returns**: dict containing the local date and selected context """
    data = {"local_today": str(today)}
    if route.user_context == "profile":
        data.update(await load_profile_context(context))
    elif route.user_context == "training":
        start = route.start_date or route.end_date or today
        end = route.end_date or start
        profile, training = await asyncio.gather(
            load_profile_context(context), load_training_context(context, start, end))
        data.update(profile)
        data.update(training)

    return data
