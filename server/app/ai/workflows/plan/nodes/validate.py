from time import monotonic

from langgraph.runtime import Runtime

from app.ai.workflows.plan.models import GENERATION_TIMEOUT_SECONDS
from app.ai.workflows.plan.state import PlanState, WorkflowContext
from app.services.planning import validate_proposal


async def validate_node(state: PlanState, runtime: Runtime[WorkflowContext]) -> dict:
    """
    enforce scope and coverage without granting the model new permissions

    - **state**: generated proposal, optional schema issue and remaining repair budget
    - **runtime**: authoritative claim and original context for deterministic validation
    - **returns**: normalized proposal or one repair with bounded feedback; otherwise raises
    """
    try:
        if state["proposal"] is None:
            raise ValueError(state["validation_error"])
        proposal = validate_proposal(runtime.context.claim, runtime.context.data, state["proposal"])
    except ValueError as exc:
        if not state["repairs_left"] or monotonic() + GENERATION_TIMEOUT_SECONDS > state["deadline"]:
            raise ValueError("planning proposal failed validation within its repair budget") from exc
        feedback = str(exc)
        if len(feedback) > 4000:
            feedback = feedback[:3900] + "\nadditional validation feedback omitted; check the complete proposal"
        return {"retry_generation": True, "repairs_left": state["repairs_left"] - 1,
            "validation_error": feedback}
    return {"proposal": proposal, "retry_generation": False, "validation_error": ""}
