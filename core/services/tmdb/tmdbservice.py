"""
TMDB Service Module.

This module provides a service layer for interacting with The Movie Database (TMDB) API.
It abstracts the details of making HTTP requests and handling responses, offering
a clean interface for fetching movie data like popular, upcoming, and top-rated lists,
as well as detailed information for specific movies.
"""

from typing import Any, Dict, Optional

import httpx
from fastapi import HTTPException, status

# import setting from tmdb/config
from .config import get_tmdb_settings

_tmdb_client: httpx.AsyncClient | None = None


def init_tmdb():
    """
    Initializes the global TMDB httpx async client.
    
    Fetches TMDB settings and sets up the client with the required
    authorization headers, base URL, and timeout.
    """
    global _tmdb_client
    if _tmdb_client is None:
        settings = get_tmdb_settings()
        headers = {
            "accept": "application/json",
            "Authorization": f"Bearer {settings.TMDB_READ_ACCESS_TOKEN}",
        }

        _tmdb_client = httpx.AsyncClient(
            base_url=settings.TMDB_BASE_URL, headers=headers, timeout=10.0
        )

    print("[TMDB] Client initialized.", flush=True)

async def close_tmdb():
    """
    Gracefully closes the global TMDB httpx async client.
    
    Should be called during application shutdown to release network connections.
    """
    global _tmdb_client
    if _tmdb_client is not None:
        await _tmdb_client.aclose()
        print("[TMDB] Client closed.", flush=True)
    

def get_tmdb_client() -> httpx.AsyncClient:
    """
    Retrieves or initializes the global httpx.AsyncClient for TMDB API requests.

    This function acts as a singleton factory. If the global client has not
    been created yet, it calls `init_tmdb()` to set it up.

    Returns:
        httpx.AsyncClient: A configured client instance ready for making API calls.
    """
    global _tmdb_client
    if _tmdb_client is None:
        init_tmdb()

    return _tmdb_client


async def _fetch_movie_list(category: str, page: int) -> Optional[Dict[str, Any]]:
    """
    Internal helper function to fetch a list of movies for a given category.

    Args:
        category (str): The movie category to fetch (e.g., "now_playing", "popular").
        page (int): The page number of the results to retrieve.

    Returns:
        An optional dictionary containing the API response data on success,
        or None if an HTTP error occurs.
    """
    setting = get_tmdb_settings()
    client = get_tmdb_client()

    try:
        response = await client.get(
            f"movie/{category}",
            params={"language": setting.TMDB_LANGUAGE, "page": page},
        )
        response.raise_for_status()
        return response.json()

    except httpx.HTTPStatusError as e:
        print(f"[TMDB] HTTP error while fetching '{category}' movies: {e}", flush=True)
        return None


# --- Public API Functions for Routers ---


async def get_now_playing_movies(page: int = 1) -> Optional[Dict[str, Any]]:
    """Fetches a list of movies currently playing in theaters from TMDB."""
    return await _fetch_movie_list("now_playing", page)


async def get_popular_movies(page: int = 1) -> Optional[Dict[str, Any]]:
    """Fetches a list of the current popular movies from TMDB."""
    return await _fetch_movie_list("popular", page)


async def get_upcoming_movies(page: int = 1) -> Optional[Dict[str, Any]]:
    """Fetches a list of upcoming movies being released soon from TMDB."""
    return await _fetch_movie_list("upcoming", page)


async def get_top_rated_movies(page: int = 1) -> Optional[Dict[str, Any]]:
    """Fetches a list of the all-time top-rated movies from TMDB."""
    return await _fetch_movie_list("top_rated", page)


async def get_movie_details(tmdb_id: int) -> Optional[Dict[str, Any]]:
    """
    Retrieves detailed metadata for a specific movie by its TMDB ID.

    This function handles the external API call to TMDB. It manages error
    translation, converting upstream HTTP errors or network failures into
    FastAPI HTTPExceptions appropriate for the client.

    Args:
        tmdb_id (int): The unique The Movie Database (TMDB) identifier.

    Returns:
        Optional[Dict[str, Any]]: A dictionary containing movie details if found,
                                  or None if the movie does not exist (404).

    Raises:
        HTTPException: 502 Bad Gateway if TMDB returns a server error or is unreachable.
    """
    setting = get_tmdb_settings()
    client = get_tmdb_client()

    try:
        response = await client.get(
            f"movie/{tmdb_id}",
            params={"language": setting.TMDB_LANGUAGE},
        )

        if response.status_code == status.HTTP_404_NOT_FOUND:
            return None

            response.raise_for_status()
            return response.json()
        
    except httpx.HTTPStatusError as e:
        # TMDB responded, but with an error (e.g., 500 Internal Server Error)
        print(f"[TMDB] HTTP status error while fetching details for {tmdb_id}: {e}", flush=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="TMDB API error"
        )
    except httpx.RequestError as e:
        # TMDB didn't even respond (e.g., DNS failure, timeout)
        print(f"[TMDB] Network error while fetching details for {tmdb_id}: {e}", flush=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="TMDB unreachable"
        )