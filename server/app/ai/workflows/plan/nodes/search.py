from app.ai.services.search import search_sources
from app.ai.workflows.plan.state import PlanState


async def search_node(state: PlanState) -> dict:
    """search for evidence using the rewritten planning prompt"""

    response = await search_sources(state["prompt"])

    return {"sources": response.results}
