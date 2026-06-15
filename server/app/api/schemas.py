from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Any


class Source(BaseModel):
    id: str
    text: str
    source: str | None = None
    page: int | None = None


class ChatRequest(BaseModel):
    text: str

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
    name: str
    reps: int | str | None = None
    sets: int | None = None
    notes: str | None = None


class Workout(BaseModel):
    exercises: list[Exercise]


class PlanRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    goal: str = Field(min_length=1)

    @field_validator("goal")
    @classmethod
    def goal_must_not_be_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("goal is required")
        return stripped
    
    def user_factors(self) -> dict[str, Any]:
        return self.model_extra or {}


class PlanResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    Mon: Workout
    Tue: Workout
    Wed: Workout
    Thu: Workout
    Fri: Workout
    Sat: Workout
    Sun: Workout