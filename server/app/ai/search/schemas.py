from pydantic import BaseModel, Field, model_validator
from typing import Literal


class Source(BaseModel):
    title: str | None = None
    doi: str | None = None
    url: str | None = None
    source_type: Literal['research', 'web']
    content: str = Field(min_length=1)
    score: float | None = None

    @model_validator(mode="after")
    def check_source_identifier(self):
        if self.source_type == 'research':
            if not self.doi:
                raise ValueError("doi is required for research sources")
            if self.url:
                raise ValueError("url should not be provided for research sources")
        elif self.source_type == 'web':
            if not self.url:
                raise ValueError("url is required for web sources")
            if self.doi:
                raise ValueError("doi should not be provided for web sources")
        return self


class SearchResponse(BaseModel):
    results: list[Source] = Field(default_factory=list)
