from fastapi import APIRouter, Depends, HTTPException, Response

from app.api.errors import PRIVATE_HEADERS, database_errors
from app.api.schemas import OnboardingResponse, OnboardingSaveRequest
from app.auth.supabase import AuthUser, require_user
from app.db.supabase import onboarding_responses


router = APIRouter(prefix="/onboarding", tags=["onboarding"])


@router.get("", response_model=OnboardingResponse | None)
def get_onboarding(response: Response, user: AuthUser = Depends(require_user)) -> OnboardingResponse | None:
    """
    read the authenticated user's saved onboarding answers

    - **response**: receives private/no-store caching headers
    - **user**: verified identity and jwt; never accepts an owner from the request
    - **returns**: current answers and completion metadata, or json null before the first save
    """

    response.headers.update(PRIVATE_HEADERS)
    with database_errors():
        result = onboarding_responses.get_onboarding_response(user.id, user.access_token)
        return OnboardingResponse.model_validate(result) if result is not None else None


@router.put("", response_model=OnboardingResponse)
def save_onboarding(
    payload: OnboardingSaveRequest, response: Response, user: AuthUser = Depends(require_user),
) -> OnboardingResponse:
    """
    replace the user's complete answer object without completing onboarding

    accepts changing question keys and nested json values, not fixed questionnaire
    fields. omitted answer keys are removed, not merged. an empty object is valid.
    existing completion time is preserved; edits are last-write-wins. the database
    invalidates planning inputs, but this endpoint does not enqueue a replan.

    - **payload**: full desired answers object; owner and completion fields are forbidden
    - **response**: receives private/no-store caching headers
    - **user**: verified identity and caller jwt
    - **returns**: saved answer record including database timestamps
    """

    response.headers.update(PRIVATE_HEADERS)
    with database_errors():
        return OnboardingResponse.model_validate(
            onboarding_responses.save_onboarding_response(user.id, payload.answers, user.access_token))


@router.post("/complete", response_model=OnboardingResponse)
def complete_onboarding(response: Response, user: AuthUser = Depends(require_user)) -> OnboardingResponse:
    """
    mark an existing saved response complete using a server-generated utc timestamp

    does not enforce specific questions or nonempty answers. completion is an
    explicit user action; repeated calls preserve the first timestamp. it does
    not rewrite answers, configure a schedule, or generate the initial plan.

    - **response**: receives private/no-store caching headers
    - **user**: verified owner and caller jwt
    - **returns**: completed response; 404 if no answers have been saved yet
    """

    response.headers.update(PRIVATE_HEADERS)
    with database_errors():
        result = onboarding_responses.complete_onboarding_response(user.id, user.access_token)
        if result is None:
            raise HTTPException(404, "save onboarding answers before completing", headers=PRIVATE_HEADERS)
        return OnboardingResponse.model_validate(result)
