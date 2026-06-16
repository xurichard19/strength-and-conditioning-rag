import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.api.schemas import PlanRequest, PlanResponse
from app.auth.supabase import AuthUser, require_user
from app.generation.llm_client import LLMGenerationError
from app.generation.rag_pipeline import generate_plan


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
        plan = generate_plan(query.goal, query.user_factors(), db)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except LLMGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Plan generator failed to produce a weekly plan",
        ) from exc

    logger.info("authenticated plan completed user_id=%s", user.id)
    return plan


@router.post('')
def save_workout_plan(
    user: AuthUser = Depends(require_user),
):
    # todo: persist a generated plan for the authenticated user
    # todo: validate that all saved rows use user.id, never a client supplied user id
    # todo: insert workout_plans, workout_plan_days, and workout_plan_exercises in one transaction
    # todo: return a saved plan response with database ids for the plan, days, and exercises
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Workout plan save is not implemented",
    )


@router.get('/{id}')
def get_workout_plan(
    id: str,
    user: AuthUser = Depends(require_user),
):
    # todo: fetch one saved plan that belongs to user.id
    # todo: include nested days and exercises in calendar/display order
    # todo: return 404 when the plan does not exist or does not belong to the user
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail=f"Workout plan lookup is not implemented for id {id}",
    )


@router.delete('/{id}')
def delete_workout_plan(
    id: str,
    user: AuthUser = Depends(require_user),
):
    # todo: delete or archive a saved plan that belongs to user.id
    # todo: decide between hard delete and status='archived' before production
    # todo: ensure child days and exercises are handled by cascade or explicit transaction logic
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail=f"Workout plan delete is not implemented for id {id}",
    )
