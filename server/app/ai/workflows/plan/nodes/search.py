import asyncio
from time import monotonic

from app.ai.services.search import SEARCH_TIMEOUT_SECONDS, merge_sources, search_sources
from app.ai.workflows.plan.models import DECISION_TIMEOUT_SECONDS
from app.ai.workflows.plan.state import RESULTS_PER_PROVIDER, PlanState


async def search_node(state: PlanState) -> dict:
    """retrieve bounded evidence while preserving time for review and generation"""
    remaining = state["research_deadline"] - monotonic() - DECISION_TIMEOUT_SECONDS
    if remaining <= 0:
        raise TimeoutError("planning search cannot consume evidence review budget")
    query = state["search"]
    async with asyncio.timeout(min(SEARCH_TIMEOUT_SECONDS + 1, remaining)):
        response = await search_sources(query.query, providers=query.providers, top_k=RESULTS_PER_PROVIDER)
    return {"sources": merge_sources(state["sources"], response.results),
        "searches": [*state["searches"], query], "warnings": [*state["warnings"], *response.warnings]}
