import datetime
import logging

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import ValidationError

from app.api.schemas import ProfileResponse, ProfileUpdate
from app.auth.supabase import AuthUser, require_user
from app.db.supabase import SupabaseDataError, select_rows, update_rows, upsert_rows

router = APIRouter(prefix='/profile')
logger = logging.getLogger(__name__)

PROFILE_COLUMNS = (
    "display_name,primary_goal,experience_level,training_days_per_week,"
    "session_duration_minutes,equipment_access,onboarding_completed_at"
)


def _profile_query(user_id: str) -> list[tuple[str, str]]:
    return [
        ("select", PROFILE_COLUMNS),
        ("id", f"eq.{user_id}"),
        ("limit", "1"),
    ]


def _parse_profile(row: dict[str, object], user_id: str) -> ProfileResponse:
    try:
        return ProfileResponse.model_validate(row)
    except ValidationError as exc:
        logger.exception("profile response validation failed user_id=%s", user_id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Profile data is invalid",
        ) from exc


def _load_profile(user: AuthUser, *, create_if_missing: bool) -> ProfileResponse:
    try:
        rows = select_rows("profiles", _profile_query(user.id), user.access_token)

        if not rows and create_if_missing:
            upsert_rows(
                "profiles",
                {"id": user.id, "email": user.email},
                user.access_token,
                on_conflict="id",
            )
            rows = select_rows("profiles", _profile_query(user.id), user.access_token)
    except SupabaseDataError as exc:
        logger.exception("profile load failed user_id=%s", user.id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Profile load failed",
        ) from exc

    if not rows:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Profile could not be initialized",
        )

    return _parse_profile(rows[0], user.id)


def _update_profile_rows(
    user: AuthUser,
    values: dict[str, object],
    *,
    additional_filters: list[tuple[str, str]] | None = None,
    create_if_missing: bool = True,
) -> list[dict[str, object]]:
    filters = [
        ("select", PROFILE_COLUMNS),
        ("id", f"eq.{user.id}"),
        *(additional_filters or []),
    ]

    try:
        rows = update_rows("profiles", values, filters, user.access_token)
        if rows or not create_if_missing:
            return rows

        upsert_rows(
            "profiles",
            {"id": user.id, "email": user.email},
            user.access_token,
            on_conflict="id",
        )
        return update_rows("profiles", values, filters, user.access_token)
    except SupabaseDataError as exc:
        logger.exception("profile update failed user_id=%s", user.id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Profile update failed",
        ) from exc


def _set_private_no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "private, no-store"


@router.get('', include_in_schema=False)
@router.get('/', response_model=ProfileResponse)
def get_profile(
    response: Response,
    user: AuthUser = Depends(require_user),
) -> ProfileResponse:
    profile = _load_profile(user, create_if_missing=True)
    _set_private_no_store(response)
    return profile


@router.patch('', include_in_schema=False)
@router.patch('/', response_model=ProfileResponse)
def update_profile(
    update: ProfileUpdate,
    response: Response,
    user: AuthUser = Depends(require_user),
) -> ProfileResponse:
    values = update.model_dump(exclude_unset=True, mode="json")
    rows = _update_profile_rows(user, values)
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Profile update failed",
        )

    profile = _parse_profile(rows[0], user.id)
    _set_private_no_store(response)
    return profile


@router.post('/onboarding/complete', response_model=ProfileResponse)
def complete_onboarding(
    response: Response,
    user: AuthUser = Depends(require_user),
) -> ProfileResponse:
    profile = _load_profile(user, create_if_missing=True)
    if profile.onboarding_completed_at is not None:
        _set_private_no_store(response)
        return profile

    required_answers = (
        profile.primary_goal,
        profile.experience_level,
        profile.training_days_per_week,
        profile.session_duration_minutes,
        profile.equipment_access,
    )
    if (
        profile.display_name is None
        or not profile.display_name.strip()
        or any(answer is None for answer in required_answers)
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Complete every onboarding question before continuing.",
        )

    rows = _update_profile_rows(
        user,
        {"onboarding_completed_at": datetime.datetime.now(datetime.UTC).isoformat()},
        additional_filters=[("onboarding_completed_at", "is.null")],
        create_if_missing=False,
    )
    completed_profile = _parse_profile(rows[0], user.id) if rows else _load_profile(
        user,
        create_if_missing=False,
    )
    _set_private_no_store(response)
    return completed_profile


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
