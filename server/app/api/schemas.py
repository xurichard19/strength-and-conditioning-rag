import datetime
import json
from typing import Any, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


MAX_CHAT_TEXT_LENGTH = 4000
MAX_PLAN_GOAL_LENGTH = 1000
MAX_PLAN_EXTRA_KEYS = 20
MAX_PLAN_EXTRA_JSON_LENGTH = 4000

PrimaryGoal = Literal[
    "balanced_hybrid",
    "strength",
    "endurance",
    "conditioning",
    "event_preparation",
    "general_fitness",
]
ExperienceLevel = Literal["new", "intermediate", "experienced"]
EquipmentAccess = Literal["full_gym", "home_gym", "minimal_equipment", "bodyweight_only"]


class Source(BaseModel):
    id: str
    text: str
    source: str | None = None
    page: int | None = None


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


class Exercise(BaseModel):
    date: datetime.date
    name: str
    reps: int | str | None = None
    sets: int | None = None
    notes: str | None = None


class Workout(BaseModel):
    exercises: list[Exercise]


class PlanRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    goal: str = Field(min_length=1, max_length=MAX_PLAN_GOAL_LENGTH)

    @field_validator("goal")
    @classmethod
    def goal_must_not_be_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("goal is required")
        return stripped

    @model_validator(mode="after")
    def user_factors_must_be_bounded(self) -> Self:
        extra = self.model_extra or {}
        if len(extra) > MAX_PLAN_EXTRA_KEYS:
            raise ValueError(f"plan factors cannot include more than {MAX_PLAN_EXTRA_KEYS} fields")

        serialized = json.dumps(extra, separators=(",", ":"))
        if len(serialized) > MAX_PLAN_EXTRA_JSON_LENGTH:
            raise ValueError(
                f"plan factors cannot exceed {MAX_PLAN_EXTRA_JSON_LENGTH} serialized characters"
            )

        return self
    
    def user_factors(self) -> dict[str, Any]:
        return dict(self.model_extra or {})


class PlanResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    workouts: list[Workout]


class ProfileResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str | None = Field(default=None, min_length=1, max_length=60)
    primary_goal: PrimaryGoal | None = None
    experience_level: ExperienceLevel | None = None
    training_days_per_week: int | None = Field(default=None, ge=2, le=7)
    session_duration_minutes: Literal[30, 45, 60, 75, 90] | None = None
    equipment_access: EquipmentAccess | None = None
    onboarding_completed_at: datetime.datetime | None = None


class ProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str | None = Field(default=None, min_length=1, max_length=60)
    primary_goal: PrimaryGoal | None = None
    experience_level: ExperienceLevel | None = None
    training_days_per_week: int | None = Field(default=None, ge=2, le=7)
    session_duration_minutes: Literal[30, 45, 60, 75, 90] | None = None
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
