from app.ai.services.conversations import get_conversation_history
from app.ai.workflows.chat.state import ChatState

async def history_node(state: ChatState) -> dict:
    """load bounded message history from current conversation"""

    pass