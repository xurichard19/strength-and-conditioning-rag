import cohere
from dotenv import load_dotenv
import os

load_dotenv()
client = cohere.ClientV2(api_key=os.getenv('COHERE_API_KEY'))


def rerank_chroma_results(query: str, context: dict):
    """ reranking for two stage retrieval """
    documents = context['documents']

    return client.rerank(
        model="rerank-v4.0-fast",
        query=query,
        documents=documents
    )