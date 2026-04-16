"""
User Preference Router.

This module defines the API endpoints for managing user tastes,
discovery settings, and favorite/disliked content.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from db.db import get_db
from models.user_preference import (
    DislikedGenre,
    LikedGenre,
    UserEra,
    UserLanguage,
    UserMood,
    UserMovie,
    UserPreference,
)
from schemas.user_preference import UserMovieCreate, UserMovieRead, UserPreferenceCreate, UserPreferenceRead
from services.recommendations.profile_recommendations import schedule_profile_recommendation_refresh

from .dependencies import get_user_id

router = APIRouter(
    prefix="/api/user-preferences",
    tags=["user preferences"],
    responses={404: {"description": "Not found"}},
)


@router.get("/me/", response_model=UserPreferenceRead)
async def get_my_preferences(
    user_id: Annotated[str, Depends(get_user_id)],
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieves the authenticated user's entire preference profile.

    This endpoint returns all settings, including liked/disliked genres,
    chosen movies, and preferred moods. It is used to populate the 
    user's settings or onboarding state in the frontend.

    Args:
        user_id (str): The authenticated user's ID.
        db (AsyncSession): The database session dependency.

    Returns:
        UserPreference: The user's complete preference profile.

    Raises:
        HTTPException: 404 Not Found if the preferences haven't been initialized.
    """
    # Query for the user's preference profile with all nested collections preloaded
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
        )
    )
    result = await db.execute(query)
    user_pref = result.scalars().first()

    if not user_pref:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User preferences not found. Please complete onboarding."
        )

    return user_pref


@router.post("/register/", response_model=UserPreferenceRead, status_code=status.HTTP_201_CREATED)
async def register_user_preferences(
    user_id: Annotated[str, Depends(get_user_id)],
    db: AsyncSession = Depends(get_db)
):
    """
    Initializes a new user preference profile with default values upon registration.

    This endpoint is intended to be called after a user registers via the Gateway.
    It checks if a profile already exists for the user; if not, it creates 
    one with the system defaults.

    Args:
        user_id (str): The authenticated user's ID.
        db (AsyncSession): The database session dependency.

    Returns:
        UserPreference: The initialized preference profile.

    Raises:
        HTTPException: 400 Bad Request if the preferences already exist.
    """
    # Check if preferences already exist for this user
    query = select(UserPreference).where(UserPreference.user_id == user_id)
    result = await db.execute(query)
    existing_pref = result.scalars().first()

    if existing_pref:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User preferences already initialized."
        )

    # Create new preference profile with default values from the model
    new_pref = UserPreference(user_id=user_id)
    
    db.add(new_pref)
    await db.commit()
    
    # Re-fetch with preloading to avoid lazy-loading issues during serialization
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
        )
    )
    result = await db.execute(query)
    return result.scalars().first()


@router.put("/update/", response_model=UserPreferenceRead)
async def update_user_preferences(
    payload: UserPreferenceCreate,
    user_id: Annotated[str, Depends(get_user_id)],
    db: AsyncSession = Depends(get_db)
):
    """
    Updates the authenticated user's preference profile.

    This endpoint performs a full synchronization of the user's taste profile.
    It updates top-level settings and replaces all nested collections 
    (movies, genres, moods) with the provided lists.

    Args:
        payload (UserPreferenceCreate): The updated preference profile data.
        user_id (str): The authenticated user's ID.
        db (AsyncSession): The database session dependency.

    Returns:
        UserPreference: The updated preference profile.

    Raises:
        HTTPException: 404 Not Found if the user hasn't initialized preferences.
    """
    # Fetch existing profile with all nested collections preloaded
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
        )
    )
    result = await db.execute(query)
    user_pref = result.scalars().first()

    if not user_pref:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User preferences not found. Please register first."
        )

    # 1. Update top-level fields
    user_pref.discovery_mode = payload.discovery_mode
    user_pref.runtime = payload.runtime

    # 2. Synchronize nested collections using the "Replace" strategy.
    # To avoid IntegrityError (unique constraint violations) when replacing
    # collections that have unique constraints (like user_id + name),
    # we first clear the collections and flush the session. 
    # This ensures that old records are marked for deletion and removed 
    # from the database before the new ones are inserted.
    
    user_pref.language_preferences.clear()
    user_pref.era_preferences.clear()
    user_pref.chosen_movies.clear()
    user_pref.liked_genres.clear()
    user_pref.disliked_genres.clear()
    user_pref.moods.clear()
    
    # Flush to ensure deletes are processed
    await db.flush()

    user_pref.language_preferences = [
        UserLanguage(user_id=user_id, name=language)
        for language in payload.languages
    ]
    user_pref.era_preferences = [
        UserEra(user_id=user_id, name=era)
        for era in payload.eras
    ]
    user_pref.chosen_movies = [
        UserMovie(user_id=user_id, tmdb_id=m.tmdb_id) 
        for m in payload.chosen_movies
    ]
    user_pref.liked_genres = [
        LikedGenre(user_id=user_id, name=g.name) 
        for g in payload.liked_genres
    ]
    user_pref.disliked_genres = [
        DislikedGenre(user_id=user_id, name=g.name) 
        for g in payload.disliked_genres
    ]
    user_pref.moods = [
        UserMood(user_id=user_id, name=m.name) 
        for m in payload.moods
    ]

    # 3. Commit changes and return the refreshed profile
    await db.commit()
    schedule_profile_recommendation_refresh(user_id)
    
    # Re-fetch with preloading to avoid lazy-loading issues during serialization
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
        )
    )
    result = await db.execute(query)
    return result.scalars().first()


