from app.generation.llm_client import generate_response
from app.generation.prompt_builder import build_chat_prompt, build_plan_prompt
from app.retrieval.reranker import rerank_chroma_results
from app.retrieval.vectordb import VectorDB


def _generate_context(query: str, db: VectorDB) -> dict:
    if not query.strip():
        raise ValueError("Query text is required")

    context = db.query_system_docs(query)
    return rerank_chroma_results(query, context)


def answer_question(query: str, db: VectorDB) -> tuple[str, dict]:
    context = _generate_context(query, db)
    prompt = build_chat_prompt(query, context)
    response = generate_response(prompt)

    return response, context


def generate_plan(experience_level: str, goal: str, constraints: str, db: VectorDB) -> str:
    if not experience_level.strip() or not goal.strip() or not constraints.strip():
        raise ValueError("Experience level, goal, and constraints are required")

    context = _generate_context(f"goal: {goal}, needs: {constraints}", db)
    prompt = build_plan_prompt(experience_level, goal, constraints, context)

    return generate_response(prompt)
