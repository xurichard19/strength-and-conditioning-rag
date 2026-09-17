import asyncio

from langchain_core.messages import AIMessage, HumanMessage

from app.db.supabase.messages import get_recent_messages


async def load_history(context, limit: int = 10) -> list[HumanMessage | AIMessage]:
    """
    load recent conversation messages before the current message

    - **context**: user credentials, conversation id and current message id/timestamp
    - **limit**: total user and assistant messages to load; 5 quick, 10 deep
    - **returns**: full messages in chronological order
    """
    rows = await asyncio.to_thread(
        get_recent_messages, context.user_id, context.access_token, limit,
        conversation_id=context.conversation_id,
        before_created_at=context.message_created_at, before_id=context.message_id,
    )
    return [(HumanMessage if row.role == "user" else AIMessage)(content=row.content) for row in rows]
