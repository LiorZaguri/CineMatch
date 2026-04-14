"""
Unit tests for the Movie Router (core/routers/movies.py).

Tests cover:
- Adding reviews (success and failure).
- Dashboard aggregation.
- TMDB movie list wrappers (popular, now-playing, etc.).
- Movie detail page with reviews.
"""
import asyncio
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

# Import dependencies to override
from db.db import get_db
from routers.dependencies import get_user_id
from schemas.review import sanitize_review_for_display

# Import the main app (assuming it mounts the router)
from src.main import app


@pytest.fixture
def mock_db_session():
    """
    Creates a mock AsyncSession for database operations.
    
    Returns:
        MagicMock: A mock object mimicking an AsyncSession with async commit/refresh/rollback methods.
    """
    session = MagicMock(spec=AsyncSession)
    # Async methods must be mocked as AsyncMock or return awaitables to be awaited in the router
    session.commit = AsyncMock()
    session.refresh = AsyncMock()
    session.rollback = AsyncMock()
    # execute returns a result wrapper that we can mock to simulate DB query results
    session.execute = AsyncMock()
    # add is typically synchronous in SQLAlchemy 1.4+ (updates session state)
    session.add = MagicMock()
    return session


@pytest.fixture
def client(mock_db_session):
    """
    TestClient with dependency overrides.
    
    Overrides the database dependency to use the mock session and the user ID dependency
    to simulate an authenticated user.
    """
    # Override the database session dependency
    app.dependency_overrides[get_db] = lambda: mock_db_session
    # Override user auth to simulate a logged-in user (ID "1")
    app.dependency_overrides[get_user_id] = lambda: "1"

    yield TestClient(app)

    # Cleanup overrides after test
    app.dependency_overrides.clear()


@patch("routers.movies.get_now_playing_movies")
@patch("routers.movies.get_popular_movies")
@patch("routers.movies.get_upcoming_movies")
@patch("routers.movies.get_top_rated_movies")
def test_get_movie_dashboard(mock_top, mock_up, mock_pop, mock_now, client):
    """
    Test GET /api/movies/dashboard/
    
    Verifies that the dashboard endpoint correctly aggregates results from 4 concurrent TMDB API calls.
    It mocks the external service calls to return predefined data and checks if the response
    JSON matches the expected structure.
    """
    def create_mock_movie(id, title):
        """Helper to create a movie object matching the TmdbMovie schema."""
        return {
            "id": id,
            "title": title,
            "original_language": "en",
            "original_title": title,
            "overview": "Test overview",
            "vote_average": 7.5,
            "poster_path": "/test.jpg",
            "release_date": "2023-01-01"
        }

    # Setup mock returns for each of the 4 TMDB service functions
    mock_now.return_value = {"results": [create_mock_movie(101, "Now 1")]}
    mock_pop.return_value = {"results": [create_mock_movie(102, "Pop 1")]}
    mock_up.return_value = {"results": [create_mock_movie(103, "Up 1")]}
    mock_top.return_value = {"results": [create_mock_movie(104, "Top 1")]}

    # Call the endpoint
    response = client.get("/api/movies/dashboard/")

    # Assertions
    assert response.status_code == 200
    data = response.json()
    
    # Check aggregation structure ensures keys map to correct service outputs
    assert len(data["now_playing"]) == 1
    assert data["now_playing"][0]["title"] == "Now 1"
    assert data["popular"][0]["title"] == "Pop 1"
    assert data["upcoming"][0]["title"] == "Up 1"
    assert data["top_rated"][0]["title"] == "Top 1"


@patch("routers.movies.get_popular_movies")
def test_get_popular_success(mock_get, client):
    """
    Test GET /api/movies/popular/ success path.
    
    Ensures the endpoint calls the service with the correct page and returns the movie list.
    """
    # Mock a successful response from TMDB
    mock_get.return_value = {
        "page": 1,
        "results": [{
            "id": 1, 
            "title": "Test Movie", 
            "vote_average": 8.5,
            "original_language": "en",
            "original_title": "Test Movie Original",
            "overview": "A test movie overview.",
            "poster_path": "/test.jpg",
            "release_date": "2023-01-01"
        }],
        "total_pages": 10,
        "total_results": 100
    }
    
    response = client.get("/api/movies/popular/?page=1")
    
    assert response.status_code == 200
    assert response.json()["results"][0]["title"] == "Test Movie"


@patch("routers.movies.get_popular_movies")
def test_get_popular_gateway_error(mock_get, client):
    """
    Test GET /api/movies/popular/ when TMDB returns None (unreachable).
    
    Verifies that the API returns a 502 Bad Gateway error when the external service fails.
    """
    mock_get.return_value = None  # Simulate failure
    
    response = client.get("/api/movies/popular/")
    
    assert response.status_code == 502
    assert response.json()["detail"] == "TMDB unreachable"


def test_add_review_success(client, mock_db_session):
    """
    Test POST /api/movies/review/
    
    Verifies that a review is successfully created when valid data is provided.
    Checks that the review is added to the session and committed.
    """
    # Simulate DB generating ID and timestamp on refresh
    def simulate_refresh(instance):
        instance.id = 1
        instance.created_at = datetime.now()

    mock_db_session.refresh.side_effect = simulate_refresh

    payload = {
        "tmdb_id": 550,
        "rating": 9,
        "content": "This is a fantastic movie! Highly recommended."
    }

    response = client.post("/api/movies/review/", json=payload)

    assert response.status_code == 201
    data = response.json()
    
    # Verify response content matches input
    assert data["rating"] == 9
    assert data["id"] == 1
    
    # Verify DB interactions: item added, committed, and refreshed
    mock_db_session.add.assert_called_once()
    mock_db_session.commit.assert_called_once()
    mock_db_session.refresh.assert_called_once()


