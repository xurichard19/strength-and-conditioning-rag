from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Literal, NotRequired
from uuid import UUID

from langchain_core.messages import AnyMessage
from langgraph.graph import MessagesState
from pydantic import BaseModel, ConfigDict, model_validator

from app.contracts import ChatMode, Source


# -------------------- request context and server-owned budgets --------------------

@dataclass(frozen=True)
class WorkflowContext:
    """user credentials, conversation id and current message cursor for database reads"""

    user_id: str
    access_token: str = field(repr=False)
    conversation_id: UUID
    message_id: UUID
    message_created_at: datetime


@dataclass(frozen=True)
class ChatPolicy:
    retries: int
    results_per_provider: int
    deadline_seconds: int
    history_messages: int


CHAT_POLICIES: dict[ChatMode, ChatPolicy] = {
    "quick": ChatPolicy(retries=1, results_per_provider=5, deadline_seconds=150,
        history_messages=5),
    "deep": ChatPolicy(retries=3, results_per_provider=10, deadline_seconds=240,
        history_messages=10),
}


# -------------------- nano structured decisions --------------------

class SearchQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    query: str
    providers: Literal["none", "research", "web", "both"]

    @model_validator(mode="after")
    def require_search_text(self):
        if self.providers != "none" and not self.query.strip():
            raise ValueError("selected search providers require a nonblank query")
        return self


class ChatRoute(BaseModel):
    """search selection, user data scope and referenced dates"""

    model_config = ConfigDict(extra="forbid")

    search: SearchQuery
    user_context: Literal["none", "profile", "training"]
    start_date: date | None
    end_date: date | None


class EvidenceReview(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sufficient: bool
    gap: str
    next_search: SearchQuery


# -------------------- per-turn state --------------------

class ChatState(MessagesState):
    """messages, context, sources and search progress for one chat request"""

    mode: ChatMode
    history: NotRequired[list[AnyMessage]]
    local_today: NotRequired[date]
    route: NotRequired[ChatRoute]
    search: NotRequired[SearchQuery]
    user_data: NotRequired[dict[str, Any]]
    sources: NotRequired[list[Source]]
    searches: NotRequired[list[SearchQuery]]
    retries_left: int
    research_deadline: NotRequired[float]
    retry_search: NotRequired[bool]
    warnings: NotRequired[list[str]]
