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
    rating: int = Field(ge=1, le=10, description="The numeric rating (1-10)")

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