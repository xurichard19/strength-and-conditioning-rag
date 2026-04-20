def build_prompt(query: str, retrieved_chunks: list[dict]) -> str:
    pass


def format_context(retrieved_data: dict) -> list[str]:
    """ format context in llm readable string """
    query_size = len(retrieved_data['ids'])
    formatted_chunks = []

    for i in range(query_size):
        metadata = retrieved_data['metadatas'][i]
        formatted_chunks.append(
            f"[source: {metadata['source']} | page: {metadata['page']}]\n"
            f"{retrieved_data['documents'][i]}"
            )
        
    return formatted_chunks


def build_system_instructions() -> str:
    pass