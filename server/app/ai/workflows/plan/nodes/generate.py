from langchain.chat_models import init_chat_model
from langchain_core.messages import HumanMessage, SystemMessage

from app.contracts import PlannedWorkoutPlan
from app.ai.services.search import format_sources_for_prompt
from app.ai.workflows.plan.prompts import PLAN_SYSTEM_PROMPT
from app.ai.workflows.plan.state import PlanState

from app.config import get_settings


settings = get_settings()

generation_model = init_chat_model(
    "gpt-5.6-luna",
    api_key=settings.openai_api_key,
).with_structured_output(PlannedWorkoutPlan)


async def generate_node(state: PlanState) -> dict:
    """generate a structured plan from the rewritten request and evidence"""

    evidence = format_sources_for_prompt(state.get("sources", []))

    response = await generation_model.ainvoke([
        SystemMessage(content=PLAN_SYSTEM_PROMPT),
        SystemMessage(content=f"retrieved evidence:\n\n{evidence}"),
        HumanMessage(content=state["prompt"]),
    ])

    if not isinstance(response, PlannedWorkoutPlan):
        raise ValueError("plan generation failed to return a valid workout plan")

    return {
        "answer": response,
    }
