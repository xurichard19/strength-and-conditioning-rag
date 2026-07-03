from langchain.agents import create_agent
from langchain.chat_models import init_chat_model
from langchain.tools import tool

# typing
from langchain_openai.chat_models.base import ChatOpenAI

from functools import lru_cache

from app.core.config import get_settings



settings = get_settings()



def get_model(model_name='gpt-4o-mini', temperature=0.5) -> ChatOpenAI:
    return init_chat_model(
        model=model_name,
        api_key=settings.openai_api_key,
        temperature=temperature
    )


@tool
def get_location() -> str:
    """ get user location """
    return f"the user is from sunnyvale, ca"

@tool
def get_weather(location: str) -> str:
    """ get weather in location """
    return f"it is sunny today in {location}"


def get_agent(model, tools: list[tool]):
    return create_agent(
        model=model,
        tools=tools
    )


def generate_chat_response(model, query: str):
    """ generate response """
    return model.invoke(
        {"messages": [
            {
                "role": "user",
                "content": query
            }
        ]}
    )


def generate_streamed_response(model, query: str):
    """ generated streamed response """
    for chunk in model.stream(query):
        yield chunk.text



model = get_model()
agent = get_agent(model, [get_weather, get_location])
response = generate_chat_response(agent, "hey hows the weather in london and paris")
for i in response["messages"]:
    print("\n\n")
    print([i])


"""for token in generate_streamed_response(model, "how do i back cookie"):
    print(token, end="", flush=True)"""

#  from root: python -m app.rag.langchain_wrapped

# see https://docs.langchain.com/oss/python/langchain/models#structured-output for structured