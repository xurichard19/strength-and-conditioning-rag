from fastapi import APIRouter, Depends, HTTPException

from app.api.errors import PRIVATE_HEADERS, database_errors, private_response
from app.api.schemas import ProfileResponse, ProfileUpdate
from app.auth.supabase import AuthUser, require_user
from app.contracts import ProfileUpdate as ProfileFields
from app.db.supabase import profiles


router = APIRouter(prefix="/profile", tags=["profile"], dependencies=[Depends(private_response)])


@router.get("", response_model=ProfileResponse)
def get_profile(user: AuthUser = Depends(require_user)) -> ProfileResponse:
    """
    read identity and preferences for the authenticated user

    profile creation belongs to the auth signup trigger; a missing row is not
    silently recreated. onboarding answers are exposed by the onboarding router.

    - **user**: verified identity and jwt, never a caller-supplied owner id
    - **returns**: current profile, or 404 when no visible profile exists
    """

    with database_errors("profile.get_profile"):
        result = profiles.get_profile(user.id, user.access_token)
        if result is None:
            raise HTTPException(404, "profile not found", headers=PRIVATE_HEADERS)
        return ProfileResponse.model_validate(result)


@router.patch("", response_model=ProfileResponse)
def update_profile(
    payload: ProfileUpdate, user: AuthUser = Depends(require_user),
) -> ProfileResponse:
    """
    update the user's display name or timezone through the profile handler

    omitted fields remain unchanged. explicit null clears display_name, but
    timezone cannot be null. invalid/empty input is rejected with 422 before
    persistence. changed timezones invalidate planning; name edits do not. no job is queued here.

    - **payload**: validated editable fields; email, owner, and legacy answers are forbidden
    - **user**: verified identity and caller jwt for rls
    - **returns**: saved profile, or 404 if the profile does not exist
    """

    with database_errors("profile.update_profile"):
        result = profiles.update_profile(user.id,
            ProfileFields.model_validate(payload.model_dump(exclude_unset=True)), user.access_token)
        if result is None:
            raise HTTPException(404, "profile not found", headers=PRIVATE_HEADERS)
        return ProfileResponse.model_validate(result)
