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
response = generate_chat_response(agent, "create a picture of a cat")
for i in response["messages"]:
    print("\n\n")
    print([i])


"""for token in generate_streamed_response(model, "how do i back cookie"):
    print(token, end="", flush=True)"""

#  from root: python -m app.rag.devtest

# see https://docs.langchain.com/oss/python/langchain/models#structured-output for structured



"""

1) create nodes in langchain
2) wire up with langgraph


SCRAPPED: outdated, we want agentic action
two workflows: chat and plan

(chat only) pull conversation history from supabase if exists, trim context window to constant size
(1) query rewriting langchain model accepts incoming query, rewrites chat prompts to compact context, rewrites plan prompts to structure as a plan
(2) central agent with tools [rag, rerank, online search], agent should run rag and online search in parallel and optionally rerank when under threshold
    (2.1) rag is initialized with: read documents and produce langchain documents, run text splitter, open langchain chroma client
    (see https://reference.langchain.com/python/langchain-chroma/vectorstores/Chroma), save to chroma, create rrf ranking
    (2.2) rag is called like: given the rewritten prompt, we create a search strategy, run hybrid search on chroma client, return results,
    see https://reference.langchain.com/python/langchain-chroma/vectorstores/Chroma/hybrid_search
    (2.3) rerank tool uses cohere directly, we should use langchain if possible
    (2.4) online search is supported with tavily, we wrap into a tool, description should make it clear to reject irrelevant searches
    (2.5) we should bundle all sources of information once complete (rag takes precedence, cut online search if taking too long) and provide to final models
(3) we have two different final models, one for chat one for plan, the model should stream a conversational response for chat and the other should
produce a structured output for plan
(4) sources should be passed up along with the response
"""