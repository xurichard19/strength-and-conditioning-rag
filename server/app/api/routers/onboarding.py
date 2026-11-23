from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from app.api.errors import PRIVATE_HEADERS, database_errors, private_response
from app.api.schemas import OnboardingResponse, OnboardingSaveRequest
from app.auth.supabase import AuthUser, require_user
from app.db.supabase import onboarding_responses
from app.services import planning_access


router = APIRouter(prefix="/onboarding", tags=["onboarding"], dependencies=[Depends(private_response)])


@router.get("", response_model=OnboardingResponse | None)
def get_onboarding(user: AuthUser = Depends(require_user)) -> OnboardingResponse | None:
    """ - **user**: verified identity and jwt; never accepts an owner from the request
    - **returns**: current answers and completion metadata, or json null before the first save """

    with database_errors("onboarding.get_onboarding"):
        result = onboarding_responses.get_onboarding_response(user.id, user.access_token)
        return OnboardingResponse.model_validate(result) if result is not None else None


@router.put("", response_model=OnboardingResponse)
def save_onboarding(
    payload: OnboardingSaveRequest, user: AuthUser = Depends(require_user),
) -> OnboardingResponse:
    """ replace all answers, dropping omitted keys and preserving completion time

    - **payload**: full desired answers object; owner and completion fields are forbidden
    - **user**: verified identity and caller jwt
    - **returns**: saved answer record including database timestamps """

    with database_errors("onboarding.save_onboarding"):
        return OnboardingResponse.model_validate(
            onboarding_responses.save_onboarding_response(user.id, payload.answers, user.access_token))


@router.post("/complete", response_model=OnboardingResponse)
def complete_onboarding(background: BackgroundTasks, user: AuthUser = Depends(require_user)) -> OnboardingResponse:
    """ planning runs separately after verification

    - **background**: post-response tasks used for planning activation
    - **user**: verified owner; the handler uses backend credentials
    - **returns**: completed response before generation; 404 if no answers were saved """

    with database_errors("onboarding.complete_onboarding"):
        result = onboarding_responses.complete_onboarding_response(user.id)
        if result is None:
            raise HTTPException(404, "save onboarding answers before completing", headers=PRIVATE_HEADERS)
        background.add_task(planning_access.after_verification, user.id)
        return OnboardingResponse.model_validate(result)
