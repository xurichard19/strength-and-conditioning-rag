from langgraph.graph import END, START, StateGraph

from app.ai.workflows.plan.state import PlanState, WorkflowContext

def build_plan_workflow():
    """build langgraph workout planning workflow"""

    graph = StateGraph(PlanState, context_schema=WorkflowContext)