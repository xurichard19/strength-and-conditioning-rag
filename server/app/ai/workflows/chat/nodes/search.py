from langchain_core.messages import HumanMessage

from app.ai.services.search import search_sources
from app.ai.workflows.chat.state import ChatState


async def search_node(state: ChatState) -> dict:
    """search for evidence using the latest user message"""

    latest_user_message = next(
        (
            message
            for message in reversed(state["messages"])
            if isinstance(message, HumanMessage)
        ),
        None,
    )

    response = await search_sources(latest_user_message.content)
    
    return {"sources": response.results}
