import datetime
import logging
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import ValidationError

from app.api.schemas import (
    ExerciseCompletionResponse,
    ExerciseCompletionUpdate,
    WorkoutExerciseResponse,
    WorkoutRangeResponse,
)
from app.auth.supabase import AuthUser, require_user
from app.db.supabase import SupabaseDataError, select_rows, update_rows


router = APIRouter(prefix="/workouts")
logger = logging.getLogger(__name__)

WORKOUT_EXERCISE_COLUMNS = (
    "id,workout_id,scheduled_date,order_index,name,sets,reps,duration,rest,notes,"
    "metadata,completed_at"
)
WORKOUT_COLUMNS = "id,title,goal,notes"
COMPLETION_COLUMNS = "id,workout_id,completed_at"
MAX_WORKOUT_RANGE_DAYS = 366
MAX_RANGE_EXERCISES = 1000
WORKOUT_ID_BATCH_SIZE = 100


class _ScheduledExerciseRow(WorkoutExerciseResponse):
    scheduled_date: date


def _set_private_no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "private, no-store"


def _invalid_workout_data(user_id: str) -> HTTPException:
    logger.error("workout range response validation failed user_id=%s", user_id)
    return HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail="Workout data is invalid",
    )


def _parse_scheduled_exercises(
    rows: list[dict[str, object]],
    user_id: str,
) -> list[_ScheduledExerciseRow]:
    try:
        return [_ScheduledExerciseRow.model_validate(row) for row in rows]
    except ValidationError:
        raise _invalid_workout_data(user_id) from None


def _parse_completion(
    rows: list[dict[str, object]],
    user_id: str,
    workout_id: UUID,
    exercise_id: UUID,
) -> ExerciseCompletionResponse:
    if len(rows) != 1:
        logger.error(
            "exercise completion returned unexpected row count user_id=%s count=%s",
            user_id,
            len(rows),
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Exercise completion data is invalid",
        )

    try:
        completion = ExerciseCompletionResponse.model_validate(rows[0])
    except ValidationError:
        logger.error("exercise completion response validation failed user_id=%s", user_id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Exercise completion data is invalid",
        ) from None

    if completion.id != exercise_id or completion.workout_id != workout_id:
        logger.error(
            "exercise completion response identifiers mismatched user_id=%s",
            user_id,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Exercise completion data is invalid",
        )

    return completion


def _range_query(
    start_date: date,
    end_date: date,
    *,
    limit: int,
    offset: int,
) -> list[tuple[str, str]]:
    # List of tuples instead of dictionary because scheduled_date appears twice
    return [
        ("select", WORKOUT_EXERCISE_COLUMNS),
        ("scheduled_date", f"gte.{start_date.isoformat()}"),
        ("scheduled_date", f"lte.{end_date.isoformat()}"),
        ("order", "scheduled_date.asc,workout_id.asc,order_index.asc,id.asc"),
        ("limit", str(limit)),
        ("offset", str(offset)),
    ]


def _completion_query(workout_id: UUID, exercise_id: UUID) -> list[tuple[str, str]]:
    return [
        ("select", COMPLETION_COLUMNS),
        ("id", f"eq.{exercise_id}"),
        ("workout_id", f"eq.{workout_id}"),
        ("limit", "1"),
    ]


def _all_exercises_query(
    workout_ids: list[UUID],
    *,
    limit: int,
    offset: int,
) -> list[tuple[str, str]]:
    return [
        ("select", WORKOUT_EXERCISE_COLUMNS),
        ("workout_id", f"in.({','.join(str(workout_id) for workout_id in workout_ids)})"),
        ("order", "workout_id.asc,order_index.asc,id.asc"),
        ("limit", str(limit)),
        ("offset", str(offset)),
    ]


def _too_many_exercises() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail="Workout range contains too many exercises; narrow the date range",
    )


