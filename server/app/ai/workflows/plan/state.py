from dataclasses import dataclass
import datetime
from pydantic import BaseModel, Field
from typing import Literal

from langgraph.graph import MessagesState

from app.ai.services.search import Source


@dataclass(frozen=True)
class WorkflowContext:
    """request-scoped values that should not be stored in graph state"""

    user_id: str
    access_token: str
    conversation_id: str


class PlanState(MessagesState):
    """state shared between planning workflow nodes"""

    prompt: str | None
    sources: list[Source]
    answer: str | None


class Exercise(BaseModel):
    name: str

    # lifting and plyometric volume
    sets: int | None = Field(default=None, gt=0)
    reps: int | None = Field(default=None, gt=0)
    reps_per_side: bool = False

    # external load
    weight: float | None = Field(default=None, ge=0)
    weight_unit: Literal["kg", "lb"] | None = None

    # running, sprinting, and jumping distance
    distance: float | None = Field(default=None, gt=0)
    distance_unit: Literal["m", "km", "mi"] | None = None

    # running and timed exercises
    duration_minutes: float | None = Field(default=None, gt=0)

    # useful across all three exercise types
    target_rpe: float | None = Field(default=None, ge=1, le=10)
    rest_seconds: int | None = Field(default=None, ge=0)
    notes: str | None = None


class Workout(BaseModel):
    name: str
    scheduled_date: datetime.date
    exercises: list[Exercise]


class WorkoutPlan(BaseModel):
    workouts: list[Workout]
