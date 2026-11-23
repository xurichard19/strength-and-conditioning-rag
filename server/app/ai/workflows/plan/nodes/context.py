import json
from datetime import timedelta
from itertools import chain

from langgraph.runtime import Runtime

from app.ai.services.context_formatting import compact_record
from app.ai.workflows.plan.state import MAX_CONTEXT_CHARS, PlanState, WorkflowContext
from app.services.planning import training_weekdays, workout_has_results


async def context_node(state: PlanState, runtime: Runtime[WorkflowContext]) -> dict:
    """ build model context from the verified owner and revision.
    expose only editable workout ids and exclude credentials and lease tokens

    - **state**: execution budgets; no user message is required
    - **runtime**: authoritative claim and athlete records, including protected sessions
    - **returns**: sanitized task and context with exact editable workout ids; credentials, lease values
      and profile identity never enter model messages """
    claim, data = runtime.context.claim, runtime.context.data
    if (data.profile.id != claim.job.user_id or data.schedule.user_id != claim.job.user_id
            or data.onboarding is not None and data.onboarding.user_id != claim.job.user_id
            or any(item.user_id != claim.job.user_id for item in
                chain(data.calendar.workouts, data.calendar.sports_workouts, data.recent_workouts))
            or data.schedule.revision != claim.job.expected_revision):
        raise ValueError("planning context does not match the claimed owner and revision")
    if claim.job.claimed_on is None:
        raise ValueError("planning requires a frozen local claim date")

    task = "adjustment" if claim.job.kind == "adjustment" else (
        "first_fill" if data.schedule.horizon_end is None else "extension")
    weekdays = training_weekdays(data)
    workout_dates = [claim.effective_from + timedelta(days=index)
        for index in range(max(0, (claim.effective_through - claim.effective_from).days + 1))]
    packet = json.dumps({
        "task": {"kind": task, "reason": claim.job.reason,
            "effective_from": str(claim.effective_from), "effective_through": str(claim.effective_through),
            "horizon_end": str(claim.horizon_end), "claimed_on": str(claim.job.claimed_on),
            "workout_dates": [str(day) for day in workout_dates if weekdays is None or day.weekday() in weekdays]},
        "timezone": data.profile.timezone,
        "onboarding": data.onboarding.answers if data.onboarding else None,
        "editable_workout_ids": [str(workout.id) for workout in data.calendar.workouts
            if claim.job.kind == "adjustment"
            and claim.effective_from <= workout.scheduled_date <= claim.effective_through
            and workout.superseded_at is None and not workout_has_results(workout)],
        "recent_workouts": [compact_record(workout) for workout in data.recent_workouts],
        "calendar": {"workouts": [compact_record(workout, keep_id=True) for workout in data.calendar.workouts],
            "sports_workouts": [compact_record(workout) for workout in data.calendar.sports_workouts]},
    }, ensure_ascii=False, separators=(",", ":"))

    if len(packet) > MAX_CONTEXT_CHARS:
        raise ValueError("planning context exceeds the bounded input size")
    return {"context_packet": packet}
