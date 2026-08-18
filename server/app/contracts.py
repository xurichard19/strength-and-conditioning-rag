# this file defines shared planned and completed workout contracts

import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


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
    notes: str | None = None


class PlannedWorkoutPlan(BaseModel):
    workouts: list[PlannedWorkout]
    notes: str | None = None


class SetResult(BaseModel):
    actual_reps: int | None = Field(default=None, ge=0)
    actual_weight: float | None = Field(default=None, ge=0)
    actual_distance: float | None = Field(default=None, ge=0)
    actual_duration_minutes: float | None = Field(default=None, ge=0)
    actual_rpe: float | None = Field(default=None, ge=1, le=10)
    completed_at: datetime.datetime | None = None
    notes: str | None = None


class CompletedExerciseSet(BaseModel):
    id: UUID
    planned: PlannedExerciseSet
    result: SetResult | None = None


class CompletedExercise(PlannedExercise):
    id: UUID
    sets: list[CompletedExerciseSet] = Field(default_factory=list)


class CompletedWorkout(PlannedWorkout):
    id: UUID
    completed_at: datetime.datetime
    exercises: list[CompletedExercise]
