"""
TMDB Service Module.

This module provides a service layer for interacting with The Movie Database (TMDB) API.
It abstracts the details of making HTTP requests and handling responses, offering
a clean interface for fetching movie data like popular, upcoming, and top-rated lists,
as well as detailed information for specific movies.
"""

import asyncio
from datetime import date
from typing import Any, Dict, Optional

import httpx
from fastapi import HTTPException, status

from schemas.Ai import AISearchResponse

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


async def search_movies(query: str, page: int = 1) -> Optional[Dict[str, Any]]:
    """Fetches a paginated list of movies from TMDB's keyword search endpoint."""
    setting = get_tmdb_settings()
    client = get_tmdb_client()

    try:
        response = await client.get(
            "search/movie",
            params={
                "language": setting.TMDB_LANGUAGE,
                "query": query,
                "page": page,
                "include_adult": False,
            },
        )
        response.raise_for_status()
        return response.json()
    except httpx.HTTPStatusError as e:
        print(f"[TMDB] HTTP error while searching movies for '{query}': {e}", flush=True)
        return None
    except httpx.RequestError as e:
        print(f"[TMDB] Network error while searching movies for '{query}': {e}", flush=True)
        return None


async def get_movie_details(tmdb_id: int) -> Optional[Dict[str, Any]]:
    """
    Retrieves detailed metadata for a specific movie by its TMDB ID, including the trailer.

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
        # Fetch movie details and videos concurrently
        response, video_response = await asyncio.gather(
            client.get(f"movie/{tmdb_id}", params={"language": setting.TMDB_LANGUAGE}),
            get_movie_videos(tmdb_id),
            return_exceptions=True
        )

        if isinstance(response, Exception):
            raise response

        if response.status_code == status.HTTP_404_NOT_FOUND:
            return None

        response.raise_for_status()
        movie_data = response.json()

        # Extract trailer from video results
        trailer_url = None
        if isinstance(video_response, dict) and "results" in video_response:
            # Find the first YouTube video of type "Trailer"
            trailer = next(
                (v for v in video_response["results"] 
                 if v.get("site") == "YouTube" and v.get("type") == "Trailer"),
                None
            )
            if trailer:
                trailer_url = f"https://www.youtube.com/watch?v={trailer['key']}"
        
        movie_data["trailer"] = trailer_url
        return movie_data
        
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


async def get_movie_videos(tmdb_id: int) -> Optional[Dict[str, Any]]:
    """
    Retrieves videos associated with a specific movie by its TMDB ID.

    Args:
        tmdb_id (int): The unique The Movie Database (TMDB) identifier.

    Returns:
        Optional[Dict[str, Any]]: A dictionary containing video details if found,
                                  or None if the movie does not exist or an error occurs.
    """
    client = get_tmdb_client()

    try:
        response = await client.get(
            f"movie/{tmdb_id}/videos",
            params={"language": "en-US"},
        )

        if response.status_code == status.HTTP_404_NOT_FOUND:
            return None

        response.raise_for_status()
        return response.json()

    except (httpx.HTTPStatusError, httpx.RequestError) as e:
        print(f"[TMDB] Error while fetching videos for {tmdb_id}: {e}", flush=True)
        return None


async def discover_movies(ai_response: AISearchResponse) -> Optional[Dict[str, Any]]:
    """
    Discovers movies on TMDB based on filters generated by AI.

    Maps the structured AISearchResponse to TMDB discover/movie parameters.
    Only fetches the first page of results.

    Args:
        ai_response (AISearchResponse): Validated AI search response containing filters.

    Returns:
        Optional[Dict[str, Any]]: Paginated movie list from TMDB or None on failure.
    """
    setting = get_tmdb_settings()
    client = get_tmdb_client()
    filters = ai_response.filters

    # Resolve any named TMDB filter values to numeric IDs before discovery.
    for property_name in ("with_cast", "with_crew", "with_keywords"):
        values = getattr(filters, property_name)
        if values:
            normalized_values = await _normalize_tmdb_ids(values, property_name)
            setattr(filters, property_name, normalized_values)

    today = date.today().isoformat()

    # Default sorting to latest release date if not provided
    sort_by = filters.sort_by or "primary_release_date.desc"

    # Map AIFilters to TMDB query parameters
    # TMDB uses dots for ranges (e.g. vote_average.gte) but underscores in our schema
    params = {
        "language": filters.language or setting.TMDB_LANGUAGE,
        "with_original_language": filters.original_language,
        "page": 1,
        "sort_by": sort_by,
        "include_adult": filters.include_adult,
        "with_genres": ",".join(map(str, filters.with_genres)) if filters.with_genres else None,
        "without_genres": ",".join(map(str, filters.without_genres)) if filters.without_genres else None,
        "with_cast": ",".join(map(str, filters.with_cast)) if filters.with_cast else None,
        "with_crew": ",".join(map(str, filters.with_crew)) if filters.with_crew else None,
        "with_keywords": ",".join(map(str, filters.with_keywords)) if filters.with_keywords else None,
        "year": filters.year,
        "primary_release_year": filters.primary_release_year,
        "primary_release_date.gte": filters.primary_release_date_gte,
        "primary_release_date.lte": min(filters.primary_release_date_lte, today) if filters.primary_release_date_lte else today,
        "release_date.gte": filters.release_date_gte,
        "release_date.lte": filters.release_date_lte,
        "vote_average.gte": filters.vote_average_gte,
        "vote_average.lte": filters.vote_average_lte,
        "vote_count.gte": filters.vote_count_gte,
        "vote_count.lte": filters.vote_count_lte,
        "with_runtime.gte": filters.with_runtime_gte,
        "with_runtime.lte": filters.with_runtime_lte,
    }

    # Remove None values from params
    params = {k: v for k, v in params.items() if v is not None}

    try:
        response = await client.get("discover/movie", params=params)
        response.raise_for_status()
        return response.json()
    except httpx.HTTPStatusError as e:
        print(f"[TMDB] HTTP error during discovery: {e}", flush=True)
        return None
    except httpx.RequestError as e:
        print(f"[TMDB] Network error during discovery: {e}", flush=True)
        return None
    
async def get_movie_reviews(tmdb_id: int, page: int = 1):
    """
    Retrieves users reviews for a specific movie by its TMDB ID.

    Args:
        tmdb_id (int): The unique The Movie Database (TMDB) identifier for the movie.
        page (int, optional): The page number of results to retrieve. Defaults to 1.

    Returns:
        Optional[Dict[str, Any]]: A dictionary containing the paginated reviews if successful,
                                  or None if the movie does not exist or an error occurs.
    """
    setting = get_tmdb_settings()
    client = get_tmdb_client()

    try:
        response = await client.get(
            f"movie/{tmdb_id}/reviews",
            params={"language": setting.TMDB_LANGUAGE, "page": page},
        )

        if response.status_code == status.HTTP_404_NOT_FOUND:
            return None
        
        response.raise_for_status()
        return response.json()
    
    # TMDB responded, but with an error (e.g., 500 Internal Server Error)
    except httpx.HTTPStatusError as e:
        print(f"[TMDB] HTTP status error while fetching reviews for {tmdb_id}: {e}", flush=True)
        return None
    # TMDB didn't even respond (e.g., DNS failure, timeout)
    except httpx.RequestError as e:
        print(f"[TMDB] Network error while fetching reviews for {tmdb_id}: {e}", flush=True)
        return None


async def get_movie_credits(tmdb_id: int) -> Optional[Dict[str, Any]]:
    """
    Retrieves the cast and crew for a specific movie by its TMDB ID.
    Returns only the first 25 cast members to keep the payload manageable.

    Args:
        tmdb_id (int): The unique The Movie Database (TMDB) identifier.

    Returns:
        Optional[Dict[str, Any]]: A dictionary containing the sliced cast list,
                                  or None if the movie is not found or an error occurs.
    """
    client = get_tmdb_client()

    try:
        response = await client.get(
            f"movie/{tmdb_id}/credits",
            params={"language": "en-US"},
        )

        if response.status_code == status.HTTP_404_NOT_FOUND:
            return None

        response.raise_for_status()
        data = response.json()

        # Slice the cast to the first 25 members
        if "cast" in data and isinstance(data["cast"], list):
            data["cast"] = data["cast"][:25]

        return data

    except (httpx.HTTPStatusError, httpx.RequestError) as e:
        print(f"[TMDB] Error while fetching credits for {tmdb_id}: {e}", flush=True)
        return None


async def get_movie_watch_providers(tmdb_id: int) -> Optional[Dict[str, Any]]:
    """
    Retrieves watch providers for a specific movie by its TMDB ID.

    This function queries TMDB's watch providers endpoint to find where a movie
    is available for streaming, rent, or purchase. The response is localized
    by country codes.

    Args:
        tmdb_id (int): The unique The Movie Database (TMDB) identifier.

    Returns:
        Optional[Dict[str, Any]]: A dictionary containing watch provider details 
                                  organized by country, or None if the movie 
                                  is not found or an error occurs.
    """
    client = get_tmdb_client()

    try:
        response = await client.get(f"movie/{tmdb_id}/watch/providers")

        if response.status_code == status.HTTP_404_NOT_FOUND:
            return None

        response.raise_for_status()
        return response.json()

    except (httpx.HTTPStatusError, httpx.RequestError) as e:
        print(f"[TMDB] Error while fetching watch providers for {tmdb_id}: {e}", flush=True)
        return None

# --- Internal Helper Functions for Discovery ---

_PROPERTY_SEARCH_CONFIG = {
    "with_cast": {
        "endpoint": "search/person",
        "entity_type": "person",
        "include_adult": False,
    },
    "with_crew": {
        "endpoint": "search/person",
        "entity_type": "person",
        "include_adult": False,
    },
    "with_keywords": {
        "endpoint": "search/keyword",
        "entity_type": "keyword",
        "include_adult": None,
    },
}

def _build_search_params(settings: Any, property_name: str, text: str) -> dict[str, object]:
    """
    Constructs the query parameters for TMDB search endpoints.

    Args:
        settings (Any): The TMDB settings object containing language preferences.
        property_name (str): The name of the property being searched (e.g., 'with_cast').
        text (str): The search query text.

    Returns:
        dict[str, object]: A dictionary of query parameters tailored for the specific property.
    """
    config = _PROPERTY_SEARCH_CONFIG[property_name]
    params: dict[str, object] = {"query": text, "page": 1}

    if config["entity_type"] == "person":
        params["include_adult"] = config["include_adult"]
        params["language"] = settings.TMDB_LANGUAGE

    return params

async def _find_exact_match(results: list[dict], text: str) -> dict | None:
    """
    Identifies the best matching TMDB search result for a given query string.

    This function employs a scoring mechanism to evaluate search results:
    - 100 points for an exact case-insensitive match.
    - 90 points for partial substring matches.
    - 50+ points for keyword token overlap.

    Args:
        results (list[dict]): A list of search results returned by TMDB.
        text (str): The original search query to match against.

    Returns:
        dict | None: The best matching result object, or None if no results exist.
    """
    def normalize(value: str) -> str:
        cleaned = "".join(ch if ch.isalnum() or ch.isspace() else " " for ch in value.lower())
        return " ".join(cleaned.split())

    def score(name: str, query: str) -> int:
        if name == query:
            return 100
        if name in query or query in name:
            return 90

        name_tokens = set(name.split())
        query_tokens = set(query.split())
        overlap = len(name_tokens & query_tokens)
        if overlap > 0:
            return 50 + overlap

        return 0

    normalized_query = normalize(text)
    best_match = None
    best_score = -1

    for item in results:
        name = item.get("name")
        if not isinstance(name, str):
            continue

        normalized_name = normalize(name)
        current_score = score(normalized_name, normalized_query)

        if current_score > best_score:
            best_score = current_score
            best_match = item

        if current_score == 100:
            break

    return best_match or (results[0] if results else None)

async def _normalize_tmdb_ids(values: list[int | str], property_name: str) -> list[int]:
    """
    Converts a list of mixed names and IDs into a list of verified TMDB numeric IDs.

    This function processes search criteria (like actor names or keywords) and
    resolves them to their corresponding TMDB identifiers. It handles:
    - Direct integers (passed through).
    - Stringified numeric IDs (converted to int).
    - Textual names (searched via TMDB API and matched for accuracy).

    Args:
        values (list[int | str]): The input values to normalize.
        property_name (str): The category of the values (e.g., 'with_cast', 'with_keywords').

    Returns:
        list[int]: A list of resolved and verified numeric TMDB IDs.
    """
    config = _PROPERTY_SEARCH_CONFIG.get(property_name)
    if config is None:
        return []

    settings = get_tmdb_settings()
    client = get_tmdb_client()
    normalized: list[int] = []
    endpoint = config["endpoint"]

    for item in values:
        if isinstance(item, int):
            normalized.append(item)
            continue

        text = item.strip() if isinstance(item, str) else None
        if not text:
            continue

        if text.isdigit():
            normalized.append(int(text))
            continue

        params = _build_search_params(settings, property_name, text)
        response = await client.get(endpoint, params=params)
        response.raise_for_status()
        data = response.json()
        results = data.get("results") or []

        if not results:
            print(f"[TMDB] Could not resolve {property_name} name: {text}", flush=True)
            continue

        match = await _find_exact_match(results, text)
        if match is None:
            print(f"[TMDB] No match found for {property_name} name: {text}", flush=True)
            continue

        try:
            normalized.append(int(match["id"]))
        except (TypeError, ValueError, KeyError) as exc:
            print(
                f"[TMDB] Invalid TMDB ID for {property_name} result: {match!r} ({exc})",
                flush=True,
            )

    return normalized
