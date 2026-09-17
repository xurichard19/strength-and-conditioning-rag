import asyncio
from zoneinfo import ZoneInfo

from langgraph.config import get_stream_writer
from langgraph.runtime import Runtime

from app.ai.services.conversations import load_history
from app.ai.workflows.chat.state import CHAT_POLICIES, ChatState, WorkflowContext
from app.db.supabase.profiles import get_profile

async def history_node(state: ChatState, runtime: Runtime[WorkflowContext]) -> dict:
    """
    load recent messages and the profile timezone concurrently

    - **state**: chat mode used to choose the history count
    - **runtime**: user credentials, conversation id and current message cursor
    - **returns**: chronological history and the current message's local date
    """

    get_stream_writer()({"type": "status", "stage": "fetching_user_context"})
    context = runtime.context
    history, profile = await asyncio.gather(
        load_history(context, limit=CHAT_POLICIES[state["mode"]].history_messages),
        asyncio.to_thread(get_profile, context.user_id, context.access_token),
    )
    if profile is None:
        raise ValueError("profile unavailable for chat context")
    return {"history": history,
        "local_today": context.message_created_at.astimezone(ZoneInfo(profile.timezone)).date()}
