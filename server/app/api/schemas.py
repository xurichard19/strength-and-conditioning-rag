from pydantic import BaseModel, Field, field_validator


class Source(BaseModel):
    id: str
    text: str
    source: str | None = None
    page: int | None = None


class QueryRequest(BaseModel):
    text: str

    @field_validator("text")
    @classmethod
    def text_must_not_be_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("text is required")
        return stripped


class QueryResponse(BaseModel):
    text: str
    sources: list[Source] = Field(default_factory=list)


class PlanRequest(BaseModel):
    experience_level: str
    goal: str
    constraints: str

    @field_validator("experience_level", "goal", "constraints")
    @classmethod
    def fields_must_not_be_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("field is required")
        return stripped


class PlanResponse(BaseModel):
    Mon: str
    Tue: str
    Wed: str
    Thu: str
    Fri: str
    Sat: str
    Sun: str
