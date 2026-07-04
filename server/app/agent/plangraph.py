from langgraph.graph import StateGraph, START, END

from app.agent.state import PlanState
from app.agent.nodes.rewrite import plan_rewrite_node

def build_workflow():
    graph = StateGraph(PlanState)

    graph.add_node('rewrite', plan_rewrite_node)

    graph.add_edge(START, 'rewrite')