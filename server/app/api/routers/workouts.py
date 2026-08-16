import logging
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status

from app.auth.supabase import AuthUser, require_user
from app.db.supabase import SupabaseDataError, select_rows


router = APIRouter(prefix='/workouts')
logger = logging.getLogger(__name__)


@router.get('/')
def get_workout_by_date(date: date, user: AuthUser = Depends(require_user)) -> list[Exercise]:
    """
    get workout from supabase table by date

    - **date**: datetime.date object
    """

    try:
        workout = select_rows(
            'exercises',
            [
                ('select', 'id,workout_id,scheduled_date,order_index,name,sets,reps,notes'),
                ('scheduled_date', f'eq.{date.isoformat()}'),
                ('order', 'order_index.asc'),
            ],
            user.access_token
        )
    except SupabaseDataError as exc:
        logger.exception("workout load failed date=%s", date)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Workout load failed",
        ) from exc

    return workout

# get workout by date range

@router.patch('/{workout_id}/{exercise_id}')
def update_exercise(workout_id: str, exercise_id: str, user: AuthUser = Depends(require_user)):
    pass