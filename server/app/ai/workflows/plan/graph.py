from langgraph.graph import END, START, StateGraph

from app.ai.workflows.plan.state import PlanState, WorkflowContext
from app.ai.workflows.plan.nodes.rewrite import rewrite_node
from app.ai.workflows.plan.nodes.search import search_node
from app.ai.workflows.plan.nodes.generate import generate_node


def build_plan_workflow():
    """build langgraph workout planning workflow"""

    graph = StateGraph(PlanState, context_schema=WorkflowContext)

    graph.add_node("rewrite", rewrite_node)
    graph.add_node("search", search_node)
    graph.add_node("generate", generate_node)

    graph.add_edge(START, "rewrite")
    graph.add_edge("rewrite", "search")
    graph.add_edge("search", "generate")
    graph.add_edge("generate", END)

    return graph.compile()
