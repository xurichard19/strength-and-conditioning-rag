import logging
from typing import TypeVar

from openai import OpenAI
from pydantic import BaseModel

from app.core.config import get_settings


settings = get_settings()
client = OpenAI(api_key=settings.openai_api_key)
logger = logging.getLogger(__name__)

StructuredResponse = TypeVar("StructuredResponse", bound=BaseModel)


class LLMGenerationError(RuntimeError):
    """ raised when the llm provider fails or returns invalid structured output """


def generate_response(messages: list[dict], temperature: float = 0.4) -> str:
    try:
        response = client.responses.create(
            model="gpt-4o-mini",
            input=messages,
            temperature=temperature,
        )
        return response.output_text
    except Exception:
        logger.exception("llm text generation failed")
        return "Sorry, something went wrong while generating a response."


def generate_structured_response(
    messages: list[dict],
    response_model: type[StructuredResponse],
    temperature: float = 0.4,
) -> StructuredResponse:
    try:
        response = client.responses.parse(
            model="gpt-4o-mini",
            input=messages,
            temperature=temperature,
            text_format=response_model,
        )
    except Exception as exc:
        logger.exception("llm structured generation failed model=%s", response_model.__name__)
        raise LLMGenerationError("structured llm generation failed") from exc

    if response.output_parsed is None:
        logger.warning(
            "llm structured generation returned empty parsed output model=%s",
            response_model.__name__,
        )
        raise LLMGenerationError("structured llm output was empty")

    return response.output_parsed


# implement after creating chat history ui
def generate_from_messages(messages: list[dict]) -> str:
    pass
