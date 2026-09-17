import asyncio
from collections.abc import AsyncIterator
from time import monotonic
from typing import Any

from langgraph.graph import END, START, StateGraph

from app.ai.workflows.chat.models import ANSWER_TIMEOUT_SECONDS
from app.ai.workflows.chat.nodes.generate import generate_node
from app.ai.workflows.chat.nodes.search import search_node
from app.ai.workflows.chat.nodes.load_history import history_node
from app.ai.workflows.chat.nodes.context import context_node
from app.ai.workflows.chat.nodes.evaluate import evaluate_node
from app.ai.workflows.chat.nodes.route import route_node
from app.ai.workflows.chat.state import CHAT_POLICIES, ChatState, WorkflowContext
from app.contracts import ChatMode


def retrieval_nodes(state: ChatState) -> list[str]:
    """select independent reads to run together, or generate when neither is needed"""
    nodes = []
    if state["route"].user_context != "none":
        nodes.append("context")
    if state["search"].providers != "none":
        nodes.append("search")
    return nodes or ["generate"]


def after_retrieval(state: ChatState) -> str:
    """evaluate only after a search and while another search round is available"""
    return "evaluate" if state["search"].providers != "none" and state["retries_left"] > 0 else "generate"


def build_chat_workflow():
    """compile the chat workflow with parallel optional reads and bounded search retries"""

    graph = StateGraph(ChatState, context_schema=WorkflowContext)

    graph.add_node("history", history_node)
    graph.add_node("route", route_node)
    graph.add_node("context", context_node)
    graph.add_node("search", search_node)
    graph.add_node("evaluate", evaluate_node)
    graph.add_node("generate", generate_node)

    graph.add_edge(START, "history")
    graph.add_edge("history", "route")
    graph.add_conditional_edges("route", retrieval_nodes, ["context", "search", "generate"])
    # parallel reads finish in the same graph step; their shared successor runs once
    graph.add_conditional_edges("context", after_retrieval, ["evaluate", "generate"])
    graph.add_conditional_edges("search", after_retrieval, ["evaluate", "generate"])
    graph.add_conditional_edges("evaluate",
        lambda state: "search" if state["retry_search"] else "generate", ["search", "generate"])
    graph.add_edge("generate", END)

    return graph.compile()


async def stream_chat(
    graph,
    message: str,
    context: WorkflowContext,
    mode: ChatMode = "quick",
) -> AsyncIterator[dict[str, Any]]:
    """
    run the chat workflow and stream progress, answer text and sources

    - **graph**: compiled chat workflow
    - **message**: current user message
    - **context**: user credentials, conversation id and current message id/timestamp
    - **mode**: quick or deep; sets history count, result count, retries and timeout
    - **yields**: status events with a stage, final-answer text events with a delta,
      a sources event with source records, then a done event
    """

    sources = []

    policy = CHAT_POLICIES[mode]
    async with asyncio.timeout(policy.deadline_seconds):
        async for part in graph.astream(
            {"messages": [{"role": "user", "content": message}], "mode": mode,
                "retries_left": policy.retries,
                "research_deadline": monotonic() + policy.deadline_seconds - ANSWER_TIMEOUT_SECONDS,
                "sources": [], "searches": [], "warnings": []},
            context=context, config={"recursion_limit": 20,
                "tags": ["Quick Chat" if mode == "quick" else "Deep Research Chat"]},
            stream_mode=["messages", "updates", "custom"], version="v2",
        ):
            if part["type"] == "messages":
                chunk, metadata = part["data"]
                if metadata.get("langgraph_node") == "generate" and isinstance(chunk.content, str) and chunk.content:
                    yield {"type": "text", "delta": chunk.content}
            elif part["type"] == "custom" and isinstance(part["data"], dict):
                if part["data"].get("type") == "status" and part["data"].get("stage") in (
                    "fetching_user_context", "researching", "thinking",
                ):
                    yield {"type": "status", "stage": part["data"]["stage"]}
            elif part["type"] == "updates" and "search" in part["data"]:
                sources = part["data"]["search"].get("sources", [])

    yield {
        "type": "sources",
        "sources": [source.model_dump() for source in sources],
    }
    yield {"type": "done"}
