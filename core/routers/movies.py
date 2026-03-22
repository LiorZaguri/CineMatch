"""
Movie Router Module.

This module defines the API endpoints for movie-related operations, including
fetching movie lists (popular, upcoming, etc.), retrieving movie details,
and managing user reviews.
"""

import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from db.db import get_db
from models.review import Review
from schemas.Ai import AISearchRequest, AISearchResponse, AISearchSuccess, AISearchFallback
from schemas.review import ReviewCreate, ReviewRead
from schemas.tmdbmovie import MovieDashboard, MovieDetailWithReviews, TmdbMovieList, TmdbMovie
from services.rabbitmq.rpc import recommendation_rpc
from services.tmdb.tmdbservice import get_movie_details, get_now_playing_movies, get_popular_movies, get_top_rated_movies, get_upcoming_movies, discover_movies

from .dependencies import get_user_id

router = APIRouter(
    prefix="/api/movies",
    tags=["movies & reviews"],
    responses={404: {"description": "Not found"}},
)


@router.post("/review/",response_model=ReviewRead ,status_code=status.HTTP_201_CREATED)
async def add_review(
    payload: ReviewCreate,
    user_id: Annotated[str, Depends(get_user_id)], 
    db: AsyncSession = Depends(get_db)):
    """
    Creates a new review for a movie.

    This endpoint accepts a review payload, associates it with the authenticated user,
    and persists it to the database. It enforces a unique constraint to ensure
    a user can only review a specific movie once.

    Args:
        payload (ReviewCreate): The review data (TMDB ID, rating, content).
        user_id (str): The authenticated user's ID, extracted from headers.
        db (AsyncSession): The database session dependency.

    Returns:
        Review: The created review object with generated fields (id, created_at).

    Raises:
        HTTPException: 400 Bad Request if the user has already reviewed the movie.
    """

    # Create the ORM model from the input payload
    new_review = Review(
        tmdb_id=payload.tmdb_id,
        user_id=user_id,
        rating=payload.rating,
        content=payload.content
    ) 

    db.add(new_review)
    try:
        # Commit the transaction to save the review
        await db.commit()
        # Refresh the instance to retrieve DB-generated fields
        await db.refresh(new_review)
        return new_review
    except IntegrityError:
        # Handle duplicate reviews (UniqueConstraint violation)
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="You have already reviewed this movie."
        )
    

@router.get("/dashboard/", response_model=MovieDashboard)
async def get_movie_dashboard():
    """
    Retrieves and aggregates movie data for the application dashboard.

    This endpoint concurrently fetches four categories of movies from TMDB:
    - Now Playing
    - Popular
    - Upcoming
    - Top Rated

    It employs a fail-safe mechanism where failure in one category does not 
    block the others. Errors for specific categories are collected and 
    returned in the response payload.

    Returns:
        MovieDashboard: An object containing movie lists for each category 
                        and a list of error messages for any failed requests.
    """

    # Execute all 4 API calls in parallel using asyncio.gather
    results = await asyncio.gather(
        get_now_playing_movies(page=1),
        get_popular_movies(page=1),
        get_upcoming_movies(page=1),
        get_top_rated_movies(page=1),
        return_exceptions=True 
    )

    errors = []

    def process_result(res, category_name):
        if isinstance(res, Exception) or res is None:
            errors.append(f"Failed to load {category_name}")
            return []
        if isinstance(res, dict) and "results" in res:
            return res["results"]
        return []

    # Map results to the Dashboard schema
    return MovieDashboard(
        now_playing=process_result(results[0], "now_playing"),
        popular=process_result(results[1], "popular"),
        upcoming=process_result(results[2], "upcoming"),
        top_rated=process_result(results[3], "top_rated"),
        errors=errors
    )


@router.get("/popular/", response_model=TmdbMovieList)
async def get_popular(page: int = Query(1, ge=1)):
    """Fetches a paginated list of popular movies."""
    data = await get_popular_movies(page=page)
    if not data:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="TMDB unreachable")
    return data


