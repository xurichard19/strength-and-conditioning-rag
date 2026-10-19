from collections import defaultdict
from itertools import chain, islice
from math import isfinite

from app.contracts import (
    ClaimedReplanJob, PlannedExercise, PlannedExerciseSet, PlannedWorkout, PlanningProposal,
    ReplanContext, WorkoutRecord,
)


SET_FIELDS = tuple(PlannedExerciseSet.model_fields)
EXERCISE_FIELDS = tuple(field for field in PlannedExercise.model_fields if field != "sets")
RESULT_FIELDS = ("actual_reps", "actual_weight", "actual_distance", "actual_duration_seconds",
    "actual_rpe", "result_notes", "completed_at")
MAX_PRESCRIPTION_ERRORS = 20


def workout_has_results(workout: WorkoutRecord) -> bool:
    """protect the same workout timestamps, statuses and set results as publication"""
    return (workout.status != "planned" or any((workout.started_at, workout.completed_at, workout.skipped_at))
        or any(item.result_status != "pending" or any(getattr(item, field) is not None for field in RESULT_FIELDS)
            for exercise in workout.exercises for item in exercise.sets))


def _workout_key(workout: PlannedWorkout | WorkoutRecord) -> tuple:
    """compare ordered prescriptions, ignoring database ids and result metadata"""
    stored = isinstance(workout, WorkoutRecord)
    exercises = sorted(workout.exercises, key=lambda item: item.order_index) if stored else workout.exercises
    return (workout.scheduled_date, workout.name, workout.notes, tuple(
        (*tuple(getattr(exercise, field) for field in EXERCISE_FIELDS), tuple(
            tuple(getattr(item, field) for field in SET_FIELDS) for item in
            (sorted(exercise.sets, key=lambda item: item.order_index) if stored else exercise.sets)))
        for exercise in exercises))


def _prescription_errors(workout: PlannedWorkout, path: str):
    """yield actionable, indexed issues without copying athlete text into feedback"""
    if not workout.name.strip():
        yield f"{path}.name: require a nonblank workout name"
    if not workout.exercises:
        yield f"{path}.exercises: require exercises; use a rest decision for rest"
    for index, exercise in enumerate(workout.exercises):
        exercise_path = f"{path}.exercises[{index}]"
        if not exercise.name.strip():
            yield f"{exercise_path}.name: require a nonblank exercise name"
        if not exercise.sets:
            yield f"{exercise_path}.sets: require at least one set"
        for target, unit in (("planned_weight", "weight_unit"), ("planned_distance", "distance_unit")):
            if any(getattr(item, target) is not None for item in exercise.sets) != (getattr(exercise, unit) is not None):
                yield f"{exercise_path}.{unit}: set a matching unit when {target} is present; otherwise use null"
        for index, item in enumerate(exercise.sets):
            set_path = f"{exercise_path}.sets[{index}]"
            if not any((item.planned_reps, item.planned_distance, item.planned_duration_seconds)):
                yield f"{set_path}: require repetitions, distance or duration"
            if exercise.reps_per_side and item.planned_reps is None:
                yield (f"{set_path}.planned_reps: repetitions per side require reps; "
                    "for timed holds use separate left/right exercises with reps_per_side=false")
            for field in ("planned_weight", "planned_distance", "planned_rpe"):
                value = getattr(item, field)
                if value is not None and not isfinite(value):
                    yield f"{set_path}.{field}: prescription targets must be finite"


