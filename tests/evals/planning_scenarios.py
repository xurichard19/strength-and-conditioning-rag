"""Synthetic, deterministic planning inputs; importing this module performs no I/O."""

from datetime import date, datetime, time, timedelta, timezone
from uuid import NAMESPACE_URL, UUID, uuid5

from app.contracts import (
    CalendarRecords, ClaimedReplanJob, OnboardingResponseRecord, PlanningScheduleRecord,
    ProfileRecord, ReplanContext, ReplanJobRecord, SportsWorkoutRecord, WorkoutRecord,
)


DAY = date(2026, 11, 2)  # Monday; dates never depend on the evaluation machine's clock.
END = DAY + timedelta(days=20)
OWNER = UUID("00000000-0000-0000-0000-000000000001")
NOW = datetime.combine(DAY, time(12), timezone.utc)
LOWER = (("Barbell back squat", 60), ("Romanian deadlift", 50), ("Standing calf raise", 20))
UPPER = (("Barbell bench press", 40), ("Seated cable row", 35), ("Dumbbell overhead press", 12))
FULL_BODY = (("Goblet squat", 20), ("Dumbbell bench press", 16), ("One-arm dumbbell row", 18))

SCENARIO_EXPECTATIONS = {
    "beginner_dumbbells": "Two 30-minute full-body sessions weekly on Mon/Thu; dumbbells only; conservative effort, feasible time, clear purpose-based names.",
    "intermediate_boxing": "Three strength sessions weekly on Mon/Wed/Fri, coordinated with hard Tuesday boxing; coherent full-body emphasis and justified fatigue management.",
    "experienced_upper_lower": "Four 60-minute hypertrophy sessions on Mon/Tue/Thu/Fri, honoring the explicit upper/lower split and descriptive names without random exercise churn.",
    "hard_sport_move": "Move the conflicting Wednesday lower-body session to the unused Saturday when recovery permits; explain the scheduling choice and preserve completed Monday work.",
    "hard_sport_no_alternative": "Do not invent availability: only Wednesday is available. Reduce or omit the conflicting lower session with a clear rationale; no out-of-window edits.",
    "easy_sport_preserve": "A 20-minute easy cycle should not trigger a wholesale rewrite or unnecessary movement of the sensible Wednesday strength session.",
    "weekly_extension_high_rpe": "Append only Nov 16–22, preserve existing workouts and familiar lifts; repeated RPE 9.5 with missed reps does not justify automatic load/volume escalation.",
    "horizon_boundary": "Hard sport on Nov 22 must not move strength past the Nov 22 horizon or alter completed Nov 20 work; choose a feasible reduced/omitted session with rationale.",
}


def _id(value: str) -> UUID:
    return uuid5(NAMESPACE_URL, f"arcel-synthetic-planning/{value}")


def _answers(days, *, minutes=60, venue="gym", experience="intermediate", notes=(), sport="Running"):
    return {
        "onboardingVersion": 2, "sport": sport, "sportGoal": "Stay strong and perform well recreationally",
        "balance": "lifting", "venue": venue, "lifts14": {"new": 0, "intermediate": 4, "experienced": 6}[experience],
        "notes": list(notes), "goal": "Mostly strength", "experienceLevel": experience,
        "trainingDays": days, "daysPerWeek": len(days), "sessionMinutes": minutes,
        "equipment": "Dumbbells" if venue == "dumbbells" else "Full gym", "cardio": "Sports",
    }


def _workout(offset, name, lifts=LOWER, *, completed=False, high_rpe=False):
    day = DAY + timedelta(days=offset)
    stamp = datetime.combine(day, time(11), timezone.utc)
    created, updated = NOW - timedelta(days=21), stamp if completed else NOW
    workout_id = _id(f"workout/{day}/{name}")
    exercises = []
    for index, (lift, weight) in enumerate(lifts):
        exercise_id = _id(f"{workout_id}/{index}")
        sets = [{"id": _id(f"{exercise_id}/{number}"), "exercise_id": exercise_id,
            "order_index": number, "planned_reps": 8, "planned_weight": weight,
            "planned_rpe": 7, "planned_rest_seconds": 120,
            "actual_reps": 6 if high_rpe else 8 if completed else None,
            "actual_weight": weight if completed else None,
            "actual_rpe": 9.5 if high_rpe else 7 if completed else None,
            "result_status": "completed" if completed else "pending",
            "completed_at": stamp if completed else None, "created_at": created, "updated_at": updated}
            for number in range(3)]
        exercises.append({"id": exercise_id, "workout_id": workout_id, "order_index": index,
            "name": lift, "weight_unit": "kg", "sets": sets, "created_at": created, "updated_at": updated})
    return WorkoutRecord(id=workout_id, user_id=OWNER, created_by_change_id=_id("baseline"),
        scheduled_date=day, name=name, status="completed" if completed else "planned",
        notes="5-minute warm-up; use familiar technique and do not train to failure.", exercises=exercises,
        started_at=stamp - timedelta(minutes=45) if completed else None,
        completed_at=stamp if completed else None, created_at=created, updated_at=updated)


def _sport(offset, *, easy=False, boxing=False):
    day = DAY + timedelta(days=offset)
    return SportsWorkoutRecord(id=_id(f"sport/{day}/{easy}/{boxing}"), user_id=OWNER,
        sport="Cycling" if easy else "Boxing" if boxing else "Running", scheduled_date=day,
        start_time=time(18), planned_duration_minutes=20 if easy else 75,
        intensity="easy" if easy else "hard",
        notes="Easy conversational recovery spin, no intervals." if easy else
            "Hard boxing class with demanding sparring rounds." if boxing else
            "Priority hill-interval running session, demanding lower-body effort; keep this event fixed.",
        created_at=NOW, updated_at=NOW)


