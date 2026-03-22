"""
This module defines Pydantic schemas for review summary-related operations.
"""

from pydantic import BaseModel, Field


class ReviewSummaryResponse(BaseModel):
    """
    Schema for the review summary response.
    
    Contains the TMDB ID and the aggregated AI-generated or cached summary text.
    """
    tmdb_id: int = Field(..., description="The TMDB ID of the movie")
    summary: str = Field(..., description="The AI-generated or cached summary")
