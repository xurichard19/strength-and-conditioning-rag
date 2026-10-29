import asyncio
from functools import lru_cache
from time import monotonic

from langgraph.graph import END, START, StateGraph

from app.ai.workflows.plan.models import GENERATION_TIMEOUT_SECONDS
from app.ai.workflows.plan.nodes.context import context_node
from app.ai.workflows.plan.nodes.evaluate import evaluate_node
from app.ai.workflows.plan.nodes.generate import generate_node
from app.ai.workflows.plan.nodes.prepare import prepare_node
from app.ai.workflows.plan.nodes.search import search_node
from app.ai.workflows.plan.nodes.validate import validate_node
from app.ai.workflows.plan.state import PLAN_TIMEOUT_SECONDS, PlanState, WorkflowContext
from app.contracts import ClaimedReplanJob, PlanningProposal, ReplanContext
from app.services.planning import validate_proposal


@lru_cache
def build_plan_workflow():
    """compile shared planning with one research retry and one proposal repair"""
    graph = StateGraph(PlanState, context_schema=WorkflowContext)
    for name, node in {
        "context": context_node, "prepare": prepare_node, "search": search_node,
        "evaluate": evaluate_node, "generate": generate_node, "validate": validate_node,
    }.items():
        graph.add_node(name, node)

    graph.add_edge(START, "context")
    graph.add_edge("context", "prepare")
    graph.add_edge("prepare", "search")
    graph.add_edge("search", "evaluate")
    graph.add_conditional_edges("evaluate",
        lambda state: "search" if state["retry_search"] else "generate", ["search", "generate"])
    graph.add_edge("generate", "validate")
    graph.add_conditional_edges("validate",
        lambda state: "generate" if state["retry_generation"] else END, ["generate", END])

    return graph.compile()


async def generate_plan(claim: ClaimedReplanJob, context: ReplanContext) -> PlanningProposal:
    """
    generate a validated proposal without database writes or a user access token

    - **claim**: worker's job with fixed dates and expected input revision
    - **context**: authoritative athlete data loaded by the worker
    - **returns**: validated changes within three minutes; reserve one generation call
      before further research, allowing a repair only when another full call fits
    """
    if claim.effective_from > claim.effective_through:
        return validate_proposal(claim, context, PlanningProposal(
            before_ids=[], workouts=[], day_decisions=[]))

    deadline = monotonic() + PLAN_TIMEOUT_SECONDS
    async with asyncio.timeout(PLAN_TIMEOUT_SECONDS):
        result = await build_plan_workflow().ainvoke({
            "deadline": deadline, "research_deadline": deadline - GENERATION_TIMEOUT_SECONDS,
            "retries_left": 1, "repairs_left": 1,
            "sources": [], "searches": [], "warnings": [],
        }, context=WorkflowContext(claim, context), config={"recursion_limit": 20, "tags": ["Planning"]})

    return result["proposal"]
