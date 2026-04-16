"""
Movie Router Module.

This module defines the API endpoints for movie-related operations, including
fetching movie lists (popular, upcoming, etc.), retrieving movie details,
and managing user reviews.
"""

import asyncio
from datetime import datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from db.db import get_db
from models.review import Review, ReviewSummary
from models.user_preference import UserPreference
from schemas.Ai import AISearchFallback, AISearchRequest, AISearchResponse, AISearchSuccess
from schemas.review import (
    ReviewCreate,
    ReviewRead,
    ReviewUpdate,
    is_review_usable_for_summary,
    normalize_summary_text,
    trim_summary_words,
)
from schemas.summary import ReviewSummaryResponse
from schemas.tmdbmovie import MovieDashboard, MovieDetailWithReviews, TmdbMovie, TmdbMovieList
from services.rabbitmq.rpc import recommendation_rpc, summary_rpc
from services.recommendations.profile_recommendations import get_profile_recommendations
from services.tmdb.tmdbservice import (
    discover_movies,
    discover_movies_like_reference,
    get_movie_credits,
    get_movie_details,
    get_now_playing_movies,
    get_popular_movies,
    get_top_rated_movies,
    get_upcoming_movies,
    search_movies,
)

from .dependencies import _get_all_reviews, _get_streaming_service, get_user_country_code, get_user_id

router = APIRouter(
    prefix="/api/movies",
    tags=["movies & reviews"],
    responses={404: {"description": "Not found"}},
)

SUMMARY_REVIEW_LOOKBACK = 10
SUMMARY_MAX_REVIEWS = 5
SUMMARY_MAX_WORDS = 120
SUMMARY_MAX_OUTPUT_TOKENS = 300
AI_SEARCH_MAX_RESULTS = 25
TMDB_RESULTS_PER_PAGE = 20
AI_SEARCH_SOURCE_PAGES = (AI_SEARCH_MAX_RESULTS + TMDB_RESULTS_PER_PAGE - 1) // TMDB_RESULTS_PER_PAGE


async def _collect_ai_movie_results(ai_filters: AISearchResponse) -> dict | None:
    reference_title = (ai_filters.filters.reference_title or "").strip()
    query = (ai_filters.filters.query or "").strip()

    async def fetch_page(page: int) -> dict | None:
        if reference_title:
            return await discover_movies_like_reference(ai_filters, page=page)
        if query:
            return await search_movies(query=query, page=page)
        return await discover_movies(ai_filters, page=page)

    aggregated_response: dict | None = None
    aggregated_results: list[dict] = []
    seen_movie_ids: set[int] = set()

    for page in range(1, AI_SEARCH_SOURCE_PAGES + 1):
        page_response = await fetch_page(page)
        if page_response is None:
            return aggregated_response

        if aggregated_response is None:
            aggregated_response = {**page_response, "results": []}

        page_results = page_response.get("results") or []
        if not page_results:
            break

        for movie in page_results:
            movie_id = movie.get("id")
            if not isinstance(movie_id, int) or movie_id in seen_movie_ids:
                continue

            aggregated_results.append(movie)
            seen_movie_ids.add(movie_id)

            if len(aggregated_results) >= AI_SEARCH_MAX_RESULTS:
                break

        aggregated_response["results"] = aggregated_results
        if len(aggregated_results) >= AI_SEARCH_MAX_RESULTS:
            break

        total_pages = page_response.get("total_pages")
        if isinstance(total_pages, int) and page >= total_pages:
            break

    return aggregated_response


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


@router.patch("/review/{review_id}/", response_model=ReviewRead)
async def update_review(
    review_id: int,
    payload: ReviewUpdate,
    user_id: Annotated[str, Depends(get_user_id)],
    db: AsyncSession = Depends(get_db),
):
    """
    Updates an existing movie review.

    This endpoint allows a user to modify their previously submitted rating
    and content for a specific review. It verifies that the review belongs
    to the authenticated user before applying changes.

    Args:
        review_id (int): The unique identifier of the review to update.
        payload (ReviewUpdate): The updated rating and content.
        user_id (str): The authenticated user's ID.
        db (AsyncSession): The database session dependency.

    Returns:
        Review: The updated review object.

    Raises:
        HTTPException: 404 Not Found if the review doesn't exist or doesn't belong to the user.
    """
    review_query = select(Review).where(Review.id == review_id, Review.user_id == user_id)
    review_result = await db.execute(review_query)
    review = review_result.scalars().first()

    if review is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Review not found."
        )

    review.rating = int(payload.rating)
    review.content = payload.content

    await db.commit()
    await db.refresh(review)
    return review
    

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
    """
    Fetches a paginated list of popular movies from TMDB.

    Args:
        page (int): The page number of results to retrieve (default is 1).

    Returns:
        TmdbMovieList: A paginated list of popular movies.

    Raises:
        HTTPException: 502 Bad Gateway if TMDB API is unreachable.
    """
    data = await get_popular_movies(page=page)
    if not data:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="TMDB unreachable")
    return data


