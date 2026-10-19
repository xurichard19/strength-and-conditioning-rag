from dataclasses import dataclass, field
from typing import Literal, NotRequired, TypedDict

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.contracts import ClaimedReplanJob, PlanningProposal, ReplanContext, Source


@dataclass(frozen=True)
class WorkflowContext:
    """server-owned claim and revision-checked data; never sent directly to models"""

    claim: ClaimedReplanJob = field(repr=False)
    data: ReplanContext = field(repr=False)


PLAN_TIMEOUT_SECONDS = 180
RESULTS_PER_PROVIDER = {"research": 10, "web": 5}
MAX_CONTEXT_CHARS = 120_000


class SearchQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    query: str = Field(min_length=1, max_length=300)
    providers: Literal["research", "web", "both"]

    @field_validator("query")
    @classmethod
    def require_search_text(cls, value: str) -> str:
        if not any(char.isalnum() for char in value):
            raise ValueError("planning requires a meaningful research query")
        return value.strip()


class EvidenceReview(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sufficient: bool
    gap: str = Field(max_length=500)
    next_search: SearchQuery | None


class PlanState(TypedDict):
    """bounded research and proposal state for one job; no conversation is required"""

    deadline: float
    research_deadline: float
    retries_left: int
    repairs_left: int
    context_packet: NotRequired[str]  # shared athlete inputs, results and calendar through the horizon
    search: NotRequired[SearchQuery]
    searches: list[SearchQuery]
    sources: list[Source]
    warnings: list[str]
    retry_search: NotRequired[bool]
    proposal: NotRequired[PlanningProposal | None]
    validation_error: NotRequired[str]
    retry_generation: NotRequired[bool]
