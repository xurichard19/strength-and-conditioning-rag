"""shared business models used across the backend

model families:
- shared types: small reusable choices used by the other models
  - use cases: contract validation, api schemas, and structured model output

- source models: research and web evidence returned by search
  - use cases: search service results, workflow evidence, and chat citations

- profile models: user preferences and training profile data
  - use cases: profile endpoints, supabase profile mapping, and workflow context

- planned workout models: clean workout prescriptions before they are saved
  - use cases: plan langgraph output, plan api responses, previews, and save requests

- workout result models: what the user actually did for a set
  - use cases: workout logging, set updates, performance history, and replanning context

- persisted workout models: saved workouts with ids, versions, and lifecycle data
  - use cases: supabase row mapping, calendar reads, history loads, and version checks

- completed workout models: persisted workouts that have been marked complete
  - use cases: completed workout responses, training history, and performance analysis
  
- planning workflow models: normalized commands and proposals used to change plans
  - use cases: workflow entry adapters, plan graph input/output, and rpc handoff
"""

import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


#---------------shared types-----------

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
SessionDurationMinutes = Literal[30, 45, 60, 75, 90]


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


#---------------profile models-----------

class UserProfile(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=60)
    primary_goal: PrimaryGoal | None = None
    experience_level: ExperienceLevel | None = None
    training_days_per_week: int | None = Field(default=None, ge=2, le=7)
    session_duration_minutes: SessionDurationMinutes | None = None
    equipment_access: EquipmentAccess | None = None
    onboarding_completed_at: datetime.datetime | None = None


#---------------planned workout models-----------

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


#---------------workout result models-----------

class SetResult(BaseModel):
    actual_reps: int | None = Field(default=None, ge=0)
    actual_weight: float | None = Field(default=None, ge=0)
    actual_distance: float | None = Field(default=None, ge=0)
    actual_duration_minutes: float | None = Field(default=None, ge=0)
    actual_rpe: float | None = Field(default=None, ge=1, le=10)
    completed_at: datetime.datetime | None = None
    notes: str | None = None


#---------------persisted workout models-----------

class ExerciseSetRecord(BaseModel):
    id: UUID
    order_index: int = Field(ge=0)
    planned: PlannedExerciseSet
    result: SetResult | None = None
    missed_at: datetime.datetime | None = None


class ExerciseRecord(PlannedExercise):
    id: UUID
    order_index: int = Field(ge=0)
    sets: list[ExerciseSetRecord] = Field(default_factory=list)


class WorkoutRecord(PlannedWorkout):
    id: UUID
    version: int = Field(ge=1)
    completed_at: datetime.datetime | None = None
    superseded_at: datetime.datetime | None = None
    created_by_change_id: UUID | None = None
    superseded_by_change_id: UUID | None = None
    exercises: list[ExerciseRecord]


#---------------completed workout models-----------

class CompletedExerciseSet(ExerciseSetRecord):
    pass


class CompletedExercise(ExerciseRecord):
    sets: list[CompletedExerciseSet] = Field(default_factory=list)


class CompletedWorkout(WorkoutRecord):
    completed_at: datetime.datetime
    exercises: list[CompletedExercise]


#---------------planning workflow models-----------
# under dev, dont use

PlanningTrigger = Literal[
    "plan_page",
    "chat",
    "readiness",
    "workout_result",
    "missed_workout",
    "profile_update",
]
PlanningOperation = Literal[
    "create_plan",
    "replace_plan",
    "adjust_workout",
    "adjust_future",
]
PlanningResultStatus = Literal[
    "proposal",
    "no_change",
    "conflict",
    "rejected",
]


class WorkoutVersionTarget(BaseModel):
    workout_id: UUID
    expected_version: int = Field(ge=1)


class PlanningCommand(BaseModel):
    trigger: PlanningTrigger
    operation: PlanningOperation
    effective_date: datetime.date
    instructions: str = Field(min_length=1)
    targets: list[WorkoutVersionTarget] = Field(default_factory=list)


class PlanningResult(BaseModel):
    status: PlanningResultStatus
    proposed_plan: PlannedWorkoutPlan | None = None
    targets: list[WorkoutVersionTarget] = Field(default_factory=list)
    notes: str | None = None
