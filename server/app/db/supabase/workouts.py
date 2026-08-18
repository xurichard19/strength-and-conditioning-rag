# this file owns reusable planned and completed workout table queries

from datetime import date
from typing import Any

from app.contracts import WorkoutPlan


def get_workouts_in_range(
    user_id: str,
    access_token: str,
    start_date: date,
    end_date: date,
) -> list[dict[str, Any]]:
    """return the authenticated user's workouts scheduled within an inclusive date range"""

    raise NotImplementedError


def get_recent_workouts(
    user_id: str,
    access_token: str,
    before_date: date,
    days: int = 30,
) -> list[dict[str, Any]]:
    """return recent workouts for planning context, ordered newest first"""

    raise NotImplementedError


def save_workout_plan(
    user_id: str,
    access_token: str,
    plan: WorkoutPlan,
) -> None:
    """persist a generated workout plan once the database schema supports the full contract"""

    raise NotImplementedError
