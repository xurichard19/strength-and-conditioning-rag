from shingo.llm_client import generate_response
from shingo.prompt_builder import build_prompt
from shingo.reranker import rerank_chroma_results
from shingo.vectordb import VectorDB


def answer_question(query: str, db: VectorDB) -> str:
    if not query: return

    context = db.query_system_docs(query)
    context = rerank_chroma_results(query, context)
    prompt = build_prompt(query, context)
    response = generate_response(prompt)
    return response