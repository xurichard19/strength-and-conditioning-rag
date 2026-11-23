from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.api.errors import PRIVATE_HEADERS, database_errors, private_response
from app.api.schemas import SportsCreateRequest, SportsStatusRequest, SportsUpdateRequest, SportsWorkoutResponse
from app.auth.supabase import AuthUser
from app.auth.billing import require_paid_user
from app.contracts import SportsWorkoutInput, SportsWorkoutRecord, SportsWorkoutUpdate
from app.db.supabase import sports_workouts


router = APIRouter(prefix="/sports-workouts", tags=["sports workouts"], dependencies=[Depends(private_response)])


def require_sport(result: SportsWorkoutRecord | None) -> SportsWorkoutResponse:
    """ return a saved commitment, or raise 404 when result is missing/inaccessible """

    if result is None:
        raise HTTPException(404, "sports workout not found", headers=PRIVATE_HEADERS)
    return SportsWorkoutResponse.model_validate(result)


@router.get("/{workout_id}", response_model=SportsWorkoutResponse)
def get_sport(workout_id: UUID, user: AuthUser = Depends(require_paid_user)) -> SportsWorkoutResponse:
    """ read one commitment, including cancelled sessions, or return 404

    - **workout_id**: owned sports commitment id
    - **user**: verified owner and caller jwt
    - **returns**: commitment or 404 when missing """

    with database_errors("sports_workouts.get_sport"):
        return require_sport(sports_workouts.get_sports_workout(user.id, workout_id, None))


@router.post("", response_model=SportsWorkoutResponse, status_code=201)
def create_sport(payload: SportsCreateRequest, user: AuthUser = Depends(require_paid_user)) -> SportsWorkoutResponse:
    """ create a sports commitment and adjust affected covered dates. retry with the same id and
    fields after a lost response. conflicting reuse returns 409

    - **payload**: stable client uuid, sport, local date/time, and optional duration/intensity/notes
    - **user**: verified owner; owner/status fields are not accepted in the payload
    - **returns**: created or previously saved commitment with the requested id """

    with database_errors("sports_workouts.create_sport"):
        return SportsWorkoutResponse.model_validate(sports_workouts.create_sports_workout(user.id,
            SportsWorkoutInput.model_validate(payload.model_dump()), None))


@router.patch("/{workout_id}", response_model=SportsWorkoutResponse)
def update_sport(workout_id: UUID, payload: SportsUpdateRequest, user: AuthUser = Depends(require_paid_user)) -> SportsWorkoutResponse:
    """ patch supplied fields. null clears optional values and date changes can affect both old
    and new coverage

    - **workout_id**: owned commitment id
    - **payload**: nonempty field patch; status changes use the status endpoint
    - **user**: verified owner and caller jwt
    - **returns**: updated commitment or 404; relevant changes atomically queue covered adjustments """

    with database_errors("sports_workouts.update_sport"):
        return require_sport(sports_workouts.update_sports_workout(user.id, workout_id,
            SportsWorkoutUpdate.model_validate(payload.model_dump(exclude_unset=True)), None))


@router.put("/{workout_id}/status", response_model=SportsWorkoutResponse)
def set_sport_status(workout_id: UUID, payload: SportsStatusRequest, user: AuthUser = Depends(require_paid_user)) -> SportsWorkoutResponse:
    """ update status and its timestamp. cancellation and reinstatement can queue an adjustment.
    repeating a status resets its timestamp

    - **workout_id**: owned commitment id
    - **payload**: desired status
    - **user**: verified owner and caller jwt
    - **returns**: updated commitment or 404; any queued adjustment runs asynchronously """

    with database_errors("sports_workouts.set_sport_status"):
        return require_sport(sports_workouts.set_sports_workout_status(user.id, workout_id, payload.status, None))


@router.delete("/{workout_id}", response_model=SportsWorkoutResponse)
def delete_sport(workout_id: UUID, user: AuthUser = Depends(require_paid_user)) -> SportsWorkoutResponse:
    """ permanently delete a commitment, or return 404 if missing. cancel it instead to keep its
    history

    - **workout_id**: owned commitment to remove
    - **user**: verified owner and caller jwt
    - **returns**: deleted record or 404, including repeated deletion; planning undo cannot restore it """

    with database_errors("sports_workouts.delete_sport"):
        return require_sport(sports_workouts.delete_sports_workout(user.id, workout_id, None))
