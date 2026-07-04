import logging
from datetime import date
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.api.schemas import Exercise, PlanRequest, PlanResponse, Workout
from app.auth.supabase import AuthUser, require_user
from app.db.supabase import SupabaseDataError, insert_rows, select_rows
from app.rag.pipeline import generate_plan


router = APIRouter(prefix='/plan')
logger = logging.getLogger(__name__)


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

    exercises_by_workout: dict[str, list[Exercise]] = {}
    for row in rows:
        workout_id = row.get("workout_id")
        if not isinstance(workout_id, str) or not workout_id:
            continue

        exercises_by_workout.setdefault(workout_id, []).append(
            Exercise(
                date=row["scheduled_date"],
                name=row["name"],
                sets=row.get("sets"),
                reps=row.get("reps"),
                notes=row.get("notes"),
            )
        )

    return PlanResponse(
        workouts=[
            Workout(exercises=exercises)
            for exercises in exercises_by_workout.values()
            if exercises
        ]
    )


@router.post('/generate')
def generate_workout_plan(
    query: PlanRequest,
    request: Request,
    user: AuthUser = Depends(require_user),
) -> PlanResponse:
    logger.info("authenticated plan requested user_id=%s", user.id)

    db = request.app.state.db
    try:
        plan = generate_plan(date.today(), query.goal, query.user_factors(), db)
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
    return plan


@router.post('', include_in_schema=False)
@router.post('/')
def save_workout_plan(
    plan: PlanResponse,
    user: AuthUser = Depends(require_user),
) -> bool:
    try:
        for workout in plan.workouts:
            w_id = str(uuid4())

            insert_rows(
                "workouts",
                {
                    "id": w_id,
                    "user_id": user.id,
                    "status": "scheduled",
                },
                user.access_token,
            )

            exercise_rows = [
                {
                    "id": str(uuid4()),
                    "workout_id": w_id,
                    "scheduled_date": exercise.date.isoformat(),
                    "order_index": idx,
                    "name": exercise.name,
                    "sets": exercise.sets,
                    "reps": str(exercise.reps) if exercise.reps is not None else None,
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

    return True