def _load_all_workout_exercises(
    workout_ids: list[UUID],
    user: AuthUser,
) -> list[_ScheduledExerciseRow]:
    rows: list[dict[str, object]] = []

    # Process in batches
    for start in range(0, len(workout_ids), WORKOUT_ID_BATCH_SIZE):
        batch = workout_ids[start : start + WORKOUT_ID_BATCH_SIZE]
        batch_rows = select_rows(
            "exercises",
            _all_exercises_query(
                batch,
                limit=MAX_RANGE_EXERCISES,
                offset=0,
            ),
            user.access_token,
        )
        # Check if the rows queries map to over MAX_RANGE_EXERCISEs (1000) exercises
        # Return error to select smaller date range if yes
        if len(batch_rows) == MAX_RANGE_EXERCISES:
            overflow = select_rows(
                "exercises",
                _all_exercises_query(
                    batch,
                    limit=1,
                    offset=MAX_RANGE_EXERCISES,
                ),
                user.access_token,
            )
            if overflow:
                raise _too_many_exercises()

        rows.extend(batch_rows)
        if len(rows) > MAX_RANGE_EXERCISES:
            raise _too_many_exercises()

    scheduled_exercises = _parse_scheduled_exercises(rows, user.id)

    returned_workout_ids = {exercise.workout_id for exercise in scheduled_exercises}
    # Check that the queries return the expected workout id's 
    if returned_workout_ids != set(workout_ids):
        raise _invalid_workout_data(user.id)

    return scheduled_exercises


def _load_workout_metadata(
    workout_ids: list[UUID],
    user: AuthUser,
) -> dict[UUID, dict[str, object]]:
    metadata_by_id: dict[UUID, dict[str, object]] = {}
    requested_ids = set(workout_ids)

    for start in range(0, len(workout_ids), WORKOUT_ID_BATCH_SIZE):
        batch = workout_ids[start : start + WORKOUT_ID_BATCH_SIZE]
        rows = select_rows(
            "workouts",
            [
                ("select", WORKOUT_COLUMNS),
                ("id", f"in.({','.join(str(workout_id) for workout_id in batch)})"),
                ("order", "id.asc"),
                ("limit", str(len(batch))),
            ],
            user.access_token,
        )

        for row in rows:
            try:
                workout_id = UUID(str(row["id"]))
            except (KeyError, TypeError, ValueError):
                raise _invalid_workout_data(user.id) from None

            if workout_id not in requested_ids or workout_id in metadata_by_id:
                raise _invalid_workout_data(user.id)
            metadata_by_id[workout_id] = row

    if set(metadata_by_id) != requested_ids:
        raise _invalid_workout_data(user.id)

    return metadata_by_id

# Group flat exercise rows into complete workouts and promote their shared date to the workout.
# Validate date consistency and metadata before returning deterministically ordered responses.
def _build_workout_response(
    scheduled_exercises: list[_ScheduledExerciseRow],
    metadata_by_id: dict[UUID, dict[str, object]],
    user_id: str,
) -> list[WorkoutRangeResponse]:
    grouped: dict[UUID, tuple[date, list[WorkoutExerciseResponse]]] = {}

    for scheduled_exercise in scheduled_exercises:
        exercise = WorkoutExerciseResponse.model_validate(
            # Scheduled_date not in WorkoutExerciseResponse model
            scheduled_exercise.model_dump(exclude={"scheduled_date"})
        )
        existing = grouped.get(exercise.workout_id)
        if existing is None:
            grouped[exercise.workout_id] = (scheduled_exercise.scheduled_date, [exercise])
            continue

        scheduled_date, exercises = existing
        if scheduled_date != scheduled_exercise.scheduled_date:
            raise _invalid_workout_data(user_id)
        exercises.append(exercise)

    workouts: list[WorkoutRangeResponse] = []
    for workout_id, (scheduled_date, exercises) in grouped.items():
        metadata = metadata_by_id[workout_id]
        try:
            workouts.append(
                WorkoutRangeResponse.model_validate(
                    {
                        "id": workout_id,
                        "scheduled_date": scheduled_date,
                        "title": metadata.get("title"),
                        "goal": metadata.get("goal"),
                        "notes": metadata.get("notes"),
                        "exercises": exercises,
                    }
                )
            )
        except ValidationError:
            raise _invalid_workout_data(user_id) from None

    return sorted(workouts, key=lambda workout: (workout.scheduled_date, workout.id))


