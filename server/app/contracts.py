# shared business models used across the backend

import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


#---------------shared types-----------

TrainingPlanStatus = Literal["draft", "active", "archived", "cancelled"]
PlanningChangeStatus = Literal[
    "pending",
    "proposal",
    "accepted",
    "rejected",
    "processing",
    "applied",
    "no_change",
    "conflict",
    "failed",
    "cancelled",
]
WorkoutModality = Literal["strength", "endurance", "mixed", "rest"]
WorkoutStatus = Literal["planned", "in_progress", "completed", "skipped", "moved", "cancelled"]
ProtectedQuality = Literal["intensity", "frequency", "duration"]
ExerciseKind = Literal["load", "bodyweight", "time"]
ExerciseRole = Literal["primary", "secondary", "accessory"]
SetResultStatus = Literal["pending", "completed", "missed", "skipped"]
MessageRole = Literal["user", "assistant", "system", "tool"]
SportsWorkoutIntensity = Literal["easy", "moderate", "hard", "variable"]
SportsWorkoutStatus = Literal["planned", "completed", "cancelled"]


#---------------source models-----------

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


class ProfileRecord(BaseModel):
    id: UUID
    email: str | None = None
    display_name: str | None = Field(default=None, min_length=1, max_length=60)
    timezone: str = Field(default="UTC", min_length=1)
    created_at: datetime.datetime
    updated_at: datetime.datetime


class OnboardingResponseRecord(BaseModel):
    user_id: UUID
    schema_version: int = Field(default=1, gt=0)
    answers: dict[str, Any] = Field(default_factory=dict)
    completed_at: datetime.datetime | None = None
    created_at: datetime.datetime
    updated_at: datetime.datetime


class TrainingPlanRecord(BaseModel):
    id: UUID
    user_id: UUID
    name: str = Field(min_length=1)
    status: TrainingPlanStatus = "active"
    goal: str | None = None
    starts_on: datetime.date
    target_event_date: datetime.date | None = None
    horizon_days: int = Field(default=14, gt=0)
    refresh_interval_days: int = Field(default=7, gt=0)
    planned_through: datetime.date | None = None
    next_refresh_at: datetime.datetime | None = None
    strategy: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime.datetime
    updated_at: datetime.datetime
    archived_at: datetime.datetime | None = None


class PlanningChangeRecord(BaseModel):
    id: UUID
    user_id: UUID
    plan_id: UUID
    trigger: str = Field(min_length=1)
    operation: str = Field(min_length=1)
    effective_from: datetime.date
    horizon_end: datetime.date | None = None
    status: PlanningChangeStatus = "pending"
    idempotency_key: str = Field(min_length=1)
    command_payload: dict[str, Any] = Field(default_factory=dict)
    result_payload: dict[str, Any] = Field(default_factory=dict)
    generation_metadata: dict[str, Any] = Field(default_factory=dict)
    attempts: int = Field(default=0, ge=0)
    error: str | None = None
    requested_at: datetime.datetime
    applied_at: datetime.datetime | None = None


#---------------planned workout models-----------

class PlannedExerciseSet(BaseModel):
    reps: int | None = Field(default=None, gt=0)
    weight: float | None = Field(default=None, ge=0)
    distance: float | None = Field(default=None, gt=0)
    duration_seconds: int | None = Field(default=None, gt=0)
    target_rpe: float | None = Field(default=None, ge=1, le=10)
    rest_seconds: int | None = Field(default=None, ge=0)
    notes: str | None = None


class PlannedExercise(BaseModel):
    name: str = Field(min_length=1)
    kind: ExerciseKind
    role: ExerciseRole = "secondary"
    reps_per_side: bool = False
    weight_unit: Literal["kg", "lb"] | None = None
    distance_unit: Literal["m", "km", "mi"] | None = None
    rationale: str | None = None
    form_notes: str | None = None
    sets: list[PlannedExerciseSet] = Field(default_factory=list)
    notes: str | None = None


class PlannedWorkout(BaseModel):
    name: str = Field(min_length=1)
    scheduled_date: datetime.date
    modality: WorkoutModality
    planned_duration_minutes: int | None = Field(default=None, ge=0)
    intent: str | None = None
    protected_quality: ProtectedQuality | None = None
    exercises: list[PlannedExercise]
    notes: str | None = None


class PlannedWorkoutPlan(BaseModel):
    workouts: list[PlannedWorkout]
    notes: str | None = None


#---------------persisted workout models-----------

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
    missed_at: datetime.datetime | None = None
    created_at: datetime.datetime
    updated_at: datetime.datetime


class ExerciseRecord(BaseModel):
    id: UUID
    workout_id: UUID
    order_index: int = Field(ge=0)
    name: str = Field(min_length=1)
    kind: ExerciseKind
    role: ExerciseRole
    reps_per_side: bool = False
    weight_unit: Literal["kg", "lb"] | None = None
    distance_unit: Literal["m", "km", "mi"] | None = None
    rationale: str | None = None
    form_notes: str | None = None
    notes: str | None = None
    created_at: datetime.datetime
    updated_at: datetime.datetime
    sets: list[ExerciseSetRecord] = Field(default_factory=list)


class WorkoutRecord(BaseModel):
    id: UUID
    user_id: UUID
    plan_id: UUID
    replaces_workout_id: UUID | None = None
    scheduled_date: datetime.date
    name: str = Field(min_length=1)
    modality: WorkoutModality
    planned_duration_minutes: int | None = Field(default=None, ge=0)
    intent: str | None = None
    protected_quality: ProtectedQuality | None = None
    status: WorkoutStatus = "planned"
    version: int = Field(ge=1)
    notes: str | None = None
    started_at: datetime.datetime | None = None
    completed_at: datetime.datetime | None = None
    skipped_at: datetime.datetime | None = None
    superseded_at: datetime.datetime | None = None
    created_by_change_id: UUID | None = None
    superseded_by_change_id: UUID | None = None
    created_at: datetime.datetime
    updated_at: datetime.datetime
    exercises: list[ExerciseRecord]


class ConversationRecord(BaseModel):
    id: UUID
    user_id: UUID
    title: str | None = None
    created_at: datetime.datetime
    updated_at: datetime.datetime
    archived_at: datetime.datetime | None = None


class MessageRecord(BaseModel):
    id: UUID
    conversation_id: UUID
    user_id: UUID
    role: MessageRole
    content: str = Field(min_length=1)
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime.datetime


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
