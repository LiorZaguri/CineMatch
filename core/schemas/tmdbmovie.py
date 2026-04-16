"""
This module defines Pydantic schemas for mapping TMDB (The Movie Database) API responses.
It includes models for individual movie details, paginated lists of movies, and a 
dashboard view aggregating multiple movie categories.
"""

from typing import List, Optional

from pydantic import BaseModel, Field

from .review import TmdbReview


class TmdbMovie(BaseModel):
    """
    Represents a single movie object as returned by the TMDB API.
    """
    id: int = Field(..., description="Unique TMDB identifier")
    
    original_language: str = Field(..., description="ISO 639-1 language code (e.g., 'en')")
    
    original_title: str = Field(..., description="Original title in the source language")
    
    overview: str = Field(..., description="Short plot summary")

    genre_ids: List[int] = Field(
        default_factory=list,
        description="TMDB genre identifiers used for lightweight list responses",
    )
    
    poster_path: Optional[str] = Field(None, description="The path to the poster image on TMDB's servers")

    backdrop_path: Optional[str] = Field(None, description="The path to the backdrop image on TMDB's servers")
    
    release_date: Optional[str] = Field(None, description="Release date in YYYY-MM-DD format")

    runtime: Optional[int] = Field(None, description="Movie runtime in minutes")
    
    title: str = Field(..., description="English (or requested language) title")
    
    vote_average: float = Field(..., description="Average user rating (0-10)")

    ai_match_score: Optional[int] = Field(
        None,
        ge=0,
        le=100,
        description="AI confidence score for how well this movie matches the user's profile",
    )

    trailer: Optional[str] = Field(None, description="The URL to the movie's trailer")


class TmdbMovieList(BaseModel):
    """
    Represents a paginated list of movies returned by TMDB search or discovery endpoints.
    """
    page: int = Field(..., description="Current page number")
    
    results: List[TmdbMovie] = Field(..., description="List of movies on the current page")
    
    total_pages: int = Field(..., description="Total number of pages available")
    
    total_results: int = Field(..., description="Total number of results across all pages")


class MovieDashboard(BaseModel):
    """
    Aggregated view containing lists of movies for different categories.
    Used to populate the main dashboard of the application.
    """
    now_playing: List[TmdbMovie] = Field(..., description="Movies currently in theaters")
    
    popular: List[TmdbMovie] = Field(..., description="Movies trending now")
    
    upcoming: List[TmdbMovie] = Field(..., description="Movies coming soon")
    
    top_rated: List[TmdbMovie] = Field(..., description="Highest rated movies of all time")
    
    errors: List[str] = Field(default_factory=list, description="Error indicator for each list")


class StreamingService(BaseModel):
    """
    Represents a streaming service provider.
    """
    name: str = Field(..., description="The name of the streaming service")
    logo_path: Optional[str] = Field(None, description="The path to the provider's logo")


class ProductionCompany(BaseModel):
    id: int = Field(..., description="Unique identifier for the production company")
    name: str = Field(..., description="The production company name")


class ProductionCountry(BaseModel):
    iso_3166_1: str = Field(..., description="ISO 3166-1 country code")
    name: str = Field(..., description="The production country name")


class SpokenLanguage(BaseModel):
    english_name: str = Field(..., description="Language name in English")
    iso_639_1: Optional[str] = Field(None, description="ISO 639-1 language code")
    name: str = Field(..., description="Localized language name")


class CastMember(BaseModel):
    """
    Represents a cast member of a movie.
    """
    id: int = Field(..., description="Unique identifier for the cast member")
    known_for_department: str = Field(..., description="The department they are known for (e.g., Acting)")
    name: str = Field(..., description="The name of the cast member")
    profile_path: Optional[str] = Field(None, description="Path to the profile image")
    character: str = Field(..., description="The character they played in the movie")
    order: int = Field(..., description="The order in the cast list")


class MovieDetailWithReviews(TmdbMovie):
    """
    Extended movie schema that includes a list of user reviews.
    Used when fetching detailed information for a specific movie.
    """
    reviews: List[TmdbReview] = Field(default_factory=list, description="List of reviews associated with this movie")

    summary: Optional[str] = Field(None, description="Optional AI-generated summary of the reviews")
    
    streaming_services: List[StreamingService] = Field(default_factory=list, description="List of streaming services available for the movie")
    
    cast: List[CastMember] = Field(default_factory=list, description="List of top billed cast members for the movie")

    production_companies: List[ProductionCompany] = Field(default_factory=list, description="Production companies attached to the movie")

    production_countries: List[ProductionCountry] = Field(default_factory=list, description="Production countries attached to the movie")

    spoken_languages: List[SpokenLanguage] = Field(default_factory=list, description="Spoken languages used in the movie")

    country_code: str = Field("US", description="The country code used for localized content")