# Find workouts whose exercises fall within the requested range, then reload each complete workout.
# Validate range limits and database results before returning authenticated workout responses.
@router.get("", include_in_schema=False)
@router.get("/", response_model=list[WorkoutRangeResponse])
def list_workouts_in_range(
    response: Response,
    start_date: date,
    end_date: date,
    user: AuthUser = Depends(require_user),
) -> list[WorkoutRangeResponse]:
    """Return workouts in an inclusive date range."""

    if end_date < start_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="end_date must be on or after start_date",
        )

    inclusive_days = (end_date - start_date).days + 1
    if inclusive_days > MAX_WORKOUT_RANGE_DAYS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"date range cannot exceed {MAX_WORKOUT_RANGE_DAYS} days",
        )

    try:
        rows = select_rows(
            "exercises",
            _range_query(
                start_date,
                end_date,
                limit=MAX_RANGE_EXERCISES,
                offset=0,
            ),
            user.access_token,
        )
        if len(rows) == MAX_RANGE_EXERCISES:
            overflow = select_rows(
                "exercises",
                _range_query(start_date, end_date, limit=1, offset=MAX_RANGE_EXERCISES),
                user.access_token,
            )
            if overflow:
                raise _too_many_exercises()

        scheduled_exercises = _parse_scheduled_exercises(rows, user.id)
        if not scheduled_exercises:
            _set_private_no_store(response)
            return []

        workout_ids = list(dict.fromkeys(row.workout_id for row in scheduled_exercises))
        scheduled_exercises = _load_all_workout_exercises(workout_ids, user)
        metadata_by_id = _load_workout_metadata(workout_ids, user)
    except SupabaseDataError as exc:
        logger.error(
            "workout range load failed user_id=%s start_date=%s end_date=%s",
            user.id,
            start_date,
            end_date,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Workout range load failed",
        ) from exc

    workouts = _build_workout_response(
        scheduled_exercises,
        metadata_by_id,
        user.id,
    )
    _set_private_no_store(response)
    return workouts

# Idempotently mark an authenticated user’s exercise as completed or incomplete.
# Use conditional updates and one retry to preserve timestamps and handle concurrent state changes.
@router.patch(
    "/{workout_id}/exercises/{exercise_id}/completion",
    response_model=ExerciseCompletionResponse,
)
def update_exercise_completion(
    workout_id: UUID,
    exercise_id: UUID,
    update: ExerciseCompletionUpdate,
    response: Response,
    user: AuthUser = Depends(require_user),
) -> ExerciseCompletionResponse:
    desired_completed_at = (
        datetime.datetime.now(datetime.UTC).isoformat() if update.completed else None
    )
    state_filter = "is.null" if update.completed else "not.is.null"
    base_query = _completion_query(workout_id, exercise_id)

    try:
        # Attempt the conditional update twice to handle one concurrent state change.
        for _ in range(2):
            updated_rows = update_rows(
                "exercises",
                {"completed_at": desired_completed_at},
                [*base_query[:-1], ("completed_at", state_filter)],
                user.access_token,
            )
            if updated_rows:
                completion = _parse_completion(
                    updated_rows,
                    user.id,
                    workout_id,
                    exercise_id,
                )
                if (completion.completed_at is not None) != update.completed:
                    logger.error(
                        "exercise completion response state mismatched user_id=%s",
                        user.id,
                    )
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail="Exercise completion data is invalid",
                    )
                _set_private_no_store(response)
                return completion

            current_rows = select_rows(
                "exercises",
                base_query,
                user.access_token,
            )
            if not current_rows:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Exercise not found",
                )

            completion = _parse_completion(
                current_rows,
                user.id,
                workout_id,
                exercise_id,
            )
            current_is_completed = completion.completed_at is not None
            if current_is_completed == update.completed:
                _set_private_no_store(response)
                return completion
    except SupabaseDataError as exc:
        logger.error(
            "exercise completion update failed user_id=%s workout_id=%s exercise_id=%s",
            user.id,
            workout_id,
            exercise_id,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Exercise completion update failed",
        ) from exc

    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="Exercise completion changed concurrently; retry the request",
    )