@router.get("/now-playing/", response_model=TmdbMovieList)
async def now_playing(page: int = Query(1, ge=1)):
    """
    Fetches a paginated list of movies currently playing in theaters from TMDB.

    Args:
        page (int): The page number of results to retrieve (default is 1).

    Returns:
        TmdbMovieList: A paginated list of now playing movies.

    Raises:
        HTTPException: 502 Bad Gateway if TMDB API is unreachable.
    """
    data = await get_now_playing_movies(page=page)
    if not data:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="TMDB unreachable")
    return data


@router.get("/upcoming/", response_model=TmdbMovieList)
async def upcoming(page: int = Query(1, ge=1)):
    """
    Fetches a paginated list of upcoming movies from TMDB.

    Args:
        page (int): The page number of results to retrieve (default is 1).

    Returns:
        TmdbMovieList: A paginated list of upcoming movies.

    Raises:
        HTTPException: 502 Bad Gateway if TMDB API is unreachable.
    """
    data = await get_upcoming_movies(page=page)
    if not data:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="TMDB unreachable")
    return data


@router.get("/top-rated/", response_model=TmdbMovieList)
async def top_rated(page: int = Query(1, ge=1)):
    """
    Fetches a paginated list of top-rated movies from TMDB.

    Args:
        page (int): The page number of results to retrieve (default is 1).

    Returns:
        TmdbMovieList: A paginated list of top-rated movies.

    Raises:
        HTTPException: 502 Bad Gateway if TMDB API is unreachable.
    """
    data = await get_top_rated_movies(page=page)
    if not data:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="TMDB unreachable")
    return data


@router.get("/search/", response_model=TmdbMovieList)
async def movie_search(query: str = Query(..., min_length=1), page: int = Query(1, ge=1)):
    """
    Fetches a paginated list of movies from TMDB using a plain text query.

    Args:
        query (str): The movie title or keyword query.
        page (int): The page number of results to retrieve.

    Returns:
        TmdbMovieList: A paginated list of matching movies.

    Raises:
        HTTPException: 502 Bad Gateway if TMDB API is unreachable.
    """
    data = await search_movies(query=query, page=page)
    if not data:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="TMDB unreachable")

    if "results" in data:
        data["results"] = data["results"][:5]
        data["total_results"] = min(data.get("total_results", len(data["results"])), 5)
        data["total_pages"] = min(data.get("total_pages", 1), 1)

    return data


@router.get("/recommendations/me/", response_model=TmdbMovieList)
async def get_my_recommendations(
    user_id: Annotated[str, Depends(get_user_id)],
    db: AsyncSession = Depends(get_db),
):
    """
    Returns lightweight profile-based recommendations for the authenticated user.

    The endpoint serves cached AI-ranked results when they are fresh. Otherwise it
    returns deterministic TMDB-filtered candidates immediately and refreshes the
    AI rerank in the background.
    """
    query = (
        select(UserPreference)
        .where(UserPreference.user_id == user_id)
        .options(
            selectinload(UserPreference.chosen_movies),
            selectinload(UserPreference.language_preferences),
            selectinload(UserPreference.era_preferences),
            selectinload(UserPreference.liked_genres),
            selectinload(UserPreference.disliked_genres),
            selectinload(UserPreference.moods),
            selectinload(UserPreference.recommendation_cache),
        )
    )
    result = await db.execute(query)
    user_pref = result.scalars().first()

    if user_pref is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User preferences not found. Please complete onboarding.",
        )

    recommendations = await get_profile_recommendations(user_pref)
    await db.commit()
    return TmdbMovieList(**recommendations)


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
        # Call the recommendation service via RPC with a 120-second timeout
        # The RPC client now handles internal cleanup and message expiration.
        response = await recommendation_rpc.call(
            {"prompt": request.prompt}, 
            timeout=120
        )

        # Validate the response against the expected schema
        ai_filters = AISearchResponse(**response)
        
        # Check if the filters are effectively empty.
        # A query-only AI response is still valid because TMDB keyword search can use it.
        filters_check = ai_filters.filters.model_dump(exclude_defaults=True)
        filters_check.pop("include_adult", None)

        if not filters_check:
            raise Exception("AI returned empty structured filters")

        ai_recommended_movies = await _collect_ai_movie_results(ai_filters)

        if ai_recommended_movies is None:
            raise Exception("TMDB AI search failed")
        
        # Map raw JSON results to TmdbMovie objects for validation
        validated_movies = []
        if ai_recommended_movies and "results" in ai_recommended_movies:
            validated_movies = [TmdbMovie(**m) for m in ai_recommended_movies["results"][:AI_SEARCH_MAX_RESULTS]]

        return AISearchSuccess(status="success", fallback_used=False, movies=validated_movies)

    except (asyncio.TimeoutError, ValidationError, Exception) as e:
        # Catch timeouts, schema validation errors, or other unexpected issues
        print(f"\n[AI Search Fallback] Triggered due to: {type(e).__name__} - {e}")
        
        # Return a fallback response so the frontend knows to try a different search method
        return AISearchFallback(
            status="fallback",
            fallback_used=True,
            original_prompt=request.prompt,
            error_detail=str(e)
        )
    
