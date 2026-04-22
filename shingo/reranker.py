import cohere

client = cohere.ClientV2()


def rerank_chroma_results(query: str, context: dict):
    """ reranking for two stage retrieval """
    documents = context['documents']

    return client.rerank(
        model="rerank-v4.0-fast",
        query=query,
        documents=documents
    )