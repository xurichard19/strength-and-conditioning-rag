from app.agent.state import ChatState

def history_node(state: ChatState) -> dict:
    """ retrieve conversation history from supabase """
    messages = None #get from supabase tables

    return {'messages': messages}