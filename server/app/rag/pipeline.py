import json
import datetime
from typing import Any

from app.api.schemas import PlanResponse
from app.rag.llm import generate_response, generate_structured_response
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

    context = db.query_system_docs(query, top_k)
    return rerank_chroma_results(query, context, top_n) if top_n else rerank_chroma_results(query, context)


def answer_question(query: str, db: VectorDB) -> tuple[str, dict]:
    """ answer single question """

    context = _generate_context(query, db)
    messages = build_chat_messages(query, context)
    response = generate_response(messages)

    return response, context


def generate_plan(date: datetime.date, goal: str, constraints: dict[str, Any], db: VectorDB) -> PlanResponse:
    """ build workout plan given parameters """

    if not goal.strip():
        raise ValueError("goal is required")

    constraints_json = json.dumps(constraints)

    context = _generate_context(f"goal: {goal}, constraints: {constraints_json}", db, top_k=30, top_n=20)
    messages = build_plan_messages(date, goal, constraints_json, context)

    return generate_structured_response(
        messages=messages,
        response_model=PlanResponse,
    )
