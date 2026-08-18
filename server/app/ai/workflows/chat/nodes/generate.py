from langchain.chat_models import init_chat_model
from langchain_core.messages import AIMessage, SystemMessage

from app.ai.services.search import format_sources_for_prompt
from app.ai.workflows.chat.prompts import CHAT_SYSTEM_PROMPT
from app.ai.workflows.chat.state import ChatState

from app.config import get_settings


settings = get_settings()

generation_model = init_chat_model(
    "gpt-5.6-luna",
    api_key=settings.openai_api_key,
)


async def generate_node(state: ChatState) -> dict:
    """generate the final answer from messages and retrieved evidence"""

    evidence = format_sources_for_prompt(state.get("sources", []))

    response = await generation_model.ainvoke([
        SystemMessage(content=CHAT_SYSTEM_PROMPT),
        SystemMessage(content=f"retrieved evidence:\n\n{evidence}"),
        *state["messages"],
    ])

    if not isinstance(response, AIMessage) or not isinstance(response.content, str):
        raise ValueError("chat generation did not return a text response")

    return {"messages": [response]}
