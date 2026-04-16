""" defines the message contract """

from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field


class SearchRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=500)


class SearchFilters(BaseModel):
    certification: str | None = Field(default=None, description="Exact certification rating to match, such as PG-13.")
    language: str | None = Field(default=None, description="Response language for localized TMDB fields, usually an ISO 639-1 code like en-US.")
    original_language: str | None = Field(default=None, description="ISO 639-1 language code to filter by original language ")
    reference_title: str | None = Field(default=None, description="Reference movie or franchise title used to find similar movies.")
    with_genres: list[int] = Field(default_factory=list, description="Genre IDs that must be included in the results.")
    without_genres: list[int] = Field(default_factory=list, description="Genre IDs that must be excluded from the results.")
    with_cast: list[int | str] = Field(default_factory=list, description="Cast member person IDs or names that should appear in the movie.")
    with_crew: list[int | str] = Field(default_factory=list, description="Crew member person IDs or names that should be associated with the movie.")
    with_keywords: list[int | str] = Field(default_factory=list, description="Keyword IDs or names that should be included in the movie results.")
    year: int | None = Field(default=None, ge=1874, description="General release year to match.")
    primary_release_year: int | None = Field(default=None, ge=1874, description="Primary release year to match.")
    primary_release_date_gte: str | None = Field(default=None, description="Earliest allowed primary release date in YYYY-MM-DD format.")
    primary_release_date_lte: str | None = Field(default=None, description="Latest allowed primary release date in YYYY-MM-DD format.")
    release_date_gte: str | None = Field(default=None, description="Earliest allowed release date in YYYY-MM-DD format.")
    release_date_lte: str | None = Field(default=None, description="Latest allowed release date in YYYY-MM-DD format.")
    with_runtime_gte: int | None = Field(default=None, ge=0, description="Minimum runtime in minutes.")
    with_runtime_lte: int | None = Field(default=None, ge=0, description="Maximum runtime in minutes.")
    vote_average_gte: float | None = Field(default=None, ge=0, le=10, description="Minimum average TMDB user rating.")
    vote_average_lte: float | None = Field(default=None, ge=0, le=10, description="Maximum average TMDB user rating.")
    vote_count_gte: int | None = Field(default=None, ge=0, description="Minimum number of TMDB votes required.")
    vote_count_lte: int | None = Field(default=None, ge=0, description="Maximum number of TMDB votes allowed.")
    sort_by: str | None = Field(default=None, description="TMDB discover sort order, such as popularity.desc or vote_average.desc.")
    include_adult: bool = Field(default=False, description="Whether adult titles are allowed in results.")
    query: str | None = Field(default=None, description="Fallback keyword query when the prompt cannot be mapped confidently to discover filters.")

    model_config = ConfigDict(extra="forbid")


class ParsedSearchResponse(BaseModel):
    mode: Literal["discover", "keyword"]
    filters: SearchFilters
    fallback_reason: str | None = None


class RerankUserProfile(BaseModel):
    liked_genres: list[str] = Field(default_factory=list)
    disliked_genres: list[str] = Field(default_factory=list)
    moods: list[str] = Field(default_factory=list)
    languages: list[str] = Field(default_factory=list)
    eras: list[str] = Field(default_factory=list)
    runtime: str | None = None
    discovery_mode: str | None = None
    selected_titles: list[str] = Field(default_factory=list)


class RerankCandidate(BaseModel):
    id: int
    title: str = Field(min_length=1)
    overview: str = ""
    release_date: str | None = None
    vote_average: float | None = None
    original_language: str | None = None


class RerankRequest(BaseModel):
    type: Literal["rerank_recommendations"] = "rerank_recommendations"
    user_profile: RerankUserProfile
    reduced_filters: dict[str, Any] = Field(default_factory=dict)
    candidates: list[RerankCandidate] = Field(min_length=1, max_length=40)
    max_results: int = Field(default=20, ge=1, le=40)


class RerankResponse(BaseModel):
    ranked_ids: list[int] = Field(default_factory=list)
    match_scores: dict[str, int] = Field(default_factory=dict)
    fallback_reason: str | None = None
