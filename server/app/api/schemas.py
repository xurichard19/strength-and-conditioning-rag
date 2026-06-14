from pydantic import BaseModel, Field


class Source(BaseModel):
    id: str
    text: str
    source: str | None = None
    page: int | None = None


class ChatRequest(BaseModel):
    text: str


class ChatResponse(BaseModel):
    text: str
    sources: list[Source] = Field(default_factory=list)


class PlanRequest(BaseModel):
    experience_level: str
    goal: str
    constraints: str


class PlanResponse(BaseModel):
    Mon: str
    Tue: str
    Wed: str
    Thu: str
    Fri: str
    Sat: str
    Sun: str
