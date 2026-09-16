import datetime
from typing import Annotated, Literal, Self
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, JsonValue, field_validator, model_validator

from app.contracts import (
    MessageRole, PlanningChangeStatus, ReplanJobStatus, ReplanKind, SetResultStatus,
    SportsWorkoutIntensity, SportsWorkoutStatus, WorkoutStatus,
)


# http models own the public shape; only shared business vocabularies are imported

# -------------------- common validation --------------------

class RequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class ResponseModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, allow_inf_nan=False)


class RevisionRequest(RequestModel):
    expected_revision: int = Field(ge=0)


class RevisionResponse(ResponseModel):
    revision: int = Field(ge=0)


# -------------------- workout inputs --------------------

class SetResultRequest(RequestModel):
    """complete result for one set; omitted actual values are cleared"""

    id: UUID
    actual_reps: int | None = Field(default=None, ge=0)
    actual_weight: float | None = Field(default=None, ge=0)
    actual_distance: float | None = Field(default=None, ge=0)
    actual_duration_seconds: int | None = Field(default=None, ge=0)
    actual_rpe: float | None = Field(default=None, ge=1, le=10)
    result_notes: str | None = None
    result_status: SetResultStatus = "pending"


class WorkoutResultsRequest(RevisionRequest):
    status: WorkoutStatus
    sets: list[SetResultRequest] = Field(default_factory=list)

    @model_validator(mode="after")
    def unique_sets(self) -> Self:
        if len({item.id for item in self.sets}) != len(self.sets):
            raise ValueError("set ids must be unique")
        return self


# -------------------- planning --------------------

class ScheduleRequest(RequestModel):
    next_refresh_at: datetime.datetime
    horizon_days: int = Field(default=7, ge=1, le=366)
    refresh_interval_days: int = Field(default=7, ge=1, le=366)

    @model_validator(mode="after")
    def valid_schedule(self) -> Self:
        if self.next_refresh_at.utcoffset() is None:
            raise ValueError("next refresh must include a timezone")
        if self.refresh_interval_days > self.horizon_days:
            raise ValueError("refresh interval must not exceed horizon")
        return self


class AdjustmentRequest(RequestModel):
    deduplication_key: str = Field(min_length=1, max_length=200)
    reason: str = Field(min_length=1, max_length=4000)
    effective_from: datetime.date
    effective_through: datetime.date

    @field_validator("deduplication_key", "reason")
    @classmethod
    def nonblank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("value must not be blank")
        return value

    @model_validator(mode="after")
    def valid_window(self) -> Self:
        if not 0 <= (self.effective_through - self.effective_from).days <= 366:
            raise ValueError("adjustment window must be ordered and no longer than 366 days")
        return self


class JobResponse(ResponseModel):
    """client-safe status; internal lease tokens, worker errors, and retry keys are excluded"""

    id: UUID
    kind: ReplanKind
    status: ReplanJobStatus
    reason: str
    effective_from: datetime.date | None
    effective_through: datetime.date | None
    scheduled_for: datetime.datetime | None
    change_id: UUID | None
    created_at: datetime.datetime
    completed_at: datetime.datetime | None


# -------------------- sports --------------------

