from langgraph.graph import END, START, StateGraph

from app.ai.workflows.plan.state import PlanState, WorkflowContext
from app.ai.workflows.plan.nodes.rewrite import rewrite_node

def build_plan_workflow():
    """build langgraph workout planning workflow"""

    graph = StateGraph(PlanState, context_schema=WorkflowContext)

    # graph.add_node("load_history", load_history_node)
    graph.add_node("rewrite", rewrite_node)