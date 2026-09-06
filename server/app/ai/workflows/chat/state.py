from dataclasses import dataclass
from typing import NotRequired

from langgraph.graph import MessagesState

from app.contracts import Source


@dataclass(frozen=True)
class WorkflowContext:
    """request-scoped values that should not be stored in graph state"""

    user_id: str
    access_token: str


class ChatState(MessagesState):
    """state shared between chat workflow nodes"""

    sources: NotRequired[list[Source]]
