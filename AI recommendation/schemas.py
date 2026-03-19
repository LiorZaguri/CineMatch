""" defines the message contract """

from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class SearchRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=500)


class SearchFilters(BaseModel):
    certification: str | None = Field(default=None, description="Exact certification rating to match, such as PG-13.")
    certification_gte: str | None = Field(default=None, description="Lowest allowed certification in the selected certification country.")
    certification_lte: str | None = Field(default=None, description="Highest allowed certification in the selected certification country.")
    certification_country: str | None = Field(default=None, description="Country code used when applying certification filters, such as US.")
    include_video: bool = Field(default=False, description="Whether to include movies marked by TMDB as videos.")
    language: str | None = Field(default=None, description="Response language for localized TMDB fields, usually an ISO 639-1 code like en-US.")
    region: str | None = Field(default=None, description="Region code used to refine release date behavior and regional availability.")
    with_genres: list[int] = Field(default_factory=list, description="Genre IDs that must be included in the results.")
    without_genres: list[int] = Field(default_factory=list, description="Genre IDs that must be excluded from the results.")
    with_keywords: list[int] = Field(default_factory=list, description="Keyword IDs that should be included in matching movies.")
    without_keywords: list[int] = Field(default_factory=list, description="Keyword IDs that should be excluded from matching movies.")
    with_companies: list[int] = Field(default_factory=list, description="Production company IDs that should be associated with the movie.")
    with_cast: list[int] = Field(default_factory=list, description="Cast member person IDs that should appear in the movie.")
    with_crew: list[int] = Field(default_factory=list, description="Crew member person IDs that should be associated with the movie.")
    with_people: list[int] = Field(default_factory=list, description="Person IDs that can match either cast or crew.")
    year: int | None = Field(default=None, ge=1874, description="General release year to match.")
    primary_release_year: int | None = Field(default=None, ge=1874, description="Primary release year to match.")
    primary_release_date_gte: str | None = Field(default=None, description="Earliest allowed primary release date in YYYY-MM-DD format.")
    primary_release_date_lte: str | None = Field(default=None, description="Latest allowed primary release date in YYYY-MM-DD format.")
    release_date_gte: str | None = Field(default=None, description="Earliest allowed release date in YYYY-MM-DD format.")
    release_date_lte: str | None = Field(default=None, description="Latest allowed release date in YYYY-MM-DD format.")
    with_release_type: list[int] = Field(default_factory=list, description="TMDB release type IDs to include, such as theatrical or digital.")
    with_runtime_gte: int | None = Field(default=None, ge=0, description="Minimum runtime in minutes.")
    with_runtime_lte: int | None = Field(default=None, ge=0, description="Maximum runtime in minutes.")
    vote_average_gte: float | None = Field(default=None, ge=0, le=10, description="Minimum average TMDB user rating.")
    vote_average_lte: float | None = Field(default=None, ge=0, le=10, description="Maximum average TMDB user rating.")
    vote_count_gte: int | None = Field(default=None, ge=0, description="Minimum number of TMDB votes required.")
    vote_count_lte: int | None = Field(default=None, ge=0, description="Maximum number of TMDB votes allowed.")
    with_original_language: str | None = Field(default=None, description="Original movie language code, usually ISO 639-1 like en.")
    with_origin_country: list[str] = Field(default_factory=list, description="Origin country codes to match, usually ISO 3166-1 values like US.")
    watch_region: str | None = Field(default=None, description="Country code used for watch provider availability.")
    with_watch_providers: list[int] = Field(default_factory=list, description="TMDB watch provider IDs that should offer the movie.")
    with_watch_monetization_types: list[str] = Field(default_factory=list, description="Allowed monetization types such as flatrate, free, ads, or rent.")
    sort_by: str | None = Field(default=None, description="TMDB discover sort order, such as popularity.desc or vote_average.desc.")
    include_adult: bool = Field(default=False, description="Whether adult titles are allowed in results.")
    query: str | None = Field(default=None, description="Fallback keyword query when the prompt cannot be mapped confidently to discover filters.")

    model_config = ConfigDict(extra="forbid")


class ParsedSearchResponse(BaseModel):
    mode: Literal["discover", "keyword"]
    filters: SearchFilters
    fallback_reason: str | None = None
