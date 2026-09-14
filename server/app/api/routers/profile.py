from fastapi import APIRouter, Depends, HTTPException, Response

from app.api.errors import PRIVATE_HEADERS, database_errors
from app.api.schemas import ProfileResponse, ProfileUpdate
from app.auth.supabase import AuthUser, require_user
from app.contracts import ProfileUpdate as ProfileFields
from app.db.supabase import profiles


router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("", response_model=ProfileResponse)
def get_profile(response: Response, user: AuthUser = Depends(require_user)) -> ProfileResponse:
    """
    read identity and preferences for the authenticated user

    profile creation belongs to the auth signup trigger; a missing row is not
    silently recreated. onboarding answers are exposed by the onboarding router.

    - **response**: receives private/no-store caching headers
    - **user**: verified identity and jwt, never a caller-supplied owner id
    - **returns**: current profile, or 404 when no visible profile exists
    """

    response.headers.update(PRIVATE_HEADERS)
    with database_errors():
        result = profiles.get_profile(user.id, user.access_token)
        if result is None:
            raise HTTPException(404, "profile not found", headers=PRIVATE_HEADERS)
        return ProfileResponse.model_validate(result)


@router.patch("", response_model=ProfileResponse)
def update_profile(
    payload: ProfileUpdate, response: Response, user: AuthUser = Depends(require_user),
) -> ProfileResponse:
    """
    update the user's display name or timezone through the profile handler

    omitted fields remain unchanged. explicit null clears display_name, but
    timezone cannot be null. invalid/empty input is rejected with 422 before
    persistence. the database invalidates planning inputs; no job is queued here.

    - **payload**: validated editable fields; email, owner, and legacy answers are forbidden
    - **response**: receives private/no-store caching headers
    - **user**: verified identity and caller jwt for rls
    - **returns**: saved profile, or 404 if the profile does not exist
    """

    response.headers.update(PRIVATE_HEADERS)
    with database_errors():
        result = profiles.update_profile(user.id,
            ProfileFields.model_validate(payload.model_dump(exclude_unset=True)), user.access_token)
        if result is None:
            raise HTTPException(404, "profile not found", headers=PRIVATE_HEADERS)
        return ProfileResponse.model_validate(result)
