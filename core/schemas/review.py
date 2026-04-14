"""
This module defines Pydantic schemas for Review-related operations.
It includes schemas for creating new reviews and reading review data.
"""

import re
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

REVIEW_EXTERNAL_LINK_PATTERN = re.compile(
    r"\b(?:https?://\S+|www\.\S+|(?:[a-z0-9-]+\.)+(?:com|net|org|io|co|tv|app|dev|info|biz|me|gg|xyz)(?:/\S*)?)",
    re.IGNORECASE,
)
REVIEW_BAD_WORDS_PATTERN = re.compile(
    r"\b(?:asshole|bastard|bitch|bullshit|cunt|dick|douchebag|fuck|fucker|fucking|motherfucker|piss(?:ed)?\s*off|shit|slut|whore)\b",
    re.IGNORECASE,
)


def sanitize_review_content(value: str) -> str:
    return re.sub(r"\s+", " ", REVIEW_EXTERNAL_LINK_PATTERN.sub(" ", value)).strip()


def redact_review_profanity(value: str) -> str:
    return REVIEW_BAD_WORDS_PATTERN.sub(lambda match: "*" * len(match.group(0)), value)


def sanitize_review_for_display(value: str) -> str:
    return redact_review_profanity(sanitize_review_content(value))


class ReviewPayloadBase(BaseModel):
    # The numeric rating (1-10)
    rating: float = Field(ge=1, le=10, description="The numeric rating (1-10)")

    # The textual content of the review (10-1000 chars)
    content: str = Field(description="The textual content of the review (10-1000 chars)")

    @field_validator('content', mode='before')
    @classmethod
    def sanitize_content(cls, v: str) -> str:
        if not isinstance(v, str):
            raise ValueError('Content must be a string')
        return sanitize_review_content(v)

    @field_validator('content')
    @classmethod
    def content_must_be_allowed(cls, v: str) -> str:
        """
        Validates that the content is not just whitespace, is long enough after sanitization,
        and does not contain blocked profanity.
        """
        if not v.strip():
            raise ValueError('Content cannot be only whitespace')
        if len(v) < 10:
            raise ValueError('Content must be at least 10 characters long')
        if len(v) > 1000:
            raise ValueError('Content must be at most 1000 characters long')
        if REVIEW_BAD_WORDS_PATTERN.search(v):
            raise ValueError('Content contains inappropriate language')
        return v


class ReviewCreate(ReviewPayloadBase):
    """
    Schema for creating a new review.
    Validates that the content is not empty and the rating is within range.
    """
    # The TMDB ID of the movie being reviewed
    tmdb_id: int


class ReviewUpdate(ReviewPayloadBase):
    """
    Schema for updating an existing review.
    """
    pass


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
    author_details: "TmdbAuthorDetails | None" = None

    # Configuration to enable Pydantic to read data from ORM models
    model_config = ConfigDict(from_attributes=True)


class TmdbAuthorDetails(BaseModel):
    """
    Detailed information about the author of a TMDB review.
    """
    name: str | None = Field(None, description="The name of the review author")
    username: str | None = Field(None, description="The username of the review author")
    rating: float | None = Field(None, description="The rating given by the author (0-10.0)")
    avatar_path: str | None = Field(None, description="TMDB or remote avatar path for the review author")
    avatar_url: str | None = Field(None, description="Resolved avatar URL for the review author")
    user_id: str | None = Field(None, description="Local CineMatch user id for gateway enrichment")
    source: str | None = Field(None, description="Review source, e.g. tmdb or local")


class TmdbReview(BaseModel):
    """
    Schema representing a movie review fetched from TMDB.
    """
    id: int | None = Field(None, description="Optional review id for local CineMatch reviews")
    tmdb_id: int = Field(..., description="The unique TMDB ID for the movie")
    rating: float | None = Field(None, description="Normalized review rating")
    content: str = Field(..., description="The full text content of the review")
    created_at: datetime | None = Field(None, description="Optional timestamp for the review")
    author_details: TmdbAuthorDetails = Field(..., description="Details about the author of the review")


class TmdbReviewsResponse(BaseModel):
    """
    Schema representing all reviews for a movie fetched from TMDB.
    """
    tmdb_id: int = Field(..., description="The unique TMDB ID for the movie")
    reviews: list[TmdbReview] = Field(default_factory=list, description="A list of reviews for the movie")
