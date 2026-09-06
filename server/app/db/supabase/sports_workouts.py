# sports workout queries and row mapping

import datetime
from typing import Any

from app.contracts import SportsWorkoutIntensity, SportsWorkoutRecord
from app.db.supabase.transport import (
    SupabaseDataError,
    delete_rows,
    insert_rows,
    select_rows,
    update_rows,
)


SPORTS_WORKOUT_COLUMNS = (
    "id,user_id,sport,scheduled_date,start_time,planned_duration_minutes,intensity,"
    "status,notes,completed_at,cancelled_at,created_at,updated_at"
)
SPORTS_WORKOUT_UPDATE_FIELDS = {
    "sport",
    "scheduled_date",
    "start_time",
    "planned_duration_minutes",
    "intensity",
    "status",
    "notes",
    "completed_at",
    "cancelled_at",
}


def get_sports_workout(
    user_id: str,
    access_token: str,
    workout_id: str,
) -> SportsWorkoutRecord | None:
    """return one user-owned sports workout"""

    rows = select_rows(
        "sports_workouts",
        [
            ("select", SPORTS_WORKOUT_COLUMNS),
            ("id", f"eq.{workout_id}"),
            ("user_id", f"eq.{user_id}"),
            ("limit", "1"),
        ],
        access_token,
    )
    return SportsWorkoutRecord.model_validate(rows[0]) if rows else None


def get_sports_workouts_in_range(
    user_id: str,
    access_token: str,
    start_date: datetime.date,
    end_date: datetime.date,
) -> list[SportsWorkoutRecord]:
    """return non-cancelled sports workouts in an inclusive planning range"""

    if start_date > end_date:
        raise ValueError("start date must not be after end date")
    if (end_date - start_date).days > 366:
        raise ValueError("date range must not exceed 366 days")

    rows = select_rows(
        "sports_workouts",
        [
            ("select", SPORTS_WORKOUT_COLUMNS),
            ("user_id", f"eq.{user_id}"),
            ("scheduled_date", f"gte.{start_date.isoformat()}"),
            ("scheduled_date", f"lte.{end_date.isoformat()}"),
            ("status", "neq.cancelled"),
            ("order", "scheduled_date.asc,start_time.asc.nullslast,id.asc"),
        ],
        access_token,
    )
    return [SportsWorkoutRecord.model_validate(row) for row in rows]


def create_sports_workout(
    user_id: str,
    access_token: str,
    sport: str,
    scheduled_date: datetime.date,
    start_time: datetime.time | None = None,
    planned_duration_minutes: int | None = None,
    intensity: SportsWorkoutIntensity | None = None,
    notes: str | None = None,
) -> SportsWorkoutRecord:
    """create a sports workout that can be used as a planning constraint"""

    rows = insert_rows(
        "sports_workouts",
        {
            "user_id": user_id,
            "sport": sport,
            "scheduled_date": scheduled_date.isoformat(),
            "start_time": start_time.isoformat() if start_time else None,
            "planned_duration_minutes": planned_duration_minutes,
            "intensity": intensity,
            "notes": notes,
        },
        access_token,
    )
    if not rows:
        raise SupabaseDataError("sports workout write returned no rows")
    return SportsWorkoutRecord.model_validate(rows[0])


def update_sports_workout(
    user_id: str,
    access_token: str,
    workout_id: str,
    values: dict[str, Any],
) -> SportsWorkoutRecord | None:
    """update allowed sports workout fields and return the updated workout"""

    unsupported = values.keys() - SPORTS_WORKOUT_UPDATE_FIELDS
    if not values or unsupported:
        raise ValueError("invalid sports workout update fields")

    serialized = {
        key: value.isoformat()
        if isinstance(value, (datetime.date, datetime.datetime, datetime.time))
        else value
        for key, value in values.items()
    }
    rows = update_rows(
        "sports_workouts",
        serialized,
        [("id", f"eq.{workout_id}"), ("user_id", f"eq.{user_id}")],
        access_token,
    )
    return SportsWorkoutRecord.model_validate(rows[0]) if rows else None


def delete_sports_workout(
    user_id: str,
    access_token: str,
    workout_id: str,
) -> SportsWorkoutRecord | None:
    """delete one user-owned sports workout and return the deleted row"""

    rows = delete_rows(
        "sports_workouts",
        [("id", f"eq.{workout_id}"), ("user_id", f"eq.{user_id}")],
        access_token,
    )
    return SportsWorkoutRecord.model_validate(rows[0]) if rows else None
