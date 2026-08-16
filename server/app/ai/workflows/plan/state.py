from dataclasses import dataclass

from langgraph.graph import MessagesState

from app.contracts import WorkoutPlan
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
    answer: WorkoutPlan | None
