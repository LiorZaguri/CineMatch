"""
This module defines dependencies used across the FastAPI application.
"""

from typing import Annotated

from fastapi import Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from models.review import Review
from schemas.review import TmdbAuthorDetails, TmdbReview
from services.tmdb.tmdbservice import get_movie_reviews


async def get_user_id(x_user_id: Annotated[str | None, Header()] = None) -> str:
    """
    Dependency to retrieve the authenticated user's ID from the request headers.

    This dependency expects the API Gateway to have already authenticated the user
    and forwarded their ID via the 'X-User-Id' header.

    Args:
        x_user_id (str | None): The user ID extracted from the 'X-User-Id' header.

    Returns:
        str: The authenticated user's ID.

    Raises:
        HTTPException: 401 Unauthorized if the header is missing.
    """
    if x_user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User authentication header missing from Gateway.",
        )

    return x_user_id


async def _get_all_reviews(tmdb_id: int, db: AsyncSession) -> list[TmdbReview]:
    """
    Helper function to fetch and aggregate reviews from both TMDB and the local database.
    
    Args:
        tmdb_id (int): The unique TMDB identifier for the movie.
        db (AsyncSession): The database session.
        
    Returns:
        list[TmdbReview]: A list of aggregated reviews mapped to the TmdbReview schema.
    """
    # 1. Fetch reviews from TMDB
    tmdb_reviews_data = await get_movie_reviews(tmdb_id)
    raw_tmdb_reviews = tmdb_reviews_data.get("results", []) if tmdb_reviews_data else []
    
    # 2. Fetch reviews from the local database
    local_reviews_query = select(Review).where(Review.tmdb_id == tmdb_id).order_by(Review.created_at.desc())
    local_reviews_result = await db.execute(local_reviews_query)
    local_reviews = local_reviews_result.scalars().all()
    
    all_reviews: list[TmdbReview] = []

    # Map TMDB reviews to the TmdbReview schema
    for rev in raw_tmdb_reviews:
        # TMDB review items don't typically include the movie ID, so we inject it
        all_reviews.append(TmdbReview(**{**rev, "tmdb_id": tmdb_id}))

    # Map local database reviews to the TmdbReview schema
    for lr in local_reviews:
        all_reviews.append(TmdbReview(
            tmdb_id=lr.tmdb_id,
            content=lr.content,
            author_details=TmdbAuthorDetails(
                name="Local User",
                rating=float(lr.rating)
            )
        ))
        
    return all_reviews
