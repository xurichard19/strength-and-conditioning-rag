from fastapi import APIRouter, Request
import json
from pydantic import ValidationError

from app.api.schemas import PlanRequest, PlanResponse
from app.generation.rag_pipeline import generate_plan

router = APIRouter(prefix='/plan')

@router.post('/create')
def create_workout(query: PlanRequest, request: Request) -> PlanResponse:
    db = request.app.state.db
    response = generate_plan(query.experience_level, query.goal, query.constraints, db)

    try:
        plan = json.loads(response)
        return PlanResponse.model_validate(plan)
    except (json.JSONDecodeError, ValidationError):
        # likely keyerror, raise issue and deny workout
        pass
    except:
        pass

@router.get('/{id}')
def view_workouts(id: int):
    # after storing in supabase, view workout by id
    pass