def test_add_review_failure(client, mock_db_session):
    """
    Test POST /api/movies/review/ when DB commit fails.
    
    Verifies that a rollback occurs and a 400 error is returned if the database transaction fails
    (e.g., due to a constraint violation like reviewing the same movie twice).
    """
    # Simulate a DB error during commit (e.g., integrity error)
    mock_db_session.commit.side_effect = IntegrityError(None, None, Exception("Duplicate"))

    payload = {
        "tmdb_id": 550,
        "rating": 5,
        "content": "Average movie."
    }

    response = client.post("/api/movies/review/", json=payload)

    # Check for expected error handling
    assert response.status_code == 400
    assert response.json()["detail"] == "You have already reviewed this movie."
    
    # Verify rollback was called
    mock_db_session.rollback.assert_called_once()


def test_update_review_success(client, mock_db_session):
    review = MagicMock()
    review.id = 3
    review.user_id = "1"
    review.tmdb_id = 550
    review.rating = 7
    review.content = "Original content."
    review.created_at = datetime.now()

    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = review
    mock_db_session.execute.return_value = mock_result

    payload = {
        "rating": 9,
        "content": "Updated review content."
    }

    response = client.patch("/api/movies/review/3/", json=payload)

    assert response.status_code == 200
    assert review.rating == 9
    assert review.content == "Updated review content."
    mock_db_session.commit.assert_called_once()
    mock_db_session.refresh.assert_called_once_with(review)


def test_add_review_rejects_profanity(client, mock_db_session):
    payload = {
        "tmdb_id": 550,
        "rating": 8,
        "content": "This movie was fucking awful and gross."
    }

    response = client.post("/api/movies/review/", json=payload)

    assert response.status_code == 422
    mock_db_session.add.assert_not_called()


def test_add_review_strips_external_links(client, mock_db_session):
    def simulate_refresh(instance):
        instance.id = 2
        instance.created_at = datetime.now()

    mock_db_session.refresh.side_effect = simulate_refresh

    payload = {
        "tmdb_id": 550,
        "rating": 9,
        "content": "Watch this and skip https://spam.example.com because the movie itself is excellent."
    }

    response = client.post("/api/movies/review/", json=payload)

    assert response.status_code == 201
    added_review = mock_db_session.add.call_args.args[0]
    assert added_review.content == "Watch this and skip because the movie itself is excellent."


def test_sanitize_review_for_display_removes_links_and_redacts_profanity():
    review = "Visit https://spam.example.com because this fucking review should not advertise."

    sanitized = sanitize_review_for_display(review)

    assert "https://spam.example.com" not in sanitized
    assert "fucking" not in sanitized.lower()
    assert "*******" in sanitized


@patch("routers.movies.get_movie_details")
def test_get_movie_page_success(mock_get_details, client, mock_db_session):
    """
    Test GET /api/movies/{tmdb_id}/
    
    Verifies fetching movie details from TMDB and reviews from the local DB concurrently.
    The response should combine the movie metadata with the list of reviews.
    """
    tmdb_id = 999
    
    # Mock TMDB response (Movie metadata)
    mock_get_details.return_value = {
        "id": tmdb_id,
        "title": "Mock Movie",
        "overview": "Overview text",
        "vote_average": 7.5,
        "original_language": "en",
        "original_title": "Mock Movie",
        "poster_path": "/test.jpg",
        "release_date": "2023-01-01"
    }

    # Mock DB response for reviews
    mock_result = MagicMock()
    # Simulate scalar result of reviews (list of Review objects)
    mock_result.scalars.return_value.all.return_value = [
        {
            "id": 1,
            "content": "Great!",
            "rating": 10,
            "user_id": 1,
            "created_at": datetime.now()
        }
    ]
    mock_db_session.execute.return_value = mock_result

    response = client.get(f"/api/movies/{tmdb_id}/")

    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Mock Movie"
    # Check that reviews are included in the response
    assert len(data["reviews"]) == 1
    assert data["reviews"][0]["content"] == "Great!"


@patch("routers.dependencies.get_movie_reviews")
def test_get_movie_page_sorts_reviews_by_most_recent(mock_get_movie_reviews, client, mock_db_session):
    mock_get_movie_reviews.return_value = {
        "results": [
            {
                "author": "Older TMDB Reviewer",
                "content": "Older TMDB review",
                "created_at": "2024-01-01T00:00:00.000Z",
                "author_details": {
                    "rating": 6,
                },
            }
        ]
    }

    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [
        MagicMock(
            tmdb_id=999,
            content="Newest local review",
            rating=9,
            user_id="user-1",
            created_at=datetime(2024, 2, 1, 12, 0, 0),
        )
    ]
    mock_db_session.execute.return_value = mock_result

    from routers.dependencies import _get_all_reviews

    reviews = asyncio.run(_get_all_reviews(999, mock_db_session))

    assert reviews[0].content == "Newest local review"


@patch("routers.movies.get_movie_details")
def test_get_movie_page_not_found(mock_get_details, client, mock_db_session):
    """
    Test GET /api/movies/{tmdb_id}/ when movie does not exist in TMDB.
    
    Verifies that if TMDB returns no data, the API returns a 404 error.
    """
    mock_get_details.return_value = None
    
    response = client.get("/api/movies/0/")
    assert response.status_code == 404
