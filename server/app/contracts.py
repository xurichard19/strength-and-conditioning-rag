# shared business models used across the backend

import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


# -------------------- shared literals --------------------

WorkoutStatus = Literal["planned", "in_progress", "completed", "skipped"]
SetResultStatus = Literal["pending", "completed", "skipped"]
MessageRole = Literal["user", "assistant"]
SportsWorkoutIntensity = Literal["easy", "moderate", "hard", "variable"]
SportsWorkoutStatus = Literal["planned", "completed", "cancelled"]
ReplanKind = Literal["adjustment", "refresh"]
PlanningChangeStatus = Literal["applied", "undone", "discarded"]
ChangeWorkoutSide = Literal["before", "after"]
ReplanJobStatus = Literal["pending", "running", "succeeded", "failed", "cancelled"]


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
    model_config = ConfigDict(extra="forbid")

    planned_reps: int | None = Field(default=None, gt=0)
    planned_weight: float | None = Field(default=None, ge=0)
    planned_distance: float | None = Field(default=None, gt=0)
    planned_duration_seconds: int | None = Field(default=None, gt=0)
    planned_rpe: float | None = Field(default=None, ge=1, le=10)
    planned_rest_seconds: int | None = Field(default=None, ge=0)
    planned_notes: str | None = None


class PlannedExercise(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1)
    reps_per_side: bool = False
    weight_unit: Literal["kg", "lb"] | None = None
    distance_unit: Literal["m", "km", "mi"] | None = None
    sets: list[PlannedExerciseSet] = Field(default_factory=list)
    notes: str | None = None


class PlannedWorkout(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1)
    scheduled_date: datetime.date
    exercises: list[PlannedExercise]
    notes: str | None = None


class PlannedWorkoutPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

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


# -------------------- planning schedule records --------------------

class PlanningScheduleRecord(BaseModel):
    """coverage and fixed local refresh cadence; revision covers all planning inputs"""

    user_id: UUID
    horizon_days: int = Field(default=7, gt=0)
    refresh_interval_days: int = Field(default=7, gt=0)
    horizon_end: datetime.date | None = None
    next_refresh_at: datetime.datetime
    revision: int = Field(default=0, ge=0)
    created_at: datetime.datetime
    updated_at: datetime.datetime

    @model_validator(mode="after")
    def check_refresh_interval(self):
        if self.refresh_interval_days > self.horizon_days:
            raise ValueError("refresh interval must not exceed horizon")
        return self


# -------------------- planning change records --------------------

class PlanningChangeRecord(BaseModel):
    id: UUID
    user_id: UUID
    revision: int = Field(gt=0)
    kind: ReplanKind
    status: PlanningChangeStatus = "applied"
    reason: str = Field(min_length=1)
    effective_from: datetime.date
    effective_through: datetime.date
    horizon_end_before: datetime.date | None = None
    horizon_end_after: datetime.date
    created_at: datetime.datetime

    @model_validator(mode="after")
    def check_horizon(self):
        if not self.effective_from <= self.effective_through <= self.horizon_end_after:
            raise ValueError("change window must be ordered and within the horizon")
        if self.kind == "adjustment" and self.horizon_end_before != self.horizon_end_after:
            raise ValueError("adjustments must preserve the horizon")
        if self.horizon_end_before and self.horizon_end_after < self.horizon_end_before:
            raise ValueError("new changes must not shorten the horizon")
        return self


class PlanningChangeWorkoutRecord(BaseModel):
    """only affected workout ids; unchanged workouts need no links"""

    change_id: UUID
    workout_id: UUID
    user_id: UUID
    side: ChangeWorkoutSide


# -------------------- replan job records --------------------

