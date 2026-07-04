from langgraph.graph import MessagesState
from pydantic import BaseModel, Field
from typing import Literal, TypedDict

class Query(BaseModel):
    intent: Literal['chat', 'plan', 'out_of_scope'] #change? separate into two?
    query: str
    should_retrieve: bool = True

class Evidence(BaseModel):
    text: str
    source_type: Literal['db', 'web'] # CHANGE
    source: str
    url: str | None = None
    page: str | None = None
    score: float | None = None


class ChatState(MessagesState):
    """ graph state for chat service """
    user_id: str
    initial: str # initial query
    query: Query
    db_evidence: list[Evidence]
    web_evidence: list[Evidence] | None
    evidence: Evidence
    answer: str
    sources: list[dict]


class PlanState(TypedDict, total=False): # not all fields strictly necessary
    """ graph state for plan service """
    user_id: str
    initial: str # initial query
    query: Query
    db_evidence: list[Evidence]
    web_evidence: list[Evidence] | None
    evidence: Evidence
    answer: str
    sources: list[dict]
