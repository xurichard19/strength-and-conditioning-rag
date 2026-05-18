from pydantic import BaseModel, Field


class QueryRequest(BaseModel):
    text: str


class Source(BaseModel):
    id: str
    text: str
    source: str | None = None
    page: int | None = None


class QueryResponse(BaseModel):
    text: str
    sources: list[Source] = Field(default_factory=list)