@router.post("/movie/", response_model=UserMovieRead, status_code=status.HTTP_201_CREATED)
async def add_chosen_movie(
    payload: UserMovieCreate,
    user_id: Annotated[str, Depends(get_user_id)],
    db: AsyncSession = Depends(get_db)
):
    """
    Adds a specific movie to the user's chosen movies list.

    This endpoint allows for incremental updates to the user's movie tastes.
    It verifies the movie isn't already in the list before adding it.

    Args:
        payload (UserMovieCreate): The TMDB ID of the movie to add.
        user_id (str): The authenticated user's ID.
        db (AsyncSession): The database session dependency.

    Returns:
        UserMovie: The created user-movie link.

    Raises:
        HTTPException: 404 Not Found if preferences aren't initialized.
        HTTPException: 400 Bad Request if the movie is already in the list.
    """
    # 1. Ensure the user has a preference profile
    pref_query = select(UserPreference).where(UserPreference.user_id == user_id)
    pref_result = await db.execute(pref_query)
    if not pref_result.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User preferences not found. Please register first."
        )

    # 2. Check for duplicates to prevent IntegrityError
    dup_query = select(UserMovie).where(
        UserMovie.user_id == user_id, 
        UserMovie.tmdb_id == payload.tmdb_id
    )
    dup_result = await db.execute(dup_query)
    if dup_result.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Movie already exists in your preferences."
        )

    # 3. Add the new movie
    new_movie = UserMovie(user_id=user_id, tmdb_id=payload.tmdb_id)
    db.add(new_movie)
    
    await db.commit()
    await db.refresh(new_movie)
    schedule_profile_recommendation_refresh(user_id)
    
    return new_movie


@router.delete("/movie/{tmdb_id}/", status_code=status.HTTP_204_NO_CONTENT)
async def remove_chosen_movie(
    tmdb_id: int,
    user_id: Annotated[str, Depends(get_user_id)],
    db: AsyncSession = Depends(get_db)
):
    """
    Removes a specific movie from the user's chosen movies list.

    Args:
        tmdb_id (int): The TMDB ID of the movie to remove.
        user_id (str): The authenticated user's ID.
        db (AsyncSession): The database session dependency.

    Raises:
        HTTPException: 404 Not Found if the movie isn't in the user's list.
    """
    # Find the movie link
    query = select(UserMovie).where(
        UserMovie.user_id == user_id, 
        UserMovie.tmdb_id == tmdb_id
    )
    result = await db.execute(query)
    user_movie = result.scalars().first()

    if not user_movie:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Movie not found in your preferences."
        )

    # Delete the record
    await db.delete(user_movie)
    await db.commit()
    schedule_profile_recommendation_refresh(user_id)
    
    return None


@router.get("/movie/{tmdb_id}/", response_model=dict)
async def check_movie_preference(
    tmdb_id: int,
    user_id: Annotated[str, Depends(get_user_id)],
    db: AsyncSession = Depends(get_db)
):
    """
    Checks if a specific movie is in the user's preference list.

    This is used by the movie details page to visually indicate 
    (e.g., via a highlighted button) if the user has already liked/chosen the movie.

    Args:
        tmdb_id (int): The TMDB ID of the movie to check.
        user_id (str): The authenticated user's ID.
        db (AsyncSession): The database session dependency.

    Returns:
        dict: A dictionary containing 'is_liked' (boolean).
    """
    query = select(UserMovie).where(
        UserMovie.user_id == user_id, 
        UserMovie.tmdb_id == tmdb_id
    )
    result = await db.execute(query)
    exists = result.scalars().first() is not None
    
    return {"is_liked": exists}
