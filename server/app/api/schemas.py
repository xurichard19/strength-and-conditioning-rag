import datetime
from typing import Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictBool, field_validator, model_validator

from app.contracts import (
    EquipmentAccess,
    ExperienceLevel,
    PlannedWorkoutPlan,
    PrimaryGoal,
    SessionDurationMinutes,
    Source,
    UserProfile,
)


MAX_CHAT_TEXT_LENGTH = 4000
MAX_PLAN_GOAL_LENGTH = 1000


class ChatRequest(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_CHAT_TEXT_LENGTH)

    @field_validator("text")
    @classmethod
    def text_must_not_be_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("text is required")
        return stripped


class ChatResponse(BaseModel):
    text: str
    sources: list[Source] = Field(default_factory=list)


class PlanRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    goal: str = Field(min_length=1, max_length=MAX_PLAN_GOAL_LENGTH)

    additional_context: str | None = Field(default=None, max_length=MAX_CHAT_TEXT_LENGTH)

    @field_validator("goal")
    @classmethod
    def goal_must_not_be_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("goal is required")
        return stripped


class PlanResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plan: PlannedWorkoutPlan


class SavePlanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plan: PlannedWorkoutPlan


class SavePlanResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    saved: bool


class WorkoutExerciseResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    workout_id: UUID
    order_index: int = Field(ge=0)
    name: str
    sets: int | None = Field(default=None, gt=0)
    reps: str | None = None
    duration: str | None = None
    rest: str | None = None
    notes: str | None = None
    metadata: dict[str, object] = Field(default_factory=dict)
    completed_at: datetime.datetime | None = None


class WorkoutRangeResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    scheduled_date: datetime.date
    title: str | None = None
    goal: str | None = None
    notes: str | None = None
    exercises: list[WorkoutExerciseResponse]


class ExerciseCompletionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    completed: StrictBool


class ExerciseCompletionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    workout_id: UUID
    completed_at: datetime.datetime | None


class ProfileResponse(UserProfile):
    model_config = ConfigDict(extra="forbid")


class ProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str | None = Field(default=None, min_length=1, max_length=60)
    primary_goal: PrimaryGoal | None = None
    experience_level: ExperienceLevel | None = None
    training_days_per_week: int | None = Field(default=None, ge=2, le=7)
    session_duration_minutes: SessionDurationMinutes | None = None
    equipment_access: EquipmentAccess | None = None

    @field_validator("display_name")
    @classmethod
    def display_name_must_not_be_blank(cls, value: str | None) -> str | None:
        if value is None:
            return None

        stripped = value.strip()
        if not stripped:
            raise ValueError("display_name is required")
        return stripped

    @model_validator(mode="after")
    def update_must_contain_non_null_fields(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("at least one profile field is required")

        if any(getattr(self, field_name) is None for field_name in self.model_fields_set):
            raise ValueError("profile fields cannot be null")

        return self
