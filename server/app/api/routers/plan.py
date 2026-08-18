import asyncio
import json
import logging
from datetime import date
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.ai.workflows.plan.state import WorkflowContext
from app.api.schemas import PlanRequest, PlanResponse, SavePlanRequest, SavePlanResponse
from app.auth.supabase import AuthUser, require_user
from app.contracts import (
    PlannedExercise,
    PlannedExerciseSet,
    PlannedWorkout,
    PlannedWorkoutPlan,
)
from app.db.supabase import SupabaseDataError, insert_rows, select_rows


router = APIRouter(prefix='/plan')
logger = logging.getLogger(__name__)

PLAN_PROFILE_COLUMNS = (
    "primary_goal,experience_level,training_days_per_week,"
    "session_duration_minutes,equipment_access"
)


@router.get('', include_in_schema=False)
@router.get('/')
def list_saved_workout_plan(
    user: AuthUser = Depends(require_user),
) -> PlanResponse:
    try:
        rows = select_rows(
            "exercises",
            [
                ("select", "workout_id,scheduled_date,order_index,name,sets,reps,notes"),
                ("order", "scheduled_date.asc,order_index.asc"),
            ],
            user.access_token,
        )
    except SupabaseDataError as exc:
        logger.exception("plan load failed user_id=%s", user.id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Plan load failed",
        ) from exc

    exercises_by_workout: dict[str, list[PlannedExercise]] = {}
    dates_by_workout: dict[str, date] = {}
    for row in rows:
        workout_id = row.get("workout_id")
        if not isinstance(workout_id, str) or not workout_id:
            continue

        scheduled_date = date.fromisoformat(str(row["scheduled_date"]))
        dates_by_workout.setdefault(workout_id, scheduled_date)
        set_count = row.get("sets")
        repetitions = row.get("reps")
        parsed_reps = (
            int(repetitions)
            if isinstance(repetitions, (int, str)) and str(repetitions).isdigit()
            else None
        )
        exercises_by_workout.setdefault(workout_id, []).append(
            PlannedExercise(
                name=row["name"],
                sets=[
                    PlannedExerciseSet(reps=parsed_reps)
                    for _ in range(set_count if isinstance(set_count, int) and set_count > 0 else 0)
                ],
                notes=row.get("notes"),
            )
        )

    return PlanResponse(
        plan=PlannedWorkoutPlan(
            workouts=[
                PlannedWorkout(
                    name="Workout",
                    scheduled_date=dates_by_workout[workout_id],
                    exercises=exercises,
                )
                for workout_id, exercises in exercises_by_workout.items()
                if exercises
            ]
        )
    )


@router.post('/generate')
async def generate_workout_plan(
    query: PlanRequest,
    request: Request,
    user: AuthUser = Depends(require_user),
) -> PlanResponse:
    logger.info("authenticated plan requested user_id=%s", user.id)

    try:
        # get string ver. of user profile
        profile = await asyncio.to_thread(
            select_rows,
            "profiles",
            [
                ("select", PLAN_PROFILE_COLUMNS),
                ("id", f"eq.{user.id}"),
                ("limit", "1"),
            ],
            user.access_token,
        )
    except SupabaseDataError as exc:
        logger.exception("profile load failed user_id=%s", user.id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Profile load failed",
        ) from exc

    if not profile:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Profile could not be loaded",
        )

    try:
        plan_prompt = json.dumps({"start_date": date.today().isoformat(), "plan_requirements": query.model_dump(exclude_none=True), "user_profile": profile[0]}, default=str)
        result = await request.app.state.plan_graph.ainvoke(
            {"messages": [{"role": "user", "content": plan_prompt}]},
            context=WorkflowContext(
                user_id=user.id,
                access_token=user.access_token,
                conversation_id=str(uuid4()),
            ),
        )
        plan = result.get("answer")
        if not isinstance(plan, PlannedWorkoutPlan):
            raise ValueError("plan generation failed to return a valid workout plan")
        # this gets server date, careful to use helper function in frontend in the future for user date
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.exception("plan generation failed user_id=%s", user.id)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Plan generation service is temporarily unavailable",
        ) from exc

    logger.info("authenticated plan completed user_id=%s", user.id)
    return PlanResponse(plan=plan)


@router.post('', include_in_schema=False)
@router.post('/')
def save_workout_plan(
    payload: SavePlanRequest,
    user: AuthUser = Depends(require_user),
) -> SavePlanResponse:
    plan = payload.plan
    try:
        for workout in plan.workouts:
            w_id = str(uuid4())

            insert_rows(
                "workouts",
                {
                    "id": w_id,
                    "user_id": user.id,
                    "status": "scheduled",
                    "title": workout.name,
                    "notes": workout.notes,
                },
                user.access_token,
            )

            exercise_rows = [
                {
                    "id": str(uuid4()),
                    "workout_id": w_id,
                    "scheduled_date": workout.scheduled_date.isoformat(),
                    "order_index": idx,
                    "name": exercise.name,
                    "sets": len(exercise.sets),
                    "reps": _legacy_reps(exercise),
                    "notes": exercise.notes,
                }
                for idx, exercise in enumerate(workout.exercises)
            ]

            if exercise_rows:
                insert_rows("exercises", exercise_rows, user.access_token)
    except SupabaseDataError as exc:
        logger.exception("plan save failed user_id=%s", user.id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Plan save failed",
        ) from exc

    return SavePlanResponse(saved=True)


def _legacy_reps(exercise: PlannedExercise) -> str | None:
    """flatten nested repetitions only while the legacy exercise table remains in use"""

    repetitions = [exercise_set.reps for exercise_set in exercise.sets]
    if not any(value is not None for value in repetitions):
        return None

    first = repetitions[0]
    if all(value == first for value in repetitions):
        return str(first) if first is not None else None
    return "/".join(str(value) if value is not None else "-" for value in repetitions)
