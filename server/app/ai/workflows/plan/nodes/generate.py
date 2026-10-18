import asyncio
import json
from time import monotonic

from langchain_core.messages import HumanMessage, SystemMessage

from app.ai.services.search import format_sources_for_prompt
from app.ai.workflows.plan.models import GENERATION_TIMEOUT_SECONDS, generation_model
from app.ai.workflows.plan.prompts import PLAN_SYSTEM_PROMPT
from app.ai.workflows.plan.state import PlanState
from app.contracts import PlanningProposal


async def generate_node(state: PlanState) -> dict:
    """
    generate a structured proposal or repair one validation failure

    - **state**: fixed task and calendar, adequate evidence and optional repair feedback
    - **returns**: parsed proposal or a schema issue for the validator;
      incomplete responses are never accepted as successful generation
    """
    if monotonic() + GENERATION_TIMEOUT_SECONDS > state["deadline"]:
        raise TimeoutError("planning generation budget exhausted")
    packet = {"evidence": format_sources_for_prompt(state["sources"]), "warnings": state["warnings"]}
    if state.get("validation_error"):
        packet["validation_issue"] = state["validation_error"]
        packet["previous_proposal"] = state["proposal"].model_dump(mode="json") if state.get("proposal") else None
    async with asyncio.timeout(GENERATION_TIMEOUT_SECONDS):
        response = await generation_model().ainvoke([
            SystemMessage(content=PLAN_SYSTEM_PROMPT), HumanMessage(content=state["context_packet"]),
            HumanMessage(content=json.dumps(packet, ensure_ascii=False)),
        ])
    raw = response.get("raw") if isinstance(response, dict) else None
    if raw is None or raw.response_metadata.get("finish_reason") == "length":
        raise ValueError("planning generation did not complete a structured response")
    try:
        proposal = PlanningProposal.model_validate(response.get("parsed"))
    except ValueError:
        return {"proposal": None, "validation_error": "return a complete proposal matching the required schema"}
    return {"proposal": proposal, "validation_error": ""}
