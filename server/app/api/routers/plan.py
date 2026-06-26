import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.api.schemas import PlanRequest, PlanResponse
from app.auth.supabase import AuthUser, require_user
from app.db.supabase import get_supabase_admin
from app.rag.pipeline import generate_plan


router = APIRouter(prefix='/plan')
logger = logging.getLogger(__name__)


@router.post('/generate')
def generate_workout_plan(
    query: PlanRequest,
    request: Request,
    user: AuthUser = Depends(require_user),
) -> PlanResponse:
    logger.info("authenticated plan requested user_id=%s email=%s", user.id, user.email)

    db = request.app.state.db
    try:
        plan = generate_plan(date.today(), query.goal, query.user_factors(), db)
        # this gets server date, careful to use helper function in frontend in the future for user date
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    logger.info("authenticated plan completed user_id=%s", user.id)
    return plan


@router.post('')
def save_workout_plan(
    plan: PlanResponse,
    user: AuthUser = Depends(require_user),
) -> bool:
    supabase = get_supabase_admin()

    for workout in plan.workouts:
        w_id = None # FIX, DETERMINE BEST HASH/COUNT METHOD

        supabase.table("workouts").insert(
            {
                "id": w_id,
                "user_id": user.id,
                "scheduled_date": workout.date,
                "status": "scheduled",
                # ... handle rest of mandatory fields
            }
        ).execute()

        for idx, exercise in enumerate(workout.exercises):
            e_id = None

            supabase.table("exercises").insert(
                {
                    "id": e_id,
                    "workout_id": w_id,
                    "order_index": idx,
                    "name": exercise.name,
                    "sets": exercise.sets,
                    "reps": exercise.reps,
                    "notes": exercise.notes, 
                    #... fill rest of fields
                }
            ).execute()

    return True