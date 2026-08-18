# this file defines shared planned and tracked workout contracts

import datetime
from typing import Literal, TypeAlias
from uuid import UUID

from pydantic import BaseModel, Field


class PlannedExerciseSet(BaseModel):
    reps: int | None = Field(default=None, gt=0)
    weight: float | None = Field(default=None, ge=0)
    distance: float | None = Field(default=None, gt=0)
    duration_minutes: float | None = Field(default=None, gt=0)
    target_rpe: float | None = Field(default=None, ge=1, le=10)
    rest_seconds: int | None = Field(default=None, ge=0)
    notes: str | None = None


class PlannedExercise(BaseModel):
    name: str
    reps_per_side: bool = False
    weight_unit: Literal["kg", "lb"] | None = None
    distance_unit: Literal["m", "km", "mi"] | None = None
    sets: list[PlannedExerciseSet] = Field(default_factory=list)
    notes: str | None = None


class PlannedWorkout(BaseModel):
    name: str
    scheduled_date: datetime.date
    exercises: list[PlannedExercise]


class PlannedWorkoutPlan(BaseModel):
    workouts: list[PlannedWorkout]
    notes: str | None = None


WorkoutStatus: TypeAlias = Literal[
    "planned",
    "in_progress",
    "completed",
    "skipped",
    "archived",
]


class SetResult(BaseModel):
    actual_reps: int | None = Field(default=None, ge=0)
    actual_weight: float | None = Field(default=None, ge=0)
    actual_distance: float | None = Field(default=None, ge=0)
    actual_duration_minutes: float | None = Field(default=None, ge=0)
    actual_rpe: float | None = Field(default=None, ge=1, le=10)
    completed_at: datetime.datetime | None = None
    notes: str | None = None


class TrackedExerciseSet(BaseModel):
    id: UUID
    prescription: PlannedExerciseSet
    result: SetResult | None = None


class TrackedExercise(PlannedExercise):
    id: UUID
    sets: list[TrackedExerciseSet] = Field(default_factory=list)


class TrackedWorkout(PlannedWorkout):
    id: UUID
    status: WorkoutStatus = "planned"
    started_at: datetime.datetime | None = None
    completed_at: datetime.datetime | None = None
    exercises: list[TrackedExercise]
