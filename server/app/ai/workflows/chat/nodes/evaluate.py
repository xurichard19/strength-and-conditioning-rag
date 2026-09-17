import json
import logging
from time import monotonic

from langchain_core.messages import HumanMessage, SystemMessage

from app.ai.services.search import SEARCH_PROVIDERS, SEARCH_TIMEOUT_SECONDS, format_sources_for_prompt
from app.ai.workflows.chat.models import DECISION_TIMEOUT_SECONDS, decision_model
from app.ai.workflows.chat.prompts import EVALUATE_PROMPT
from app.ai.workflows.chat.state import ChatState, EvidenceReview, SearchQuery


logger = logging.getLogger(__name__)


def search_key(query: SearchQuery) -> str:
    """ignore casing and punctuation without discarding meaningful word order"""
    return " ".join("".join(char if char.isalnum() else " " for char in query.query.casefold()).split())


async def evaluate_node(state: ChatState) -> dict:
    """
    check whether the evidence is sufficient and decide whether to search again

    - **state**: messages, user context, sources, attempted queries, retries left and research deadline
    - **returns**: retry decision with a new query and reduced retry count, or warnings
      when stopping with incomplete evidence; skip query/provider pairs already searched
      and preserve time for answer generation
    """
    deadline = state.get("research_deadline", float("inf"))
    time_warning = "research time budget reached; evidence may be incomplete"
    if monotonic() + DECISION_TIMEOUT_SECONDS + SEARCH_TIMEOUT_SECONDS > deadline:
        return {"retry_search": False, "warnings": [*state.get("warnings", []), time_warning]}
    try:
        review = EvidenceReview.model_validate(await decision_model(EvidenceReview).ainvoke([
            SystemMessage(content=EVALUATE_PROMPT),
            *state.get("history", []), *state["messages"],
            HumanMessage(content=json.dumps({"evidence": format_sources_for_prompt(state.get("sources", [])),
                "user_data": state.get("user_data", {}), "warnings": state.get("warnings", []),
                "attempted_queries": [query.model_dump() for query in state["searches"]]}, ensure_ascii=False)),
        ]))
    except Exception as exc:
        logger.warning("evidence evaluation failed error_type=%s", type(exc).__name__)
        return {"retry_search": False, "warnings": [*state.get("warnings", []), "evidence adequacy could not be checked"]}
    next_query = review.next_search
    key = search_key(next_query)
    attempted = {(search_key(query), provider) for query in state["searches"] for provider in SEARCH_PROVIDERS[query.providers]}
    providers = [provider for provider in SEARCH_PROVIDERS[next_query.providers] if (key, provider) not in attempted]
    stop = review.sufficient or not review.gap.strip() or not key or not providers
    out_of_time = monotonic() + SEARCH_TIMEOUT_SECONDS > deadline
    if stop or out_of_time:
        warnings = state.get("warnings", [])
        if not review.sufficient:
            warnings = [*warnings, time_warning if out_of_time else review.gap or "no useful further search identified"]
        return {"retry_search": False, "warnings": warnings}
    next_query = next_query.model_copy(update={"providers": "both" if len(providers) == 2 else providers[0]})
    return {"retry_search": True, "search": next_query, "retries_left": state["retries_left"] - 1}
