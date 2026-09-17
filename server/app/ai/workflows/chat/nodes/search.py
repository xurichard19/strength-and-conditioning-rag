from langgraph.config import get_stream_writer

from app.ai.services.search import merge_sources, search_sources
from app.ai.workflows.chat.state import CHAT_POLICIES, ChatState


async def search_node(state: ChatState) -> dict:
    """
    run one search round and merge its results with earlier sources

    - **state**: query, providers, chat mode and previous search results
    - **returns**: deduplicated sources, attempted queries and warnings
    """

    get_stream_writer()({"type": "status", "stage": "researching"})
    query = state["search"]
    response = await search_sources(query.query, providers=query.providers,
        top_k=CHAT_POLICIES[state["mode"]].results_per_provider)
    return {"sources": merge_sources(state.get("sources", []), response.results),
        "searches": [*state.get("searches", []), query],
        "warnings": list(dict.fromkeys([*state.get("warnings", []), *response.warnings]))}
