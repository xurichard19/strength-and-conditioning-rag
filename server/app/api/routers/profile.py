import logging

from fastapi import APIRouter, Depends, HTTPException, status
from app.auth.supabase import AuthUser, require_user
from app.db.supabase import SupabaseDataError, upsert_rows

router = APIRouter(prefix='/profile')
logger = logging.getLogger(__name__)


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
