import cohere
from dotenv import load_dotenv
import os

load_dotenv()
client = cohere.ClientV2(api_key=os.getenv('COHERE_API_KEY'))


def rerank_chroma_results(query: str, context: dict, top_n=5) -> dict:
    """ reranking for two stage retrieval """
    documents = context['documents']

    rerank_response = client.rerank(
        model="rerank-v4.0-fast",
        query=query,
        documents=documents,
        top_n=top_n
    )

    indices = []
    for result in rerank_response.results:
        indices.append(result.index)

    reranked = {key: None for key in context}
    for key in context.keys():
        if not context[key]: continue

        reranked[key] = []
        for idx in indices:
            reranked[key].append(context[key][idx])
    
    return reranked
