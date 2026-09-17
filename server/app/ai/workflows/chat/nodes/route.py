from langchain_core.messages import SystemMessage
from langgraph.config import get_stream_writer

from app.ai.workflows.chat.models import decision_model
from app.ai.workflows.chat.prompts import ROUTE_PROMPT
from app.ai.workflows.chat.state import ChatRoute, ChatState


async def route_node(state: ChatState) -> dict:
    """
    choose search providers, a query and user data to retrieve

    - **state**: current message, conversation history and user's local date
    - **returns**: routing decision and initial search query
    """
    get_stream_writer()({"type": "status", "stage": "thinking"})
    route = ChatRoute.model_validate(await decision_model(ChatRoute).ainvoke([
        SystemMessage(content=ROUTE_PROMPT + f"\nUser's current local date: {state['local_today']:%Y-%m-%d (%A)}"),
        *state.get("history", []), *state["messages"],
    ]))
    return {"route": route, "search": route.search}
