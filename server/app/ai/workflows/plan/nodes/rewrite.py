from langchain.chat_models import init_chat_model
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.config import get_settings
from app.ai.workflows.plan.prompts import REWRITE_SYSTEM_PROMPT


settings = get_settings()

rewrite_model = init_chat_model(
    "gpt-5-nano",
    api_key=settings.openai_api_key,
    reasoning_effort="minimal",
)


async def rewrite_node(state: dict) -> dict:
    """rewrite the latest user request for planning terminology and clarity"""

    latest_user_message = next(
        (
            message
            for message in reversed(state["messages"])
            if isinstance(message, HumanMessage)
        ),
        None,
    )

    response = await rewrite_model.ainvoke([
        SystemMessage(content=REWRITE_SYSTEM_PROMPT),
        latest_user_message,
    ])

    return {"prompt": response.content.strip()}
