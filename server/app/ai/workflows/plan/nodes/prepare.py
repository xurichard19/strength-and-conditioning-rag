import asyncio
from time import monotonic

from langchain_core.messages import HumanMessage, SystemMessage

from app.ai.workflows.plan.models import DECISION_TIMEOUT_SECONDS, decision_model
from app.ai.workflows.plan.prompts import PREPARE_PROMPT
from app.ai.workflows.plan.state import PlanState, SearchQuery


async def prepare_node(state: PlanState) -> dict:
    """
    choose research from fixed planning permissions and athlete context

    - **state**: sanitized planning task, onboarding and calendar
    - **returns**: a bounded query and allow-listed research providers
    """
    remaining = state["research_deadline"] - monotonic()
    if remaining <= 0:
        raise TimeoutError("planning research budget exhausted")
    async with asyncio.timeout(min(DECISION_TIMEOUT_SECONDS, remaining)):
        search = SearchQuery.model_validate(await decision_model(SearchQuery).ainvoke([
            SystemMessage(content=PREPARE_PROMPT), HumanMessage(content=state["context_packet"]),
        ]))
    return {"search": search.model_copy(update={"providers": "research"})}
