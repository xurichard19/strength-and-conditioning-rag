from langchain.agents import create_agent

from app.ai.search.tools import hybrid_search_research_docs, search_online
from app.ai.search.schemas import SearchResponse


search_agent = create_agent(
    model="gpt-5-mini",
    tools=[hybrid_search_research_docs, search_online],
    response_format=SearchResponse,
)


def search_sources(query: str) -> SearchResponse:
    """
    search sources using langchain agent, access to vector db and web

    - **query**: query string
    """

    return search_agent.invoke({'input': query})['output']