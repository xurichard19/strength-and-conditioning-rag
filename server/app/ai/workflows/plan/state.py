from dataclasses import dataclass
from typing import NotRequired

from langgraph.graph import MessagesState

from app.contracts import PlannedWorkoutPlan, Source


@dataclass(frozen=True)
class WorkflowContext:
    """request-scoped values that should not be stored in graph state"""

    user_id: str
    access_token: str


class PlanState(MessagesState):
    """state shared between planning workflow nodes"""

    prompt: NotRequired[str]
    sources: NotRequired[list[Source]]
    answer: NotRequired[PlannedWorkoutPlan]
