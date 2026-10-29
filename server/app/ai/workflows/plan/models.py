from functools import lru_cache

from langchain_openai import ChatOpenAI
from pydantic import BaseModel

from app.config import get_settings
from app.contracts import PlanningProposal


DECISION_TIMEOUT_SECONDS = 15
GENERATION_TIMEOUT_SECONDS = 120


@lru_cache
def decision_model(schema: type[BaseModel]):
    """cache bounded research decisions using the same model family as generation"""
    return ChatOpenAI(
        model="gpt-5.6-luna", api_key=get_settings().openai_api_key,
        reasoning_effort="low", max_tokens=4000, timeout=DECISION_TIMEOUT_SECONDS,
        max_retries=0, disable_streaming=True,
    ).with_structured_output(schema, method="json_schema", strict=True)


@lru_cache
def generation_model():
    """cache structured generation with enough output for three weeks of prescriptions"""
    return ChatOpenAI(
        model="gpt-5.6-luna", api_key=get_settings().openai_api_key,
        reasoning_effort="low", max_tokens=24000, timeout=GENERATION_TIMEOUT_SECONDS, max_retries=0,
        disable_streaming=True,
    ).with_structured_output(PlanningProposal, method="json_schema", strict=True, include_raw=True)
