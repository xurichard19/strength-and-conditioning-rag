from collections.abc import AsyncIterator
from typing import Any

from langgraph.graph import END, START, StateGraph

from app.ai.workflows.chat.nodes.generate import generate_node
from app.ai.workflows.chat.nodes.search import search_node
from app.ai.workflows.chat.state import ChatState, WorkflowContext


# future dependencies:
# load_history_node
# chat_controller
# persist_turn_node
def build_chat_workflow():
    """build langgraph chat workflow"""

    graph = StateGraph(ChatState, context_schema=WorkflowContext)

    # graph.add_node("load_history", load_history_node)
    graph.add_node("search", search_node)
    graph.add_node("generate", generate_node)
    # graph.add_node("assistant", chat_controller)
    # graph.add_node("persist_turn", persist_turn_node)

    graph.add_edge(START, "search")
    graph.add_edge("search", "generate")
    graph.add_edge("generate", END)

    # future controller route; search_sources will be one of its tools
    # graph.add_edge(START, "load_history")
    # graph.add_edge("load_history", "assistant")
    # graph.add_edge("assistant", "persist_turn")
    # graph.add_edge("persist_turn", END)

    return graph.compile()


async def stream_chat(
    graph,
    *,
    message: str,
    context: WorkflowContext,
) -> AsyncIterator[dict[str, Any]]:
    """stream public chat events from the generation node"""

    sources = []

    async for part in graph.astream(
        {"messages": [{"role": "user", "content": message}]},
        context=context,
        stream_mode=["messages", "updates"],
        version="v2",
    ):
        if part["type"] == "messages":
            chunk, metadata = part["data"]
            if metadata.get("langgraph_node") != "generate" or not chunk.content:
                continue
            if isinstance(chunk.content, str):
                yield {"type": "text", "delta": chunk.content}

        elif part["type"] == "updates" and "search" in part["data"]:
            sources = part["data"]["search"].get("sources", [])

    yield {
        "type": "sources",
        "sources": [source.model_dump() for source in sources],
    }
    yield {"type": "done"}
