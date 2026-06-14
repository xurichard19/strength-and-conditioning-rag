from app.generation.llm_client import generate_response
from app.generation.prompt_builder import build_chat_prompt, build_plan_prompt
from app.retrieval.reranker import rerank_chroma_results
from app.retrieval.vectordb import VectorDB


def _generate_context(query: str, db: VectorDB) -> dict:
    if not query: return

    context = db.query_system_docs(query)
    return rerank_chroma_results(query, context)


def answer_question(query: str, db: VectorDB) -> tuple[str, dict]:
    """ answer singular question, no history, expand later """
    if not query: return

    context = _generate_context(query, db)

    prompt = build_chat_prompt(query, context)
    response = generate_response(prompt)

    return response, context


def generate_plan(experience_level: str, goal: str, constraints: str, db: VectorDB) -> str:
    if not experience_level or not goal or not constraints: return

    context = _generate_context(f"goal: {goal}, needs: {constraints}", db)

    prompt = build_plan_prompt(experience_level, goal, constraints, context)
    response = generate_response(prompt)

    # MISSING STEP: PARSE GENERATED INTO JSON?

    return response