""" defines the message contract """

from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class SearchRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=500)
    page: int = Field(default=1, ge=1)


class SearchFilters(BaseModel):
    with_genres: list[int] = Field(default_factory=list)
    primary_release_date_gte: str | None = None
    primary_release_date_lte: str | None = None
    vote_average_gte: float | None = Field(default=None, ge=0, le=10)
    vote_count_gte: int | None = Field(default=None, ge=0)
    with_original_language: str | None = None
    sort_by: str | None = None
    include_adult: bool = False
    page: int = Field(default=1, ge=1)
    query: str | None = None

    model_config = ConfigDict(extra="forbid")


class ParsedSearchResponse(BaseModel):
    mode: Literal["discover", "keyword"]
    filters: SearchFilters
    fallback_reason: str | None = None
