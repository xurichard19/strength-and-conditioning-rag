from langchain.agents import create_agent

from app.ai.search.tools import hybrid_search_research_docs, search_online


search_agent = create_agent(
    model="gpt-5-mini",
    tools=[hybrid_search_research_docs, search_online]
)