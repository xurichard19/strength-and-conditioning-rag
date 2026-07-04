from langchain.chat_models import init_chat_model

plan_model = init_chat_model(
    'gpt-4o-mini',
    temperature=0.4
)

def plan_node(state) -> dict:
    return