@router.get("/now-playing/", response_model=TmdbMovieList)
async def now_playing(page: int = Query(1, ge=1)):
    """Fetches a paginated list of movies currently in theaters."""
    data = await get_now_playing_movies(page=page)
    if not data:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="TMDB unreachable")
    return data


@router.get("/upcoming/", response_model=TmdbMovieList)
async def upcoming(page: int = Query(1, ge=1)):
    """Fetches a paginated list of upcoming movies."""
    data = await get_upcoming_movies(page=page)
    if not data:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="TMDB unreachable")
    return data


@router.get("/top-rated/", response_model=TmdbMovieList)
async def top_rated(page: int = Query(1, ge=1)):
    """Fetches a paginated list of top-rated movies."""
    data = await get_top_rated_movies(page=page)
    if not data:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="TMDB unreachable")
    return data

@router.post("/ai/search/", response_model=AISearchSuccess | AISearchFallback)
async def ai_search_movie(request: AISearchRequest):
    """
    Processes a natural language query using AI to generate movie search filters.
    
    This endpoint communicates with a separate recommendation service via RabbitMQ RPC.
    It expects the AI service to parse the user's prompt and return structured filter criteria
    (like genre, release year, etc.) that can be used to query a movie database.
    
    If the RPC call times out, returns invalid data, or fails for any reason,
    it catches the exception and returns a fallback response.
    
    Args:
        request (AISearchRequest): The user's natural language search prompt.
        
    Returns:
        AISearchSuccess | AISearchFallback: The discovered movies or a fallback signal.
    """
    try:
        # Call the recommendation service via RPC with a 60-second timeout
        response = await asyncio.wait_for(
            recommendation_rpc.call({"prompt": request.prompt}),
            timeout=60
        )

        # Validate the response against the expected schema
        ai_filters = AISearchResponse(**response)
        
        # Check if the filters are effectively empty
        # We ignore 'query' and 'include_adult' because they don't count as structured filters 
        # for TMDB discovery, or they are just echoing the prompt.
        filters_check = ai_filters.filters.model_dump(exclude_defaults=True)
        filters_check.pop("query", None)
        filters_check.pop("include_adult", None)

        if not filters_check:
            raise Exception("AI returned empty structured filters")

        ai_recommended_movies = await discover_movies(ai_filters)
        
        # Map raw JSON results to TmdbMovie objects for validation
        validated_movies = []
        if ai_recommended_movies and "results" in ai_recommended_movies:
            validated_movies = [TmdbMovie(**m) for m in ai_recommended_movies["results"]]

        return AISearchSuccess(movies=validated_movies)

    except (asyncio.TimeoutError, ValidationError, Exception) as e:
        # Catch timeouts, schema validation errors, or other unexpected issues
        print(f"\n[AI Search Fallback] Triggered due to: {type(e).__name__} - {e}")
        
        # Return a fallback response so the frontend knows to try a different search method
        return AISearchFallback(
            original_prompt=request.prompt,
            error_detail=str(e)
        )


@router.get("/{tmdb_id}/", response_model=MovieDetailWithReviews)
async def get_movie_page(tmdb_id: int, db: AsyncSession = Depends(get_db)):
    """
    Fetches detailed information for a movie along with its most recent reviews.
    
    Performs a concurrent fetch:
    1. Calls TMDB API for movie metadata.
    2. Queries local database for recent reviews.
    """
    # Prepare the async tasks
    tmdb_task = get_movie_details(tmdb_id)

    # Fetch the last 10 reviews, newest first
    query = select(Review).where(Review.tmdb_id == tmdb_id).order_by(Review.created_at.desc()).limit(10)
    db_task = db.execute(query)

    
    # Run both tasks concurrently to reduce total latency
    movie_data, db_result = await asyncio.gather(
        tmdb_task,
        db_task,
    )
   
    if not movie_data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Movie not found")

    # Combine TMDB data with the list of review objects
    return {
        **movie_data,
        "reviews": db_result.scalars().all()
    }