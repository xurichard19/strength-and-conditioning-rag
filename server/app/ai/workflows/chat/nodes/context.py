from langgraph.config import get_stream_writer
from langgraph.runtime import Runtime

from app.ai.services.user_context import load_user_context
from app.ai.workflows.chat.state import ChatState, WorkflowContext


async def context_node(state: ChatState, runtime: Runtime[WorkflowContext]) -> dict:
    """
    load onboarding and training data selected by the router

    - **state**: selected data scope, date range and user's local date
    - **runtime**: request context with user credentials
    - **returns**: user_data containing the retrieved context as a dict
    """
    get_stream_writer()({"type": "status", "stage": "fetching_user_context"})
    return {"user_data": await load_user_context(runtime.context, state["route"], state["local_today"])}
