from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.api.errors import PRIVATE_HEADERS, database_errors, private_response
from app.api.schemas import SportsCreateRequest, SportsStatusRequest, SportsUpdateRequest, SportsWorkoutResponse
from app.auth.supabase import AuthUser, require_user
from app.contracts import SportsWorkoutInput, SportsWorkoutRecord, SportsWorkoutUpdate
from app.db.supabase import sports_workouts


router = APIRouter(prefix="/sports-workouts", tags=["sports workouts"], dependencies=[Depends(private_response)])


def require_sport(result: SportsWorkoutRecord | None) -> SportsWorkoutResponse:
    """return a saved commitment, or raise 404 when result is missing/inaccessible"""

    if result is None:
        raise HTTPException(404, "sports workout not found", headers=PRIVATE_HEADERS)
    return SportsWorkoutResponse.model_validate(result)


@router.get("/{workout_id}", response_model=SportsWorkoutResponse)
def get_sport(workout_id: UUID, user: AuthUser = Depends(require_user)) -> SportsWorkoutResponse:
    """
    read one commitment, including cancelled sessions; range reads use /calendar

    - **workout_id**: owned sports commitment id
    - **user**: verified owner and caller jwt
    - **returns**: commitment or 404 when missing
    """

    with database_errors("sports_workouts.get_sport"):
        return require_sport(sports_workouts.get_sports_workout(user.id, workout_id, user.access_token))


@router.post("", response_model=SportsWorkoutResponse, status_code=201)
def create_sport(payload: SportsCreateRequest, user: AuthUser = Depends(require_user)) -> SportsWorkoutResponse:
    """
    create a preplanned sports commitment, separate from generated workouts

    this invalidates planning inputs, but does not choose/enqueue an adjustment.
    use an explicit planning adjustment until trigger orchestration is implemented.
    inserts have no request key: do not blindly retry after a lost response.

    - **payload**: sport, local date/time, and optional duration/intensity/notes
    - **user**: verified owner; owner/status fields are not accepted in the payload
    - **returns**: new planned commitment with generated id
    """

    with database_errors("sports_workouts.create_sport"):
        return SportsWorkoutResponse.model_validate(sports_workouts.create_sports_workout(user.id,
            SportsWorkoutInput.model_validate(payload.model_dump()), user.access_token))


@router.patch("/{workout_id}", response_model=SportsWorkoutResponse)
def update_sport(workout_id: UUID, payload: SportsUpdateRequest, user: AuthUser = Depends(require_user)) -> SportsWorkoutResponse:
    """
    patch supplied commitment fields; omitted values remain and explicit nulls clear optional values

    - **workout_id**: owned commitment id
    - **payload**: nonempty field patch; status changes use the status endpoint
    - **user**: verified owner and caller jwt
    - **returns**: updated commitment or 404; edits invalidate inputs but do not enqueue work
    """

    with database_errors("sports_workouts.update_sport"):
        return require_sport(sports_workouts.update_sports_workout(user.id, workout_id,
            SportsWorkoutUpdate.model_validate(payload.model_dump(exclude_unset=True)), user.access_token))


@router.put("/{workout_id}/status", response_model=SportsWorkoutResponse)
def set_sport_status(workout_id: UUID, payload: SportsStatusRequest, user: AuthUser = Depends(require_user)) -> SportsWorkoutResponse:
    """
    mark a commitment planned, completed, or cancelled with matching timestamps

    cancellation retains the row but hides it from the calendar. repeated status
    writes reset their status timestamp; this is not an idempotent event recorder.

    - **workout_id**: owned commitment id
    - **payload**: desired status
    - **user**: verified owner and caller jwt
    - **returns**: updated commitment or 404; generated workouts are not modified
    """

    with database_errors("sports_workouts.set_sport_status"):
        return require_sport(sports_workouts.set_sports_workout_status(user.id, workout_id, payload.status, user.access_token))


@router.delete("/{workout_id}", response_model=SportsWorkoutResponse)
def delete_sport(workout_id: UUID, user: AuthUser = Depends(require_user)) -> SportsWorkoutResponse:
    """
    permanently delete a commitment; use cancelled status if it must remain inspectable

    - **workout_id**: owned commitment to remove
    - **user**: verified owner and caller jwt
    - **returns**: deleted record or 404, including repeated deletion; planning undo cannot restore it
    """

    with database_errors("sports_workouts.delete_sport"):
        return require_sport(sports_workouts.delete_sports_workout(user.id, workout_id, user.access_token))
