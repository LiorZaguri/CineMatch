"""
This module defines dependencies used across the FastAPI application.
"""

from datetime import datetime, timezone
from typing import Annotated

from fastapi import Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from models.review import Review
from schemas.review import TmdbAuthorDetails, TmdbReview, sanitize_review_for_display
from schemas.tmdbmovie import StreamingService
from services.tmdb.tmdbservice import get_movie_reviews, get_movie_watch_providers

TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/original/"


def _review_sort_key(review: TmdbReview) -> datetime:
    created_at = review.created_at
    if created_at is None:
        return datetime.min.replace(tzinfo=timezone.utc)

    if created_at.tzinfo is None:
        return created_at.replace(tzinfo=timezone.utc)

    return created_at.astimezone(timezone.utc)


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


async def get_user_country_code(CF_IPCountry: Annotated[str | None, Header()] = None) -> str:
    """
    Dependency to retrieve the user's country code from the request headers.

    This dependency expects the API Gateway to have forwarded the user's
    country code via the 'CF-IPCountry' header. Defaults to 'US'.

    Args:
        CF_IPCountry (str | None): The country code extracted from the 'CF-IPCountry' header.

    Returns:
        str: The user's country code or 'US' if not present.
    """
    return CF_IPCountry or "US"


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
        author_details = rev.get("author_details", {}) if isinstance(rev.get("author_details"), dict) else {}
        all_reviews.append(TmdbReview(**{
            **rev,
            "id": None,
            "tmdb_id": tmdb_id,
            "rating": author_details.get("rating"),
            "content": sanitize_review_for_display(rev.get("content", "")),
            "author_details": {
                **author_details,
                "name": author_details.get("name") or rev.get("author"),
                "username": author_details.get("username") or rev.get("author"),
                "source": "tmdb",
            },
        }))

    # Map local database reviews to the TmdbReview schema
    for lr in local_reviews:
        all_reviews.append(TmdbReview(
            id=lr.id,
            tmdb_id=lr.tmdb_id,
            rating=float(lr.rating),
            content=sanitize_review_for_display(lr.content),
            created_at=lr.created_at,
            author_details=TmdbAuthorDetails(
                name="CineMatch User",
                rating=float(lr.rating),
                user_id=str(lr.user_id),
                source="local",
            ),
        ))
        
    all_reviews.sort(key=_review_sort_key, reverse=True)
    return all_reviews


async def _get_streaming_service(tmdb_id: int, country_code: str) -> list[StreamingService]:
    """
    Helper function to fetch streaming services (flatrate providers) for a movie 
    in a specific country.

    Args:
        tmdb_id (int): The unique TMDB identifier for the movie.
        country_code (str): The ISO 3166-1 country code.

    Returns:
        list[StreamingService]: A list of streaming services available in that country.
    """
    data = await get_movie_watch_providers(tmdb_id)
    if not data or "results" not in data:
        return []

    results = data.get("results", {})
    country_data = results.get(country_code.upper())

    if not country_data or "flatrate" not in country_data:
        return []

    streaming_services = []
    for provider in country_data.get("flatrate", []):
        name = provider.get("provider_name")
        logo_path = provider.get("logo_path")
        
        if name:
            # Construct full URL for logo if it exists
            full_logo_url = f"{TMDB_IMAGE_BASE_URL}{logo_path.lstrip('/')}" if logo_path else None
            streaming_services.append(StreamingService(name=name, logo_path=full_logo_url))
            
    return streaming_services
