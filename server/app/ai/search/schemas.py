from pydantic import BaseModel


class Source(BaseModel):
    doi: str = None
    url: str = None
    content: str


class SearchResponse(BaseModel):
    results: list[Source]