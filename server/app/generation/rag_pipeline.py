from app.generation.llm_client import generate_response
from app.generation.prompt_builder import build_prompt
from app.retrieval.reranker import rerank_chroma_results
from app.retrieval.vectordb import VectorDB

def answer_question(query: str, db: VectorDB) -> tuple[str, dict]:
    if not query: return

    context = db.query_system_docs(query)
    context = rerank_chroma_results(query, context)
    prompt = build_prompt(query, context)
    response = generate_response(prompt)
    return response, context