@router.get("/ai/{tmdb_id}/summary/", response_model=ReviewSummaryResponse)
async def get_movie_summary(
    tmdb_id: int, 
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieves or generates an AI summary of aggregated user reviews for a movie.

    This endpoint checks if a recently generated summary (within the last 24 hours)
    exists in the local database. If so, it returns the cached version.
    Otherwise, it fetches movie details and aggregates reviews from both TMDB 
    and the local database, sends them to the AI Summarizer worker via 
    RabbitMQ RPC, caches the newly generated summary, and returns it.

    Args:
        tmdb_id (int): The unique TMDB identifier for the movie.
        db (AsyncSession): The database session dependency.

    Returns:
        ReviewSummaryResponse: An object containing the TMDB ID and the summary text.

    Raises:
        HTTPException: 404 Not Found if the movie does not exist on TMDB.
        HTTPException: 500 Internal Server Error if the AI summarization process fails.
    """
    # Check if a summary already exists in the database for this movie
    query = select(ReviewSummary).where(ReviewSummary.tmdb_id == tmdb_id)
    result = await db.execute(query)
    existing_summary = result.scalars().first()
    print(tmdb_id, flush=True)
    if existing_summary:
        # Calculate the age of the existing summary
        time_since_updated = datetime.now() - existing_summary.updated_at

        # If the summary was updated within the last 24 hours, return the cached version
        if time_since_updated < timedelta(24):
            print(f"[Review Summary] Returning cached summary for TMDB ID {tmdb_id}", flush=True)
            return ReviewSummaryResponse(
                tmdb_id=existing_summary.tmdb_id,
                summary=existing_summary.summary_text,
            )
    
    # Fetch movie metadata and aggregated reviews concurrently
    movie_data = await get_movie_details(tmdb_id)
    reviews = await _get_all_reviews(tmdb_id, db)

    # Ensure the movie actually exists on TMDB
    if not movie_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Movie not found on TMDB."
        )
    
    # If there are no reviews, we cannot generate a summary
    if not reviews:
        return ReviewSummaryResponse(
            tmdb_id=tmdb_id,
            summary=f"No reviews available for '{movie_data.get('title')}' yet."
        )

    recent_reviews = reviews[:SUMMARY_REVIEW_LOOKBACK]
    payload_reviews = []
    for rev in recent_reviews:
        if len(payload_reviews) >= SUMMARY_MAX_REVIEWS:
            break

        if not is_review_usable_for_summary(rev.content):
            continue

        payload_reviews.append({
            "rating": rev.rating or rev.author_details.rating or 5,
            "content": rev.content[:1000],
            "source": rev.author_details.source if rev.author_details else None,
            "created_at": rev.created_at.isoformat() if rev.created_at else None,
        })

    if not payload_reviews:
        return ReviewSummaryResponse(
            tmdb_id=tmdb_id,
            summary=f"Not enough substantive reviews are available for '{movie_data.get('title')}' yet."
        )

    payload = {
        "movie_title": movie_data.get('title'),
        "reviews": payload_reviews,
        "max_reviews": SUMMARY_MAX_REVIEWS,
        "max_words": SUMMARY_MAX_WORDS,
        "max_output_tokens": SUMMARY_MAX_OUTPUT_TOKENS,
        "max_tokens": SUMMARY_MAX_OUTPUT_TOKENS,
        "max_completion_tokens": SUMMARY_MAX_OUTPUT_TOKENS,
        "instructions": (
            "You are summarizing movie audience reviews. Only use real review content. "
            "Ignore spam, ads, self-promotion, copied text, off-topic comments, memes, "
            "one-line non-reviews, and anything that is not genuine feedback about the movie. "
            f"The reviews are ordered from most recent to older. Consider at most the first "
            f"{SUMMARY_MAX_REVIEWS} valid reviews from the {SUMMARY_REVIEW_LOOKBACK} most recent reviews. "
            "Write one concise audience-consensus summary in 3 to 5 sentences, focusing on sentiment, common praise, "
            "common criticism, and notable disagreements. Keep it concise and synthesized; do not paste long quotes "
            "or large chunks of review text. End with a complete sentence. Do not mention usernames, review sources, "
            "or that you filtered reviews. Do not invent facts not supported by the selected reviews. "
            f"Keep the summary under {SUMMARY_MAX_WORDS} words."
        ),
    }
    
    try:
        # Send the formatted data to the AI summarization worker via RabbitMQ RPC
        rpc_response = await asyncio.wait_for(
            summary_rpc.call(payload),
            timeout=60
        )
        
        if not rpc_response.get('ok'):
            error_msg = rpc_response.get("error") or "Unknown AI error"
            raise Exception(error_msg)
       
        temp_summary = rpc_response.get("summary")
        
        if temp_summary is None:
            raise ValueError("AI worker returned 'ok' but summary text was missing.")
        new_summary_text = normalize_summary_text(
            trim_summary_words(str(temp_summary), max_words=SUMMARY_MAX_WORDS),
            max_words=SUMMARY_MAX_WORDS,
        )
       
    except Exception as e:
        print(f"[Summary Error] {e}", flush=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="AI Summarization failed.")
    
    # Save or update the newly generated summary in the database for future requests
    if existing_summary:
        existing_summary.summary_text = new_summary_text
    else:
        new_summary = ReviewSummary(
            tmdb_id=tmdb_id,
            summary_text=new_summary_text
        )
        db.add(new_summary)
    
    await db.commit()

    return ReviewSummaryResponse(tmdb_id=tmdb_id, summary=new_summary_text)
        
        
@router.get("/{tmdb_id}/", response_model=MovieDetailWithReviews)
async def get_movie_page(
    tmdb_id: int, 
    db: AsyncSession = Depends(get_db),
    country_code: str = Depends(get_user_country_code)
):
    """
    Fetches detailed information for a movie along with aggregated reviews, 
    AI summaries, and cast information.

    Performs a concurrent fetch to minimize response time:
    1. Calls TMDB API for movie metadata.
    2. Aggregates reviews from TMDB and local database.
    3. Fetches movie cast from TMDB.
    4. Queries local database for cached AI summary.
    5. Fetches localized streaming availability.
    """
    # Run all data retrieval tasks concurrently
    movie_data, reviews, credits_data, db_result, streaming_services = await asyncio.gather(
        get_movie_details(tmdb_id),
        _get_all_reviews(tmdb_id, db),
        get_movie_credits(tmdb_id),
        db.execute(select(ReviewSummary).where(ReviewSummary.tmdb_id == tmdb_id)),
        _get_streaming_service(tmdb_id, country_code),
        return_exceptions=True
    )

    # Check for critical failure in movie metadata fetch
    if isinstance(movie_data, Exception) or not movie_data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Movie not found")

    # Extract summary if it exists (handling potential DB exceptions)
    summary_text = None
    if not isinstance(db_result, Exception):
        summary_obj = db_result.scalars().first()
        summary_text = summary_obj.summary_text if summary_obj else None

    # Safely extract cast list
    cast = []
    if not isinstance(credits_data, Exception) and credits_data:
        cast = credits_data.get("cast", [])

    # Ensure other aggregated data defaults to empty lists on failure
    final_reviews = reviews if not isinstance(reviews, Exception) else []
    final_streaming = streaming_services if not isinstance(streaming_services, Exception) else []

    # Combine all data into the response schema format
    return {
        **movie_data,
        "reviews": final_reviews,
        "summary": summary_text,
        "streaming_services": final_streaming,
        "cast": cast,
        "country_code": country_code
    }
