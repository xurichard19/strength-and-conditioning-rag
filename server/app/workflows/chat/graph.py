from langgraph.graph import StateGraph, START, END

from app.agent.state import ChatState

# graph nodes
from app.agent.nodes.history import history_node
from app.agent.nodes.rewrite import chat_rewrite_node
from app.agent.nodes.retrieval import retrieval_node
from app.agent.nodes.web_search import web_search_node
from app.agent.nodes.rerank import rerank_node
from app.agent.nodes.aggregate import aggregate_node
from app.agent.nodes.chat import chat_node

def route_after_rewrite(state: ChatState) -> str:
    """ skip retrieval for greetings, small talk, or out-of-scope requests """
    if not state['query'].should_retrieve:
        return 'chat'
    
    return 'retrieval'


def retrieval_validation(state: ChatState) -> str:
    """ route to rerank only when retrieval results need extra cleanup """
    evidence = state.get('db_evidence', [])
    if len(evidence) > 12:
        return 'rerank'
    
    return 'web_search'

def build_workflow():
    graph = StateGraph(ChatState)

    graph.add_node('history', history_node)
    graph.add_node('rewrite', chat_rewrite_node)
    graph.add_node('retrieval', retrieval_node)
    graph.add_node('web_search', web_search_node)
    graph.add_node('rerank', rerank_node)
    graph.add_node('aggregate', aggregate_node)
    graph.add_node('chat', chat_node)

    graph.add_edge(START, 'history')
    graph.add_edge('history', 'rewrite')

    graph.add_conditional_edges(
        'rewrite',
        route_after_rewrite,
        {
            'retrieval': 'retrieval',
            'chat': 'chat',
        }
    )

    graph.add_conditional_edges(
        'retrieval',
        retrieval_validation,
        {
            'rerank': 'rerank',
            'web_search': 'web_search',
        }
    )

    graph.add_edge('rerank', 'web_search')
    graph.add_edge('web_search', 'aggregate')
    graph.add_edge('aggregate', 'chat')
    graph.add_edge('chat', END)

    return graph.compile()
