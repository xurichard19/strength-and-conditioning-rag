from dataclasses import dataclass

from langgraph.graph import MessagesState

from app.ai.services.search import Source


@dataclass(frozen=True)
class WorkflowContext:
    """request-scoped values that should not be stored in graph state"""

    user_id: str
    access_token: str
    conversation_id: str


class ChatState(MessagesState):
    """state shared between chat workflow nodes"""

    sources: list[Source]
    answer: str | None
