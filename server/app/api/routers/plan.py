import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.api.schemas import PlanRequest, PlanResponse
from app.auth.supabase import AuthUser, require_user
from app.generation.llm_client import LLMGenerationError
from app.generation.rag_pipeline import generate_plan


router = APIRouter(prefix='/plan')
logger = logging.getLogger(__name__)


@router.post('/create')
def create_workout(
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


@router.get('/{id}')
def view_workouts(id: int):
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail=f"Workout plan lookup is not implemented for id {id}",
    )
