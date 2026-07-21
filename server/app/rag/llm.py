import logging
from typing import TypeVar

from openai import OpenAI
from pydantic import BaseModel

from app.config import get_settings


settings = get_settings()
client = OpenAI(api_key=settings.openai_api_key)
logger = logging.getLogger(__name__)
MODEL = "gpt-5-mini"

StructuredResponse = TypeVar("StructuredResponse", bound=BaseModel)


def generate_response(messages: list[dict]) -> str:
    try:
        response = client.responses.create(
            model=MODEL,
            input=messages,
        )
        return response.output_text
    except Exception:
        logger.exception("llm text generation failed")
        return "Sorry, something went wrong while generating a response."


def generate_streamed_response(messages: list[dict]):
    try:
        stream_manager = client.responses.stream(
            model=MODEL,
            input=messages,
        )

        with stream_manager as stream:
            for event in stream:
                if event.type == "response.output_text.delta":
                    yield event.delta
    except Exception:
        logger.exception("llm streamed text generation failed")
        yield "Sorry, something went wrong while generating a response."


def generate_structured_response(
    messages: list[dict],
    response_model: type[StructuredResponse],
) -> StructuredResponse:
    try:
        response = client.responses.parse(
            model=MODEL,
            input=messages,
            text_format=response_model,
        )
    except Exception as exc:
        logger.exception("llm structured generation failed model=%s", response_model.__name__)
        raise RuntimeError("structured llm generation failed") from exc

    if response.output_parsed is None:
        logger.warning(
            "llm structured generation returned empty parsed output model=%s",
            response_model.__name__,
        )
        raise RuntimeError("structured llm output was empty")

    return response.output_parsed


# implement after creating chat history ui
def generate_from_messages(messages: list[dict]) -> str:
    pass
