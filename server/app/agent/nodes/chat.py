from langchain.chat_models import init_chat_model

chat_model = init_chat_model(
    'gpt-4o-mini',
    temperature=0.4
)

def chat_node(state) -> dict:
    return