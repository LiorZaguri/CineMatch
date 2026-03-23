"""
This module defines Pydantic schemas for Review-related operations.
It includes schemas for creating new reviews and reading review data.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ReviewCreate(BaseModel):
    """
    Schema for creating a new review.
    Validates that the content is not empty and the rating is within range.
    """
    # The TMDB ID of the movie being reviewed
    tmdb_id: int
   
    # The numeric rating (1-10)
    rating: float = Field(ge=1, le=10, description="The numeric rating (1-10)")

    # The textual content of the review (10-1000 chars)
    content: str = Field(min_length=10, max_length=1000, description="The textual content of the review (10-1000 chars)")

    @field_validator('content')
    @classmethod
    def content_must_not_be_empty(cls, v: str) -> str:
        """
        Validates that the content is not just whitespace.
        """
        if not v.strip():
            raise ValueError('Content cannot be only whitespace')
        return v


class ReviewRead(BaseModel):
    """
    Schema for the review response sent back to the frontend.
    """
    # Unique identifier of the review in the database
    id: int
    # The rating given by the user (1-10)
    rating: int
    # The text content of the review
    content: str
    # Timestamp when the review was submitted
    created_at: datetime

    # Configuration to enable Pydantic to read data from ORM models
    model_config = ConfigDict(from_attributes=True)


class TmdbAuthorDetails(BaseModel):
    """
    Detailed information about the author of a TMDB review.
    """
    name: str | None = Field(None, description="The name of the review author")
    rating: float | None = Field(None, description="The rating given by the author (0-10.0)")


class TmdbReview(BaseModel):
    """
    Schema representing a movie review fetched from TMDB.
    """
    tmdb_id: int = Field(..., description="The unique TMDB ID for the movie")
    content: str = Field(..., description="The full text content of the review")
    author_details: TmdbAuthorDetails = Field(..., description="Details about the author of the review")


class TmdbReviewsResponse(BaseModel):
    """
    Schema representing all reviews for a movie fetched from TMDB.
    """
    tmdb_id: int = Field(..., description="The unique TMDB ID for the movie")
    reviews: list[TmdbReview] = Field(default_factory=list, description="A list of reviews for the movie")

