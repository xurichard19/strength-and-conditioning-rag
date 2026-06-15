from app.api.schemas import PlanResponse
from app.generation.llm_client import generate_response, generate_structured_response
from app.generation.prompt_builder import build_chat_prompt, build_plan_prompt
from app.retrieval.reranker import rerank_chroma_results
from app.retrieval.vectordb import VectorDB


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
    return rerank_chroma_results(query, context, top_n)


def answer_question(query: str, db: VectorDB) -> tuple[str, dict]:
    """ answer single question """

    context = _generate_context(query, db)
    prompt = build_chat_prompt(query, context)
    response = generate_response(prompt)

    return response, context


def generate_plan(experience_level: str, goal: str, constraints: str, db: VectorDB) -> PlanResponse:
    """ build workout plan given parameters """

    if not experience_level.strip() or not goal.strip() or not constraints.strip():
        raise ValueError("Experience level, goal, and constraints are required")

    context = _generate_context(f"goal: {goal}, needs: {constraints}", db, top_k=30, top_n=20)
    prompt = build_plan_prompt(experience_level, goal, constraints, context)

    return generate_structured_response(
        prompt=prompt,
        response_model=PlanResponse,
    )
