# shared business models used across the backend

import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


# -------------------- shared literals --------------------

WorkoutStatus = Literal["planned", "in_progress", "completed", "skipped"]
SetResultStatus = Literal["pending", "completed", "skipped"]
MessageRole = Literal["user", "assistant"]
SportsWorkoutIntensity = Literal["easy", "moderate", "hard", "variable"]
SportsWorkoutStatus = Literal["planned", "completed", "cancelled"]


# -------------------- retrieval --------------------

class Source(BaseModel):
    title: str | None = None
    doi: str | None = None
    url: str | None = None
    source_type: Literal["research", "web"]
    content: str = Field(min_length=1)
    score: float | None = None

    @model_validator(mode="after")
    def check_source_identifier(self):
        if self.source_type == "research":
            if not self.doi:
                raise ValueError("doi is required for research sources")
            if self.url:
                raise ValueError("url should not be provided for research sources")
        elif self.source_type == "web":
            if not self.url:
                raise ValueError("url is required for web sources")
            if self.doi:
                raise ValueError("doi should not be provided for web sources")
        return self


# -------------------- plan workflow output --------------------

class PlannedExerciseSet(BaseModel):
    planned_reps: int | None = Field(default=None, gt=0)
    planned_weight: float | None = Field(default=None, ge=0)
    planned_distance: float | None = Field(default=None, gt=0)
    planned_duration_seconds: int | None = Field(default=None, gt=0)
    planned_rpe: float | None = Field(default=None, ge=1, le=10)
    planned_rest_seconds: int | None = Field(default=None, ge=0)
    planned_notes: str | None = None


class PlannedExercise(BaseModel):
    name: str = Field(min_length=1)
    reps_per_side: bool = False
    weight_unit: Literal["kg", "lb"] | None = None
    distance_unit: Literal["m", "km", "mi"] | None = None
    sets: list[PlannedExerciseSet] = Field(default_factory=list)
    notes: str | None = None


class PlannedWorkout(BaseModel):
    name: str = Field(min_length=1)
    scheduled_date: datetime.date
    planned_duration_minutes: int | None = Field(default=None, ge=0)
    intent: str | None = None
    exercises: list[PlannedExercise]
    notes: str | None = None


class PlannedWorkoutPlan(BaseModel):
    workouts: list[PlannedWorkout]
    notes: str | None = None


# -------------------- profile records --------------------

class ProfileRecord(BaseModel):
    id: UUID
    email: str | None = None
    display_name: str | None = Field(default=None, min_length=1, max_length=60)
    timezone: str = Field(default="UTC", min_length=1)
    created_at: datetime.datetime
    updated_at: datetime.datetime


class OnboardingResponseRecord(BaseModel):
    user_id: UUID
    answers: dict[str, Any] = Field(default_factory=dict)
    completed_at: datetime.datetime | None = None
    created_at: datetime.datetime
    updated_at: datetime.datetime


# -------------------- planning change records --------------------

class PlanningChangeRecord(BaseModel):
    id: UUID
    user_id: UUID
    reason: str = Field(min_length=1)
    effective_from: datetime.date
    horizon_end: datetime.date
    reverts_change_id: UUID | None = None
    created_at: datetime.datetime


# -------------------- workout records --------------------

class ExerciseSetRecord(BaseModel):
    id: UUID
    exercise_id: UUID
    order_index: int = Field(ge=0)
    planned_reps: int | None = Field(default=None, gt=0)
    planned_weight: float | None = Field(default=None, ge=0)
    planned_distance: float | None = Field(default=None, gt=0)
    planned_duration_seconds: int | None = Field(default=None, gt=0)
    planned_rpe: float | None = Field(default=None, ge=1, le=10)
    planned_rest_seconds: int | None = Field(default=None, ge=0)
    planned_notes: str | None = None
    actual_reps: int | None = Field(default=None, ge=0)
    actual_weight: float | None = Field(default=None, ge=0)
    actual_distance: float | None = Field(default=None, ge=0)
    actual_duration_seconds: int | None = Field(default=None, ge=0)
    actual_rpe: float | None = Field(default=None, ge=1, le=10)
    result_status: SetResultStatus = "pending"
    result_notes: str | None = None
    completed_at: datetime.datetime | None = None
    created_at: datetime.datetime
    updated_at: datetime.datetime


class ExerciseRecord(BaseModel):
    id: UUID
    workout_id: UUID
    order_index: int = Field(ge=0)
    name: str = Field(min_length=1)
    reps_per_side: bool = False
    weight_unit: Literal["kg", "lb"] | None = None
    distance_unit: Literal["m", "km", "mi"] | None = None
    notes: str | None = None
    created_at: datetime.datetime
    updated_at: datetime.datetime
    sets: list[ExerciseSetRecord] = Field(default_factory=list)


class WorkoutRecord(BaseModel):
    id: UUID
    user_id: UUID
    created_by_change_id: UUID
    scheduled_date: datetime.date
    name: str = Field(min_length=1)
    planned_duration_minutes: int | None = Field(default=None, ge=0)
    intent: str | None = None
    status: WorkoutStatus = "planned"
    notes: str | None = None
    started_at: datetime.datetime | None = None
    completed_at: datetime.datetime | None = None
    skipped_at: datetime.datetime | None = None
    superseded_at: datetime.datetime | None = None
    superseded_by_change_id: UUID | None = None
    created_at: datetime.datetime
    updated_at: datetime.datetime
    exercises: list[ExerciseRecord]


class WorkoutWriteResult(BaseModel):
    change_id: UUID
    workout_ids: list[UUID]


# -------------------- message records --------------------

class MessageRecord(BaseModel):
    id: UUID
    user_id: UUID
    role: MessageRole
    content: str = Field(min_length=1)
    created_at: datetime.datetime


# -------------------- sports workout records --------------------

class SportsWorkoutRecord(BaseModel):
    id: UUID
    user_id: UUID
    sport: str = Field(min_length=1)
    scheduled_date: datetime.date
    start_time: datetime.time | None = None
    planned_duration_minutes: int | None = Field(default=None, gt=0)
    intensity: SportsWorkoutIntensity | None = None
    status: SportsWorkoutStatus = "planned"
    notes: str | None = None
    completed_at: datetime.datetime | None = None
    cancelled_at: datetime.datetime | None = None
    created_at: datetime.datetime
    updated_at: datetime.datetime
