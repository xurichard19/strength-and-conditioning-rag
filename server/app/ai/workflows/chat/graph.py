from collections.abc import Callable
from typing import Any

from langgraph.graph import END, START, StateGraph

from app.ai.workflows.chat.state import ChatState, WorkflowContext


def build_chat_workflow(
    *,
    load_history_node: Callable[..., dict[str, Any]],
    persist_turn_node: Callable[..., dict[str, Any]],
    # chat_controller: Callable[..., dict[str, Any]],
):
    """build the chat workflow"""

    graph = StateGraph(ChatState, context_schema=WorkflowContext)

    graph.add_node("load_history", load_history_node)
    # graph.add_node("assistant", chat_controller)
    graph.add_node("persist_turn", persist_turn_node)

    graph.add_edge(START, "load_history")

    # graph.add_edge("load_history", "assistant")
    # graph.add_edge("assistant", "persist_turn")

    # temporary bypass until the controller and its supabase tools are ready
    graph.add_edge("load_history", "persist_turn")

    graph.add_edge("persist_turn", END)

    return graph.compile()
