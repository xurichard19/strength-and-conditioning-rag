import asyncio
import json
from time import monotonic

from langchain_core.messages import HumanMessage, SystemMessage

from app.ai.services.search import SEARCH_PROVIDERS, SEARCH_TIMEOUT_SECONDS, format_sources_for_prompt
from app.ai.workflows.plan.models import DECISION_TIMEOUT_SECONDS, decision_model
from app.ai.workflows.plan.prompts import EVALUATE_PROMPT
from app.ai.workflows.plan.state import EvidenceReview, PlanState, SearchQuery


def search_key(query: SearchQuery) -> str:
    """ignore casing and punctuation while preserving meaningful word order"""
    return " ".join("".join(char if char.isalnum() else " " for char in query.query.casefold()).split())


async def evaluate_node(state: PlanState) -> dict:
    """
    require adequate evidence and retry only novel query/provider pairs within budget

    - **state**: shared athlete/calendar context, research question, evidence and remaining budget
    - **returns**: generation permission or one search retry; insufficient evidence
      raises rather than authorizing a prescription when the budget runs out
    """
    remaining = state["research_deadline"] - monotonic()
    if remaining <= 0:
        raise TimeoutError("planning evidence review budget exhausted")
    async with asyncio.timeout(min(DECISION_TIMEOUT_SECONDS, remaining)):
        review = EvidenceReview.model_validate(await decision_model(EvidenceReview).ainvoke([
            SystemMessage(content=EVALUATE_PROMPT),
            HumanMessage(content=state["context_packet"]),
            HumanMessage(content=json.dumps({"research_question": state["searches"][0].query,
                "evidence": format_sources_for_prompt(state["sources"]),
                "warnings": state["warnings"],
                "attempted_queries": [query.model_dump() for query in state["searches"]]}, ensure_ascii=False)),
        ]))
    if review.sufficient and state["sources"]:
        return {"retry_search": False}
    query = review.next_search
    if not state["retries_left"] or query is None:
        raise RuntimeError("planning evidence is insufficient after bounded research")
    # Widen the only retry beyond the collection that could not fill the gap.
    query = query.model_copy(update={"providers": "both"})
    attempted = {(search_key(item), provider) for item in state["searches"]
        for provider in SEARCH_PROVIDERS[item.providers]}
    providers = [provider for provider in SEARCH_PROVIDERS[query.providers]
        if (search_key(query), provider) not in attempted]
    if not providers:
        raise RuntimeError("planning evidence is insufficient; no new research query")
    if monotonic() + SEARCH_TIMEOUT_SECONDS + 1 + DECISION_TIMEOUT_SECONDS > state["research_deadline"]:
        raise TimeoutError("planning research cannot retry without consuming generation budget")
    query = query.model_copy(update={"providers": "both" if len(providers) == 2 else providers[0]})
    return {"retry_search": True, "search": query, "retries_left": state["retries_left"] - 1}
