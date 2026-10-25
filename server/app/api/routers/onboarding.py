from fastapi import APIRouter, Depends, HTTPException

from app.api.errors import PRIVATE_HEADERS, database_errors, private_response
from app.api.schemas import OnboardingResponse, OnboardingSaveRequest
from app.auth.supabase import AuthUser, require_user
from app.db.supabase import onboarding_responses


router = APIRouter(prefix="/onboarding", tags=["onboarding"], dependencies=[Depends(private_response)])


@router.get("", response_model=OnboardingResponse | None)
def get_onboarding(user: AuthUser = Depends(require_user)) -> OnboardingResponse | None:
    """
    read the authenticated user's saved onboarding answers

    - **user**: verified identity and jwt; never accepts an owner from the request
    - **returns**: current answers and completion metadata, or json null before the first save
    """

    with database_errors("onboarding.get_onboarding"):
        result = onboarding_responses.get_onboarding_response(user.id, user.access_token)
        return OnboardingResponse.model_validate(result) if result is not None else None


@router.put("", response_model=OnboardingResponse)
def save_onboarding(
    payload: OnboardingSaveRequest, user: AuthUser = Depends(require_user),
) -> OnboardingResponse:
    """
    replace the user's complete answer object without completing onboarding

    accepts changing question keys and nested json values, not fixed questionnaire
    fields. omitted answer keys are removed, not merged. an empty object is valid.
    existing completion time is preserved; edits are last-write-wins. the database
    invalidates planning inputs. changed answers after completion also queue an
    adjustment through existing coverage, preserving the horizon and refresh cadence.

    - **payload**: full desired answers object; owner and completion fields are forbidden
    - **user**: verified identity and caller jwt
    - **returns**: saved answer record including database timestamps
    """

    with database_errors("onboarding.save_onboarding"):
        return OnboardingResponse.model_validate(
            onboarding_responses.save_onboarding_response(user.id, payload.answers, user.access_token))


@router.post("/complete", response_model=OnboardingResponse)
def complete_onboarding(user: AuthUser = Depends(require_user)) -> OnboardingResponse:
    """
    complete saved onboarding and schedule the initial three-week plan atomically

    does not enforce specific questions or nonempty answers. completion is an
    explicit user action; repeated calls preserve the first timestamp and any
    existing schedule. the dispatcher starts generation on its next tick when
    planning is enabled, independently of the mobile connection.

    - **user**: verified owner; the handler uses backend credentials
    - **returns**: completed response before generation; 404 if no answers were saved
    """

    with database_errors("onboarding.complete_onboarding"):
        result = onboarding_responses.complete_onboarding_response(user.id)
        if result is None:
            raise HTTPException(404, "save onboarding answers before completing", headers=PRIVATE_HEADERS)
        return OnboardingResponse.model_validate(result)