class ReplanJobRecord(BaseModel):
    id: UUID
    user_id: UUID
    kind: ReplanKind
    status: ReplanJobStatus = "pending"
    reason: str = Field(min_length=1)
    deduplication_key: str = Field(min_length=1)
    effective_from: datetime.date | None = None
    effective_through: datetime.date | None = None
    scheduled_for: datetime.datetime | None = None
    available_at: datetime.datetime
    attempts: int = Field(default=0, ge=0)
    expected_revision: int | None = Field(default=None, ge=0)
    lease_token: UUID | None = None
    lease_expires_at: datetime.datetime | None = None
    change_id: UUID | None = None
    error: str | None = None
    completed_at: datetime.datetime | None = None
    created_at: datetime.datetime
    updated_at: datetime.datetime

    @model_validator(mode="after")
    def check_adjustment_window(self):
        if self.kind == "adjustment":
            if self.effective_from is None or self.effective_through is None:
                raise ValueError("adjustments require a start and end date")
            if self.effective_from > self.effective_through:
                raise ValueError("adjustment end must not precede start")
        elif self.effective_from is not None or self.effective_through is not None:
            raise ValueError("refresh windows are calculated when the job runs")
        return self


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
    status: WorkoutStatus = "planned"
    notes: str | None = None
    started_at: datetime.datetime | None = None
    completed_at: datetime.datetime | None = None
    skipped_at: datetime.datetime | None = None
    superseded_at: datetime.datetime | None = None
    created_at: datetime.datetime
    updated_at: datetime.datetime
    exercises: list[ExerciseRecord]


# -------------------- database operation results --------------------

class WorkoutWriteResult(BaseModel):
    """receipt returned after a replan or rollback commits successfully"""

    change_id: UUID | None
    workout_ids: list[UUID]
    revision: int = Field(ge=0)


class ClaimedReplanJob(BaseModel):
    job: ReplanJobRecord
    effective_from: datetime.date
    effective_through: datetime.date
    horizon_end: datetime.date


# -------------------- database write inputs --------------------

class ProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str | None = Field(default=None, min_length=1, max_length=60)
    timezone: str = Field(default="UTC", min_length=1)


class ExerciseSetResult(BaseModel):
    """complete result values for one set; omitted actual values are cleared"""

    model_config = ConfigDict(extra="forbid")

    id: UUID
    actual_reps: int | None = Field(default=None, ge=0)
    actual_weight: float | None = Field(default=None, ge=0)
    actual_distance: float | None = Field(default=None, ge=0)
    actual_duration_seconds: int | None = Field(default=None, ge=0)
    actual_rpe: float | None = Field(default=None, ge=1, le=10)
    result_notes: str | None = None
    result_status: SetResultStatus = "pending"


# -------------------- message records --------------------

class ConversationRecord(BaseModel):
    id: UUID
    user_id: UUID
    title: str
    created_at: datetime.datetime


class MessageRecord(BaseModel):
    conversation_id: UUID
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


class SportsWorkoutInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sport: str = Field(min_length=1)
    scheduled_date: datetime.date
    start_time: datetime.time | None = None
    planned_duration_minutes: int | None = Field(default=None, gt=0)
    intensity: SportsWorkoutIntensity | None = None
    notes: str | None = None


class SportsWorkoutUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sport: str | None = Field(default=None, min_length=1)
    scheduled_date: datetime.date | None = None
    start_time: datetime.time | None = None
    planned_duration_minutes: int | None = Field(default=None, gt=0)
    intensity: SportsWorkoutIntensity | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def check_required_fields(self):
        for field in ("sport", "scheduled_date"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


# -------------------- combined query results --------------------

class CalendarRecords(BaseModel):
    workouts: list[WorkoutRecord]
    sports_workouts: list[SportsWorkoutRecord]


class CalendarSnapshot(CalendarRecords):
    revision: int | None = Field(default=None, ge=0)


class WorkoutSnapshot(BaseModel):
    workout: WorkoutRecord
    revision: int | None = Field(default=None, ge=0)


class PlanningHistoryPage(BaseModel):
    changes: list[PlanningChangeRecord]
    revision: int | None = Field(default=None, ge=0)


class PlanningChangePreview(BaseModel):
    change: PlanningChangeRecord
    before: list[WorkoutRecord]
    after: list[WorkoutRecord]
    revision: int | None = Field(default=None, ge=0)


class ReplanContext(BaseModel):
    schedule: PlanningScheduleRecord
    profile: ProfileRecord
    onboarding: OnboardingResponseRecord | None
    recent_workouts: list[WorkoutRecord]
    calendar: CalendarRecords