def validate_proposal(claim: ClaimedReplanJob, context: ReplanContext, proposal: PlanningProposal) -> PlanningProposal:
    """
    validate fixed edit boundaries and complete coverage, preserving unchanged versions

    - **claim**: server-owned job revision and allowed dates
    - **context**: matching athlete inputs and current calendar
    - **proposal**: proposed removals, additions and one rest decision per editable date
    - **returns**: normalized proposal ready for atomic publication; raises valueerror on invalid changes
    """
    owner = claim.job.user_id
    workouts, sports = context.calendar.workouts, context.calendar.sports_workouts
    if (context.profile.id != owner or context.schedule.user_id != owner
            or context.onboarding is not None and context.onboarding.user_id != owner
            or any(item.user_id != owner for item in chain(workouts, sports, context.recent_workouts))):
        raise ValueError("planning context does not belong to the claimed athlete")
    if context.schedule.revision != claim.job.expected_revision:
        raise ValueError("planning context revision does not match the claim")
    if claim.effective_through > claim.horizon_end:
        raise ValueError("edit window exceeds the claimed horizon")
    if claim.job.claimed_on is not None and claim.effective_from < claim.job.claimed_on:
        raise ValueError("edit window must not precede the claimed local date")
    if claim.job.kind == "refresh":
        if proposal.before_ids:
            raise ValueError("refreshes must preserve all existing workouts")
        if context.schedule.horizon_end is not None:
            if claim.horizon_end < context.schedule.horizon_end:
                raise ValueError("refreshes must not shorten existing coverage")
            if claim.effective_from <= context.schedule.horizon_end:
                raise ValueError("refresh window must start after existing coverage")
    elif claim.horizon_end != context.schedule.horizon_end or claim.effective_from > claim.effective_through:
        raise ValueError("adjustments must preserve coverage and have an editable window")
    existing = {workout.id: workout for workout in workouts}
    if len(existing) != len(workouts) or any(workout.superseded_at is not None for workout in workouts):
        raise ValueError("planning calendar must contain unique current workouts")
    before = set(proposal.before_ids)
    if len(before) != len(proposal.before_ids):
        raise ValueError("replacement ids must be unique")
    replaceable = defaultdict(list)
    for workout_id in proposal.before_ids:
        workout = existing.get(workout_id)
        if (workout is None or not claim.effective_from <= workout.scheduled_date <= claim.effective_through
                or workout_has_results(workout)):
            raise ValueError("replacement ids must reference editable current workouts in the allowed window")
        replaceable[_workout_key(workout)].append(workout_id)
    for workout in proposal.workouts:
        if not claim.effective_from <= workout.scheduled_date <= claim.effective_through:
            raise ValueError("new workouts must stay within the allowed window")
    errors = list(islice(chain.from_iterable(_prescription_errors(workout, f"workouts[{index}]")
        for index, workout in enumerate(proposal.workouts)), MAX_PRESCRIPTION_ERRORS + 1))
    if errors:
        feedback = errors[:MAX_PRESCRIPTION_ERRORS]
        if len(errors) > MAX_PRESCRIPTION_ERRORS:
            feedback.append("additional prescription errors omitted; check all remaining exercises and sets")
        raise ValueError("\n".join(feedback))
    additions = []
    for workout in proposal.workouts:
        matching = replaceable.get(_workout_key(workout))
        if matching:
            before.remove(matching.pop())
        else:
            additions.append(workout)
    kept = [workout for workout in workouts if workout.id not in before]
    seen = {_workout_key(workout) for workout in kept}
    for workout in additions:
        key = _workout_key(workout)
        if key in seen:
            raise ValueError("new workouts must not duplicate another session on the same date")
        seen.add(key)
    decisions = {item.scheduled_date: item.rest for item in proposal.day_decisions}
    days = max(0, (claim.effective_through - claim.effective_from).days + 1)
    if (len(decisions) != len(proposal.day_decisions) or len(decisions) != days
            or any(not claim.effective_from <= day <= claim.effective_through for day in decisions)):
        raise ValueError("each date in the allowed window requires exactly one day decision")
    occupied = {workout.scheduled_date for workout in chain(kept, additions) if workout.exercises}
    occupied.update(item.scheduled_date for item in sports if item.status != "cancelled")
    if any(rest == (day in occupied) for day, rest in decisions.items()):
        raise ValueError("rest decisions must match the resulting workouts and sports sessions")
    return proposal.model_copy(update={"before_ids": [value for value in proposal.before_ids if value in before],
        "workouts": additions})