class SportsCreateRequest(RequestModel):
    sport: str = Field(min_length=1)
    scheduled_date: datetime.date
    start_time: datetime.time | None = None
    planned_duration_minutes: int | None = Field(default=None, gt=0)
    intensity: SportsWorkoutIntensity | None = None
    notes: str | None = None

    @field_validator("sport")
    @classmethod
    def nonblank_sport(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("sport must not be blank")
        return value.strip()

    @field_validator("start_time")
    @classmethod
    def local_time(cls, value: datetime.time | None) -> datetime.time | None:
        if value is not None and value.tzinfo is not None:
            raise ValueError("start time must be a local time without an offset")
        return value


class SportsUpdateRequest(RequestModel):
    sport: str | None = Field(default=None, min_length=1)
    scheduled_date: datetime.date | None = None
    start_time: datetime.time | None = None
    planned_duration_minutes: int | None = Field(default=None, gt=0)
    intensity: SportsWorkoutIntensity | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def valid_patch(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("at least one sports field is required")
        for field in ("sport", "scheduled_date"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        if self.sport is not None and not self.sport.strip():
            raise ValueError("sport must not be blank")
        if self.start_time is not None and self.start_time.tzinfo is not None:
            raise ValueError("start time must be a local time without an offset")
        return self


class SportsStatusRequest(RequestModel):
    status: SportsWorkoutStatus


# -------------------- chat --------------------

class ConversationUpdate(RequestModel):
    title: str = Field(min_length=1, max_length=120)

    @field_validator("title")
    @classmethod
    def nonblank_title(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("title must not be blank")
        return value.strip()


class ChatRequest(RequestModel):
    conversation_id: UUID
    text: str = Field(min_length=1, max_length=4000)

    @field_validator("text")
    @classmethod
    def nonblank_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("text must not be blank")
        return value.strip()


# -------------------- profile and onboarding --------------------

class ProfileUpdate(RequestModel):
    """editable http fields; omitted values remain unchanged"""

    display_name: str | None = Field(default=None, min_length=1, max_length=60)
    timezone: str = Field(default="UTC", min_length=1)

    @field_validator("display_name")
    @classmethod
    def nonblank_display_name(cls, value: str | None) -> str | None:
        if value is not None:
            value = value.strip()
            if not value:
                raise ValueError("display name must not be blank")
        return value

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("invalid timezone") from exc
        return value

    @model_validator(mode="after")
    def nonempty_update(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("at least one profile field is required")
        return self


class OnboardingSaveRequest(RequestModel):
    """complete flexible answer object; completion timestamps are server-owned"""

    answers: dict[str, JsonValue]


# -------------------- public response fields --------------------

class ProfileResponse(ResponseModel):
    id: UUID
    email: str | None = None
    display_name: str | None = Field(default=None, min_length=1, max_length=60)
    timezone: str = Field(default="UTC", min_length=1)
    created_at: datetime.datetime
    updated_at: datetime.datetime


class OnboardingResponse(ResponseModel):
    user_id: UUID
    answers: dict[str, JsonValue] = Field(default_factory=dict)
    completed_at: datetime.datetime | None = None
    created_at: datetime.datetime
    updated_at: datetime.datetime


class ExerciseSetResponse(ResponseModel):
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


class ExerciseResponse(ResponseModel):
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
    sets: list[ExerciseSetResponse] = Field(default_factory=list)


class WorkoutResponse(ResponseModel):
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
    exercises: list[ExerciseResponse]


class SportsWorkoutResponse(ResponseModel):
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


class ScheduleResponse(ResponseModel):
    user_id: UUID
    horizon_days: int = Field(default=7, gt=0)
    refresh_interval_days: int = Field(default=7, gt=0)
    horizon_end: datetime.date | None = None
    next_refresh_at: datetime.datetime
    revision: int = Field(default=0, ge=0)
    created_at: datetime.datetime
    updated_at: datetime.datetime


class ChangeResponse(ResponseModel):
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


class ChangeWriteResponse(ResponseModel):
    change_id: UUID | None
    workout_ids: list[UUID]
    revision: int = Field(ge=0)


class ConversationResponse(ResponseModel):
    id: UUID
    user_id: UUID
    title: str
    created_at: datetime.datetime


class MessageResponse(ResponseModel):
    conversation_id: UUID
    id: UUID
    user_id: UUID
    role: MessageRole
    content: str = Field(min_length=1)
    created_at: datetime.datetime


class WorkoutDetailResponse(ResponseModel):
    workout: WorkoutResponse
    revision: int | None = Field(default=None, ge=0)


class HistoryResponse(ResponseModel):
    changes: list[ChangeResponse]
    revision: int | None = Field(default=None, ge=0)


class ChangePreviewResponse(ResponseModel):
    change: ChangeResponse
    before: list[WorkoutResponse]
    after: list[WorkoutResponse]
    revision: int | None = Field(default=None, ge=0)


class CalendarResponse(ResponseModel):
    workouts: list[WorkoutResponse]
    sports_workouts: list[SportsWorkoutResponse]
    revision: int | None = Field(default=None, ge=0)


class HealthResponse(ResponseModel):
    status: Literal["ok"] = "ok"


class AppResponse(ResponseModel):
    app: str


# -------------------- streamed chat events --------------------

class SourceResponse(ResponseModel):
    title: str | None = None
    doi: str | None = None
    url: str | None = None
    source_type: Literal["research", "web"]
    content: str = Field(min_length=1)
    score: float | None = None


class ChatTextEvent(ResponseModel):
    type: Literal["text"] = "text"
    delta: str


class ChatStatusEvent(ResponseModel):
    type: Literal["status"] = "status"
    stage: Literal["fetching_user_context", "researching", "thinking"]


class ChatSourcesEvent(ResponseModel):
    type: Literal["sources"] = "sources"
    sources: list[SourceResponse]


class ChatSavedEvent(ResponseModel):
    type: Literal["saved"] = "saved"
    message: MessageResponse


class ChatDoneEvent(ResponseModel):
    type: Literal["done"] = "done"
    message_id: UUID
    message: MessageResponse


class ChatErrorEvent(ResponseModel):
    type: Literal["error"] = "error"
    message: str


ChatStreamEvent = Annotated[
    ChatSavedEvent | ChatTextEvent | ChatStatusEvent | ChatSourcesEvent | ChatDoneEvent | ChatErrorEvent,
    Field(discriminator="type"),
]
