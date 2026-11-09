import asyncio
from time import monotonic

from app.ai.services.search import SEARCH_PROVIDERS, SEARCH_TIMEOUT_SECONDS, merge_sources, search_sources
from app.ai.workflows.plan.models import DECISION_TIMEOUT_SECONDS
from app.ai.workflows.plan.state import RESULTS_PER_PROVIDER, PlanState


async def search_node(state: PlanState) -> dict:
    """retrieve provider-bounded evidence in parallel, preserving time for review"""
    remaining = state["research_deadline"] - monotonic() - DECISION_TIMEOUT_SECONDS
    if remaining <= 0:
        raise TimeoutError("planning search cannot consume evidence review budget")
    query = state["search"]
    async with asyncio.timeout(min(SEARCH_TIMEOUT_SECONDS + 1, remaining)):
        responses = await asyncio.gather(*(search_sources(query.query, providers=provider,
            top_k=RESULTS_PER_PROVIDER[provider]) for provider in SEARCH_PROVIDERS[query.providers]))
    return {"sources": merge_sources(state["sources"], [source for response in responses for source in response.results]),
        "searches": [*state["searches"], query],
        "warnings": list(dict.fromkeys([*state["warnings"],
            *(note for response in responses for note in response.warnings)]))}
