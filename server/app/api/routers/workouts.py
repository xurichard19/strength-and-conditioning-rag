from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.api.errors import PRIVATE_HEADERS, database_errors, private_response
from app.api.schemas import RevisionResponse, WorkoutDetailResponse, WorkoutResultsRequest
from app.auth.supabase import AuthUser
from app.auth.billing import require_paid_user
from app.contracts import ExerciseSetResult
from app.db.supabase import workouts


router = APIRouter(prefix="/workouts", tags=["workouts"], dependencies=[Depends(private_response)])


@router.get("/{workout_id}", response_model=WorkoutDetailResponse)
def get_workout(workout_id: UUID, user: AuthUser = Depends(require_paid_user)) -> WorkoutDetailResponse:
    """ return a current workout with its sets and revision. missing or superseded versions
    return 404

    - **workout_id**: current version id from the calendar
    - **user**: verified owner; historical versions are accessed through planning history
    - **returns**: workout with nested exercises/sets and revision, or 404 when not current/visible """

    with database_errors("workouts.get_workout"):
        result = workouts.get_workout_snapshot(user.id, workout_id, None)
        if result is None:
            raise HTTPException(404, "workout not found", headers=PRIVATE_HEADERS)
        return WorkoutDetailResponse.model_validate(result)


@router.put("/{workout_id}/results", response_model=RevisionResponse)
def save_results(
    workout_id: UUID, payload: WorkoutResultsRequest, user: AuthUser = Depends(require_paid_user),
) -> RevisionResponse:
    """ replace actual values for each supplied set at the expected revision. omitted sets stay
    unchanged. reload after a conflict or uncertain write

    - **workout_id**: current workout id belonging to the authenticated owner
    - **payload**: expected revision, new status, and full results for unique set ids
    - **user**: verified owner; the handler uses a backend-only transaction
    - **returns**: new revision after saving; 409 on stale revision, 404 if not current/visible """

    with database_errors("workouts.save_results"):
        revision = workouts.record_workout_results(user.id, workout_id,
            payload.expected_revision, payload.status,
            [ExerciseSetResult.model_validate(item.model_dump()) for item in payload.sets])
        return RevisionResponse(revision=revision)
