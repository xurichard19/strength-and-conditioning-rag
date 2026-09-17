from functools import lru_cache

from langchain_openai import ChatOpenAI
from pydantic import BaseModel

from app.config import get_settings


DECISION_TIMEOUT_SECONDS = 20
ANSWER_TIMEOUT_SECONDS = 75


@lru_cache
def decision_model(schema: type[BaseModel]):
    """
    cache a nano client for routing and evidence evaluation

    - **schema**: pydantic model defining the expected response
    - **returns**: client configured for structured responses matching the schema
    """
    return ChatOpenAI(
        model="gpt-5-nano", api_key=get_settings().openai_api_key,
        reasoning_effort="minimal", max_tokens=1600, timeout=DECISION_TIMEOUT_SECONDS, max_retries=0,
        disable_streaming=True,
    ).with_structured_output(schema, method="json_schema", strict=True)


@lru_cache
def answer_model():
    """cache the model client used to generate chat answers"""
    return ChatOpenAI(
        model="gpt-5.6-luna", api_key=get_settings().openai_api_key,
        max_tokens=6000, timeout=ANSWER_TIMEOUT_SECONDS, max_retries=0,
    )
