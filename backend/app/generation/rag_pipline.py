from llm_client import generate_response
from prompt_builder import build_prompt
from retrieval.reranker import rerank_chroma_results
from retrieval.vectordb import VectorDB

def answer_question(query: str, db: VectorDB) -> str:
    if not query: return

    context = db.query_system_docs(query)
    context = rerank_chroma_results(query, context)
    prompt = build_prompt(query, context)
    response = generate_response(prompt)
    return response