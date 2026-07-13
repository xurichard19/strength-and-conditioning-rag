import json
import datetime
import sentry_sdk
from collections.abc import Iterable
from typing import Any

from app.api.schemas import PlanResponse
from app.rag.llm import generate_streamed_response, generate_structured_response
from app.rag.prompts import build_chat_messages, build_plan_messages
from app.rag.reranker import rerank_chroma_results
from app.rag.vector_store import VectorDB


def _generate_context(
    query: str,
    db: VectorDB,
    top_k: int | None = None,
    top_n: int | None = None
) -> dict:
    """ generate context from a given query with vector search """

    if not query.strip():
        raise ValueError("query text is required")

    with sentry_sdk.start_span(op="rag.retrieve", name="chroma query"):
        context = db.query_system_docs(query, top_k)

    with sentry_sdk.start_span(op="rag.rerank", name="cohere rerank"):
        context = rerank_chroma_results(query, context, top_n) if top_n else rerank_chroma_results(query, context)

    return context


def answer_question(query: str, db: VectorDB) -> tuple[Iterable[str], dict]:
    """answer single question with streamed response text"""

    with sentry_sdk.start_span(op="rag.context", name="generate context"):
        context = _generate_context(query, db)

    with sentry_sdk.start_span(op="rag.prompt", name="build prompt"):
        messages = build_chat_messages(query, context)

    return generate_streamed_response(messages), context


def generate_plan(date: datetime.date, goal: str, constraints: dict[str, Any], db: VectorDB) -> PlanResponse:
    """ build workout plan given parameters """

    if not goal.strip():
        raise ValueError("goal is required")

    constraints_json = json.dumps(constraints)

    with sentry_sdk.start_span(op="rag.context", name="generate context"):
        context = _generate_context(f"goal: {goal}, constraints: {constraints_json}", db, top_k=30, top_n=20)

    with sentry_sdk.start_span(op="rag.prompt", name="build prompt"):
        messages = build_plan_messages(date, goal, constraints_json, context)

    with sentry_sdk.start_span(op="ai.openai", name="openai structured plan"):
        return generate_structured_response(
            messages=messages,
            response_model=PlanResponse,
        )
