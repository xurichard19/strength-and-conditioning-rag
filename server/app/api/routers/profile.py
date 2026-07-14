import logging

from fastapi import APIRouter, Depends, HTTPException, status
from app.api.schemas import ProfileResponse, ProfileUpdate
from app.auth.supabase import AuthUser, require_user
from app.db.supabase import SupabaseDataError, upsert_rows

router = APIRouter(prefix='/profile')
logger = logging.getLogger(__name__)


@router.get('', include_in_schema=False)
@router.get('/', response_model=ProfileResponse)
def get_profile(
    user: AuthUser = Depends(require_user),
) -> ProfileResponse:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Profile loading is not implemented yet",
    )


@router.patch('', include_in_schema=False)
@router.patch('/', response_model=ProfileResponse)
def update_profile(
    update: ProfileUpdate,
    user: AuthUser = Depends(require_user),
) -> ProfileResponse:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Profile updates are not implemented yet",
    )


@router.post('/onboarding/complete', response_model=ProfileResponse)
def complete_onboarding(
    user: AuthUser = Depends(require_user),
) -> ProfileResponse:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Onboarding completion is not implemented yet",
    )


@router.post('', include_in_schema=False)
@router.post('/')
def create_profile(
    user: AuthUser = Depends(require_user),
) -> bool:
    try:
        upsert_rows(
            "profiles",
            {
                "id": user.id,
                "email": user.email,
            },
            user.access_token,
            on_conflict="id",
        )
        return True
    except SupabaseDataError as exc:
        logger.exception("profile creation failed user_id=%s", user.id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Profile creation failed",
        ) from exc
