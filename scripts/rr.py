from shingo.vectordb import VectorDB
from shingo.reranker import rerank_chroma_results

db = VectorDB()
context = db.query_system_docs("what exercises are best to improve rate of force development")

print(context.keys())