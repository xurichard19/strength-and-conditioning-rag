import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import ValidationError

from app.api.schemas import PlanRequest, PlanResponse
from app.auth.supabase import AuthUser, require_user
from app.generation.rag_pipeline import generate_plan

router = APIRouter(prefix='/plan')
logger = logging.getLogger(__name__)


def _extract_json_payload(response: str) -> str:
    stripped = response.strip()
    if stripped.startswith("```"):
        lines = stripped.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        return "\n".join(lines).strip()

    return stripped


def _parse_plan_response(response: str) -> PlanResponse:
    try:
        plan = json.loads(_extract_json_payload(response))
        return PlanResponse.model_validate(plan)
    except (json.JSONDecodeError, ValidationError) as exc:
        logger.warning("plan response validation failed response=%r", response)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Plan generator returned an invalid weekly plan",
        ) from exc


@router.post('/create')
def create_workout(
    query: PlanRequest,
    request: Request,
    user: AuthUser = Depends(require_user),
) -> PlanResponse:
    logger.info("authenticated plan requested user_id=%s email=%s", user.id, user.email)

    db = request.app.state.db
    response = generate_plan(query.experience_level, query.goal, query.constraints, db)
    plan = _parse_plan_response(response)

    logger.info("authenticated plan completed user_id=%s", user.id)
    return plan


@router.get('/{id}')
def view_workouts(id: int):
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail=f"Workout plan lookup is not implemented for id {id}",
    )
