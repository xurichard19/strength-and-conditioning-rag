from shingo.vectordb import VectorDB
from shingo.reranker import rerank_chroma_results

db = VectorDB()
query = "what exercises are best to improve rate of force development"
context = db.query_system_docs(query, 2)

print(type(context))

"""reranked = rerank_chroma_results(query, context)
print(reranked)"""