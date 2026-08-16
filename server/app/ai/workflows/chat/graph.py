from collections.abc import AsyncIterator
from typing import Any

from langgraph.graph import END, START, StateGraph

from app.ai.workflows.chat.nodes.generate import generate_node
from app.ai.workflows.chat.nodes.search import search_node
from app.ai.workflows.chat.state import ChatState, WorkflowContext


def build_chat_workflow():
    """build langgraph chat workflow"""

    graph = StateGraph(ChatState, context_schema=WorkflowContext)

    # graph.add_node("load_history", load_history_node)
    graph.add_node("search", search_node)
    graph.add_node("generate", generate_node)

    graph.add_edge(START, "search")
    graph.add_edge("search", "generate")
    graph.add_edge("generate", END)

    return graph.compile()


async def stream_chat(
    graph,
    message: str,
    context: WorkflowContext,
) -> AsyncIterator[dict[str, Any]]:
    """
    stream the compiled chat graph and translate langgraph output into public chat events

    - **graph**: compiled langgraph chat workflow
    - **message**: current user message used to initialize graph state
    - **context**: request-scoped user, authentication, and conversation values

    yields dictionaries with one of these shapes:
    - `{"type": "text", "delta": str}`
    - `{"type": "sources", "sources": list[dict]}`
    - `{"type": "done"}`
    """

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
