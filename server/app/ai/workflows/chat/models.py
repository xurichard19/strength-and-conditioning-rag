from functools import lru_cache

from langchain_openai import ChatOpenAI
from pydantic import BaseModel

from app.ai.workflows.chat.state import ChatRoute
from app.config import get_ai_settings
from app.contracts import ChatMode


DECISION_TIMEOUT_SECONDS = 20
ANSWER_TIMEOUT_SECONDS = 75


@lru_cache
def decision_model(schema: type[BaseModel]):
    """ - **schema**: pydantic model defining the expected response
    - **returns**: client configured for structured responses matching the schema """
    return ChatOpenAI(
        model="gpt-6-luna", api_key=get_ai_settings().openai_api_key,
        reasoning_effort="none" if schema is ChatRoute else "low",
        max_tokens=1600, timeout=DECISION_TIMEOUT_SECONDS, max_retries=0,
        disable_streaming=True,
    ).with_structured_output(schema, method="json_schema", strict=True)


@lru_cache
def answer_model(mode: ChatMode = "quick") -> ChatOpenAI:
    """ cache the answer client for each chat mode

    - **mode**: quick or deep chat mode
    - **returns**: cached answer client for the requested reasoning mode """
    return ChatOpenAI(
        model="gpt-6-luna", api_key=get_ai_settings().openai_api_key,
        reasoning_effort="medium" if mode == "deep" else "low",
        max_tokens=6000, timeout=ANSWER_TIMEOUT_SECONDS, max_retries=0,
    )