def _inputs(name, answers, *, focus=None, workouts=(), sports=(), recent=(), extension=False, claimed_on=DAY):
    adjustment = focus is not None
    start = max(claimed_on, focus - timedelta(days=3)) if adjustment else DAY + timedelta(days=14) if extension else DAY
    through = min(END, focus + timedelta(days=3)) if adjustment else END
    stamp = datetime.combine(claimed_on, time(12), timezone.utc)
    job = ReplanJobRecord(id=_id(name), user_id=OWNER, kind="adjustment" if adjustment else "refresh",
        status="running", reason="sports workout added" if adjustment else "weekly refresh" if extension else "onboarding completed",
        deduplication_key=f"synthetic/{name}", effective_from=start if adjustment else None,
        effective_through=through if adjustment else None, available_at=stamp, expected_revision=3,
        lease_token=_id(f"lease/{name}"), claimed_on=claimed_on, created_at=stamp, updated_at=stamp)
    claim = ClaimedReplanJob(job=job, effective_from=start, effective_through=through, horizon_end=END)
    context = ReplanContext(
        schedule=PlanningScheduleRecord(user_id=OWNER, horizon_end=END if adjustment else DAY + timedelta(days=13) if extension else None,
            next_refresh_at=stamp + timedelta(days=7), revision=3, created_at=NOW, updated_at=stamp),
        profile=ProfileRecord(id=OWNER, timezone="America/New_York", created_at=NOW, updated_at=stamp),
        onboarding=OnboardingResponseRecord(user_id=OWNER, answers=answers, completed_at=NOW, created_at=NOW, updated_at=NOW),
        recent_workouts=list(recent), calendar=CalendarRecords(workouts=list(workouts), sports_workouts=list(sports)))
    return claim, context


def scenarios() -> dict[str, tuple[ClaimedReplanJob, ReplanContext]]:
    """Build fresh fixtures for initial plans, bounded sport adjustments and an extension."""
    result = {}
    result["beginner_dumbbells"] = _inputs("beginner_dumbbells", _answers(["Mon", "Thu"],
        minutes=30, venue="dumbbells", experience="new", notes=[
            "New to resistance training. Two strength sessions per week; only a pair of adjustable dumbbells, floor space and a sturdy chair.",
            "Prefer simple full-body sessions. No injuries; 30 minutes includes warming up."]))
    result["intermediate_boxing"] = _inputs("intermediate_boxing", _answers(["Mon", "Wed", "Fri"],
        sport="Boxing", notes=["Two years of consistent lifting; comfortable with basic barbell lifts.",
            "Three strength sessions weekly, plus Tuesday boxing. Boxing quality matters; coordinate lifting fatigue around it."]),
        sports=[_sport(offset, boxing=True) for offset in (1, 8, 15)])
    result["experienced_upper_lower"] = _inputs("experienced_upper_lower", _answers(["Mon", "Tue", "Thu", "Fri"],
        experience="experienced", notes=["Four years of lifting; four lifting sessions weekly for muscle growth.",
            "Explicit preference: an upper/lower split. Keep familiar compound lifts and use clear names describing each session's focus."]))

    lower = _workout(2, "Lower-body strength: squat and hinge")
    protected = _workout(0, "Upper-body strength: push and pull", UPPER, completed=True)
    for name, days, easy in (("hard_sport_move", ["Wed", "Sat"], False),
            ("hard_sport_no_alternative", ["Wed"], False), ("easy_sport_preserve", ["Wed", "Sat"], True)):
        result[name] = _inputs(name, _answers(days, notes=[
            "Experienced with the listed exercises. The existing sessions are familiar, manageable and intentionally programmed.",
            "Monday's upper session is already completed. Only the selected weekdays are available for remaining strength work.",
            "One lower-body strength session remains this week; Saturday is available as an alternative, not a request for extra sessions."
                if len(days) > 1 else "Wednesday is the only available remaining day. Do not invent another training day."]),
            focus=DAY + timedelta(days=2), workouts=[protected, lower], sports=[_sport(2, easy=easy)])

    baseline = [_workout(offset, "Full body: squat and push" if index % 2 == 0 else "Full body: hinge and pull",
        FULL_BODY if index % 2 == 0 else (("Romanian deadlift", 50), ("Dumbbell overhead press", 12), ("Seated cable row", 35)))
        for index, offset in enumerate((0, 2, 4, 7, 9, 11))]
    recent = [_workout(offset, "Full body: squat and push", FULL_BODY, completed=True, high_rpe=True) for offset in (-7, -5, -3)]
    result["weekly_extension_high_rpe"] = _inputs("weekly_extension_high_rpe", _answers(["Mon", "Wed", "Fri"],
        notes=["Three lifting sessions weekly; consistent with these exercises for two years.",
            "Recent sets repeatedly felt harder than intended and missed the planned reps. No injury or illness reported."]),
        workouts=baseline, recent=recent, extension=True)

    result["horizon_boundary"] = _inputs("horizon_boundary", _answers(["Fri", "Sun"], notes=[
        "One final lower-body session is planned on Sunday; Friday's upper session is already completed.",
        "Only Friday and Sunday are available. Preserve logged results and the current plan horizon."]),
        focus=END, claimed_on=DAY + timedelta(days=18), workouts=[
            _workout(18, "Upper-body strength: push and pull", UPPER, completed=True),
            _workout(20, "Lower-body strength: squat and hinge")], sports=[_sport(20)])
    return result
