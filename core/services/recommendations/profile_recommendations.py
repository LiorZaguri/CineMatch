"""Profile recommendation orchestration with lightweight cache + background AI refresh."""

import asyncio
import hashlib
import json
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from db.db import SessionLocal
from models.user_preference import (
    DiscoveryMode,
    GenreName,
    Language,
    RecommendationCache,
    Runtime,
    UserPreference,
)
from schemas.Ai import AIFilters, AISearchResponse
from services.rabbitmq.rpc import recommendation_rpc
from services.tmdb.tmdbservice import (
    discover_movies,
    get_movie_details,
    get_movie_keywords,
)

MAX_RECOMMENDATIONS = 20
MAX_CANDIDATES = 40
MAX_DISCOVER_PAGES = 2
MAX_REFERENCE_MOVIES = 3
MAX_REFERENCE_KEYWORDS = 3
MAX_DISCOVER_GENRES = 2
MAX_DISCOVER_KEYWORDS = 3
AI_REFRESH_INTERVAL = timedelta(days=1)
RECOMMENDATION_DISCOVER_SEPARATOR = "|"

GENRE_IDS: dict[GenreName, int] = {
    GenreName.ACTION: 28,
    GenreName.ANIMATION: 16,
    GenreName.COMEDY: 35,
    GenreName.CRIME: 80,
    GenreName.DOCUMENTARY: 99,
    GenreName.DRAMA: 18,
    GenreName.FANTASY: 14,
    GenreName.HORROR: 27,
    GenreName.MYSTERY: 9648,
    GenreName.ROMANCE: 10749,
    GenreName.SCI_FI: 878,
    GenreName.THRILLER: 53,
}

LANGUAGE_CODES: dict[Language, str] = {
    Language.ENGLISH: "en",
    Language.KOREAN: "ko",
    Language.JAPANESE: "ja",
    Language.FRENCH: "fr",
    Language.SPANISH: "es",
}

MOOD_GENRES: dict[str, list[int]] = {
    "dark & tense": [53, 80, 9648],
    "mind-bending": [878, 9648],
    "emotionally heavy": [18],
    "visually stunning": [878, 14, 16],
    "fun & easy": [35, 12, 10751],
    "fast-paced": [28, 53],
}

MOOD_KEYWORDS: dict[str, list[str]] = {
    "dark & tense": ["psychological thriller"],
    "mind-bending": ["time travel", "alternate reality"],
    "emotionally heavy": ["family relationships"],
    "visually stunning": ["visual effects"],
    "fun & easy": ["feel good"],
    "fast-paced": ["chase"],
}

GENERIC_KEYWORDS = {
    "based on novel or book",
    "based on young adult novel",
    "based on children's book",
    "duringcreditsstinger",
    "aftercreditsstinger",
}

_REFRESH_RUNNING: set[str] = set()


@dataclass(frozen=True)
class ReferenceSignal:
    genre_ids: list[int]
    keyword_ids: list[int]


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _unique(values: list[int | str]) -> list[int | str]:
    result: list[int | str] = []
    seen: set[str] = set()
    for value in values:
        key = str(value).strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        result.append(value)
    return result


def _unique_ints(values: list[int]) -> list[int]:
    return [value for value in _unique(values) if isinstance(value, int)]


def _unique_strings(values: list[str]) -> list[str]:
    return [value for value in _unique(values) if isinstance(value, str)]


def _selected_tmdb_ids(preference: UserPreference) -> list[int]:
    return _unique_ints([movie.tmdb_id for movie in preference.chosen_movies if movie.tmdb_id])


def _preference_genres(preference: UserPreference) -> tuple[list[int], list[int]]:
    liked = [GENRE_IDS[genre.name] for genre in preference.liked_genres if genre.name in GENRE_IDS]
    disliked = [GENRE_IDS[genre.name] for genre in preference.disliked_genres if genre.name in GENRE_IDS]
    return _unique_ints(liked), _unique_ints(disliked)


def _language_filter(preference: UserPreference) -> str | None:
    selected = [
        LANGUAGE_CODES[language.name]
        for language in preference.language_preferences
        if language.name in LANGUAGE_CODES
    ]
    return selected[0] if len(selected) == 1 else None


def _runtime_filter(runtime: Runtime | None) -> tuple[int | None, int | None]:
    if runtime == Runtime.UNDER_100:
        return None, 100
    if runtime == Runtime.BETWEEN_100_140:
        return 100, 140
    if runtime == Runtime.OVER_140:
        return 140, None
    return None, None


def _era_filter(preference: UserPreference) -> tuple[str | None, str | None]:
    eras = []
    for era in preference.era_preferences:
        try:
            eras.append(int(era.name.value))
        except (TypeError, ValueError):
            continue

    if not eras:
        return None, None

    earliest = min(eras)
    latest = max(eras) + 9
    return f"{earliest}-01-01", f"{latest}-12-31"


def _discovery_filters(mode: DiscoveryMode) -> tuple[str, float | None, int]:
    if mode == DiscoveryMode.MAINSTREAM:
        return "popularity.desc", 6.5, 500
    if mode == DiscoveryMode.HIDDEN_GEMS:
        return "vote_average.desc", 6.8, 50
    return "vote_average.desc", 6.8, 150


def _mood_filters(preference: UserPreference) -> tuple[list[int], list[str]]:
    genres: list[int] = []
    keywords: list[str] = []
    for mood in preference.moods:
        key = mood.name.strip().lower()
        genres.extend(MOOD_GENRES.get(key, []))
        keywords.extend(MOOD_KEYWORDS.get(key, []))
    return _unique_ints(genres), _unique_strings(keywords)


def _choose_discover_genres(
    liked_genres: list[int],
    reference_genres: list[int],
    mood_genres: list[int],
) -> list[int]:
    if liked_genres:
        return _unique_ints([*liked_genres, *reference_genres])[:MAX_DISCOVER_GENRES]
    if reference_genres:
        return _unique_ints([*reference_genres, *mood_genres])[:MAX_DISCOVER_GENRES]
    return mood_genres[:MAX_DISCOVER_GENRES]


def _choose_discover_keywords(reference_keywords: list[int], mood_keywords: list[str]) -> list[int | str]:
    return _unique([*reference_keywords, *mood_keywords])[:MAX_DISCOVER_KEYWORDS]


def _extract_genres(movie_details: dict[str, Any] | None) -> list[int]:
    if not movie_details:
        return []

    genre_ids: list[int] = []
    for genre in movie_details.get("genres") or []:
        genre_id = genre.get("id") if isinstance(genre, dict) else None
        if isinstance(genre_id, int):
            genre_ids.append(genre_id)
    return genre_ids


def _extract_keywords(keywords_payload: dict[str, Any] | None) -> list[int]:
    if not keywords_payload:
        return []

    keyword_ids: list[int] = []
    raw_keywords = keywords_payload.get("keywords") or keywords_payload.get("results") or []
    for keyword in raw_keywords:
        if not isinstance(keyword, dict):
            continue

        keyword_id = keyword.get("id")
        keyword_name = keyword.get("name")
        if not isinstance(keyword_id, int) or not isinstance(keyword_name, str):
            continue

        normalized_name = keyword_name.strip().lower()
        if not normalized_name or normalized_name in GENERIC_KEYWORDS:
            continue

        keyword_ids.append(keyword_id)
        if len(keyword_ids) >= MAX_REFERENCE_KEYWORDS:
            break

    return keyword_ids


async def _reference_signal(tmdb_id: int) -> ReferenceSignal:
    details, keywords = await asyncio.gather(
        get_movie_details(tmdb_id),
        get_movie_keywords(tmdb_id),
        return_exceptions=True,
    )

    return ReferenceSignal(
        genre_ids=_extract_genres(details if isinstance(details, dict) else None),
        keyword_ids=_extract_keywords(keywords if isinstance(keywords, dict) else None),
    )


async def _collect_reference_signals(tmdb_ids: list[int]) -> ReferenceSignal:
    reference_ids = tmdb_ids[:MAX_REFERENCE_MOVIES]
    if not reference_ids:
        return ReferenceSignal(genre_ids=[], keyword_ids=[])

    signals = await asyncio.gather(*[_reference_signal(tmdb_id) for tmdb_id in reference_ids])
    genre_counts: Counter[int] = Counter()
    keyword_counts: Counter[int] = Counter()

    for signal in signals:
        genre_counts.update(signal.genre_ids)
        keyword_counts.update(signal.keyword_ids)

    return ReferenceSignal(
        genre_ids=[genre_id for genre_id, _ in genre_counts.most_common(3)],
        keyword_ids=[
            keyword_id
            for keyword_id, _ in keyword_counts.most_common(MAX_REFERENCE_KEYWORDS)
        ],
    )


def _build_filters(preference: UserPreference, signal: ReferenceSignal) -> AIFilters:
    liked_genres, disliked_genres = _preference_genres(preference)
    mood_genres, mood_keywords = _mood_filters(preference)
    runtime_gte, runtime_lte = _runtime_filter(preference.runtime)
    date_gte, date_lte = _era_filter(preference)
    sort_by, vote_average_gte, vote_count_gte = _discovery_filters(preference.discovery_mode)

    return AIFilters(
        original_language=_language_filter(preference),
        with_genres=_choose_discover_genres(liked_genres, signal.genre_ids, mood_genres),
        without_genres=disliked_genres,
        with_keywords=_choose_discover_keywords(signal.keyword_ids, mood_keywords),
        primary_release_date_gte=date_gte,
        primary_release_date_lte=date_lte,
        with_runtime_gte=runtime_gte,
        with_runtime_lte=runtime_lte,
        vote_average_gte=vote_average_gte,
        vote_count_gte=vote_count_gte,
        sort_by=sort_by,
        include_adult=False,
    )


def _reduced_filter_payload(filters: AIFilters) -> dict[str, Any]:
    payload = {
        "with_genres": filters.with_genres,
        "without_genres": filters.without_genres,
        "with_keywords": filters.with_keywords,
        "with_original_language": filters.original_language,
        "primary_release_date.gte": filters.primary_release_date_gte,
        "primary_release_date.lte": filters.primary_release_date_lte,
        "with_runtime.gte": filters.with_runtime_gte,
        "with_runtime.lte": filters.with_runtime_lte,
        "vote_average.gte": filters.vote_average_gte,
        "vote_count.gte": filters.vote_count_gte,
        "sort_by": filters.sort_by,
    }
    return {
        key: value
        for key, value in payload.items()
        if value is not None and value != []
    }


def _relax_filters(filters: AIFilters) -> AIFilters:
    relaxed = filters.model_copy(deep=True)
    relaxed.with_keywords = []
    relaxed.with_genres = relaxed.with_genres[:1]
    relaxed.vote_count_gte = min(relaxed.vote_count_gte or 50, 50)
    relaxed.vote_average_gte = min(relaxed.vote_average_gte or 6.5, 6.5)
    relaxed.sort_by = "vote_average.desc"
    return relaxed


def _broad_fallback_filters(filters: AIFilters) -> AIFilters:
    fallback = filters.model_copy(deep=True)
    fallback.original_language = None
    fallback.with_genres = []
    fallback.with_keywords = []
    fallback.primary_release_date_gte = None
    fallback.primary_release_date_lte = None
    fallback.with_runtime_gte = None
    fallback.with_runtime_lte = None
    fallback.vote_count_gte = 100
    fallback.vote_average_gte = 6.2
    fallback.sort_by = "vote_average.desc"
    return fallback


async def _fetch_discovery_results(
    filters: AIFilters,
    excluded_ids: set[int],
    max_results: int,
) -> list[dict[str, Any]]:
    response = AISearchResponse(mode="discover", filters=filters)
    results: list[dict[str, Any]] = []
    seen_ids = set(excluded_ids)

    for page in range(1, MAX_DISCOVER_PAGES + 1):
        payload = await discover_movies(
            response,
            page=page,
            list_separator=RECOMMENDATION_DISCOVER_SEPARATOR,
        )
        if not payload:
            break

        for movie in payload.get("results") or []:
            movie_id = movie.get("id")
            if not isinstance(movie_id, int) or movie_id in seen_ids:
                continue
            seen_ids.add(movie_id)
            results.append(movie)
            if len(results) >= max_results:
                return results

        total_pages = payload.get("total_pages")
        if isinstance(total_pages, int) and page >= total_pages:
            break

    return results


async def _collect_discovery_candidates(
    filters: AIFilters,
    excluded_ids: set[int],
) -> tuple[AIFilters, list[dict[str, Any]]]:
    stages = [filters, _relax_filters(filters), _broad_fallback_filters(filters)]
    results: list[dict[str, Any]] = []
    seen_ids = set(excluded_ids)
    active_filters = filters

    for stage_filters in stages:
        remaining = MAX_CANDIDATES - len(results)
        if remaining <= 0:
            break

        stage_results = await _fetch_discovery_results(
            stage_filters,
            excluded_ids=seen_ids,
            max_results=remaining,
        )
        if stage_results:
            active_filters = stage_filters

        for movie in stage_results:
            movie_id = movie.get("id")
            if not isinstance(movie_id, int) or movie_id in seen_ids:
                continue
            seen_ids.add(movie_id)
            results.append(movie)

        if len(results) >= MAX_RECOMMENDATIONS:
            break

    return active_filters, results


async def _selected_movie_titles(tmdb_ids: list[int]) -> list[str]:
    titles: list[str] = []
    for tmdb_id in tmdb_ids[:MAX_REFERENCE_MOVIES]:
        try:
            details = await get_movie_details(tmdb_id)
        except Exception:
            continue

        if isinstance(details, dict) and isinstance(details.get("title"), str):
            titles.append(details["title"])
    return titles


def _user_profile_payload(preference: UserPreference, selected_titles: list[str]) -> dict[str, Any]:
    return {
        "liked_genres": [genre.name.value for genre in preference.liked_genres],
        "disliked_genres": [genre.name.value for genre in preference.disliked_genres],
        "moods": [mood.name for mood in preference.moods],
        "languages": [language.name.value for language in preference.language_preferences],
        "eras": [era.name.value for era in preference.era_preferences],
        "runtime": preference.runtime.value if preference.runtime else None,
        "discovery_mode": preference.discovery_mode.value,
        "selected_titles": selected_titles,
    }


def _candidate_payload(movie: dict[str, Any]) -> dict[str, Any] | None:
    movie_id = movie.get("id")
    title = movie.get("title")
    if not isinstance(movie_id, int) or not isinstance(title, str) or not title.strip():
        return None

    overview = movie.get("overview")
    release_date = movie.get("release_date")
    vote_average = movie.get("vote_average")
    original_language = movie.get("original_language")

    return {
        "id": movie_id,
        "title": title,
        "overview": overview[:500] if isinstance(overview, str) else "",
        "release_date": release_date if isinstance(release_date, str) else None,
        "vote_average": vote_average if isinstance(vote_average, (int, float)) else None,
        "original_language": original_language if isinstance(original_language, str) else None,
    }


def _score_for_rank(index: int) -> int:
    return max(72, 96 - index)


def _normalize_match_scores(raw_scores: Any, candidate_ids: set[int]) -> dict[int, int]:
    if not isinstance(raw_scores, dict):
        return {}

    match_scores: dict[int, int] = {}
    for raw_movie_id, raw_score in raw_scores.items():
        try:
            movie_id = int(raw_movie_id)
            score = int(round(float(raw_score)))
        except (TypeError, ValueError):
            continue

        if movie_id not in candidate_ids:
            continue

        match_scores[movie_id] = max(0, min(score, 100))

    return match_scores


def _apply_match_scores(
    movies: list[dict[str, Any]],
    match_scores: dict[int, int] | None = None,
) -> list[dict[str, Any]]:
    scored: list[dict[str, Any]] = []
    scores = match_scores or {}

    for index, movie in enumerate(movies[:MAX_RECOMMENDATIONS]):
        movie_id = movie.get("id")
        score = scores.get(movie_id) if isinstance(movie_id, int) else None
        scored_movie = dict(movie)
        scored_movie["ai_match_score"] = score if score is not None else _score_for_rank(index)
        scored.append(scored_movie)

    return scored


def _order_by_ranked_ids(candidates: list[dict[str, Any]], ranked_ids: list[int]) -> list[dict[str, Any]]:
    candidates_by_id = {
        movie["id"]: movie
        for movie in candidates
        if isinstance(movie.get("id"), int)
    }
    ranked: list[dict[str, Any]] = []
    seen_ids: set[int] = set()

    for movie_id in ranked_ids:
        movie = candidates_by_id.get(movie_id)
        if movie is None or movie_id in seen_ids:
            continue
        ranked.append(movie)
        seen_ids.add(movie_id)

    for movie in candidates:
        movie_id = movie.get("id")
        if isinstance(movie_id, int) and movie_id not in seen_ids:
            ranked.append(movie)
            seen_ids.add(movie_id)

    return ranked[:MAX_RECOMMENDATIONS]


def _profile_signature(preference: UserPreference) -> str:
    payload = {
        "discovery_mode": preference.discovery_mode.value if preference.discovery_mode else None,
        "runtime": preference.runtime.value if preference.runtime else None,
        "chosen_movies": sorted(_selected_tmdb_ids(preference)),
        "liked_genres": sorted(genre.name.value for genre in preference.liked_genres),
        "disliked_genres": sorted(genre.name.value for genre in preference.disliked_genres),
        "moods": sorted(mood.name.strip().lower() for mood in preference.moods),
        "languages": sorted(language.name.value for language in preference.language_preferences),
        "eras": sorted(era.name.value for era in preference.era_preferences),
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()


def _cache_results_payload(results: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "page": 1,
        "results": results[:MAX_RECOMMENDATIONS],
        "total_pages": 1,
        "total_results": len(results[:MAX_RECOMMENDATIONS]),
    }


def _cache_needs_candidate_refresh(cache: RecommendationCache | None, signature: str) -> bool:
    return (
        cache is None
        or cache.profile_signature != signature
        or not isinstance(cache.candidate_results, list)
        or len(cache.candidate_results) == 0
    )


def _has_fresh_ai_results(cache: RecommendationCache | None, signature: str, now: datetime) -> bool:
    if cache is None or cache.profile_signature != signature:
        return False
    if not isinstance(cache.ai_results, list) or len(cache.ai_results) == 0:
        return False
    if cache.ai_generated_at is None:
        return False
    return now - cache.ai_generated_at < AI_REFRESH_INTERVAL


def _should_schedule_ai_refresh(cache: RecommendationCache | None, signature: str, now: datetime) -> bool:
    if cache is None:
        return True
    if cache.profile_signature != signature:
        return True
    if cache.refresh_status == "refreshing":
        return False
    if cache.last_ai_attempt_at is None:
        return True
    if not isinstance(cache.ai_results, list) or len(cache.ai_results) == 0:
        return now - cache.last_ai_attempt_at >= AI_REFRESH_INTERVAL
    if cache.ai_generated_at is None:
        return True
    return now - cache.ai_generated_at >= AI_REFRESH_INTERVAL


async def _rerank_candidates(
    preference: UserPreference,
    selected_ids: list[int],
    filters: AIFilters,
    candidates: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], bool]:
    payload_candidates = [
        candidate
        for movie in candidates[:MAX_CANDIDATES]
        if (candidate := _candidate_payload(movie)) is not None
    ]
    if not payload_candidates:
        return _apply_match_scores(candidates), False

    try:
        selected_titles = await _selected_movie_titles(selected_ids)
        response = await recommendation_rpc.call(
            {
                "type": "rerank_recommendations",
                "user_profile": _user_profile_payload(preference, selected_titles),
                "reduced_filters": _reduced_filter_payload(filters),
                "candidates": payload_candidates,
                "max_results": MAX_RECOMMENDATIONS,
            }
        )
    except Exception as exc:
        print(f"[Recommendations] AI rerank fallback: {exc}", flush=True)
        return _apply_match_scores(candidates), False

    ranked_ids = response.get("ranked_ids")
    if not isinstance(ranked_ids, list):
        return _apply_match_scores(candidates), False

    clean_ranked_ids = [movie_id for movie_id in ranked_ids if isinstance(movie_id, int)]
    if not clean_ranked_ids:
        return _apply_match_scores(candidates), False

    ordered = _order_by_ranked_ids(candidates, clean_ranked_ids)
    candidate_ids = {candidate["id"] for candidate in payload_candidates}
    match_scores = _normalize_match_scores(response.get("match_scores"), candidate_ids)
    return _apply_match_scores(ordered, match_scores), True


async def _compute_candidate_results(preference: UserPreference) -> tuple[str, list[int], AIFilters, list[dict[str, Any]]]:
    signature = _profile_signature(preference)
    selected_ids = _selected_tmdb_ids(preference)
    signal = await _collect_reference_signals(selected_ids)
    filters = _build_filters(preference, signal)
    active_filters, candidates = await _collect_discovery_candidates(
        filters,
        excluded_ids=set(selected_ids),
    )
    return signature, selected_ids, active_filters, _apply_match_scores(candidates)


def _ensure_cache(preference: UserPreference) -> RecommendationCache:
    cache = preference.recommendation_cache
    if cache is None:
        cache = RecommendationCache(
            user_id=preference.user_id,
            profile_signature="",
            candidate_results=[],
            refresh_status="idle",
        )
        preference.recommendation_cache = cache
    return cache


async def _load_preference_for_refresh(user_id: str) -> UserPreference | None:
    async with SessionLocal() as db:
        result = await db.execute(
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
        preference = result.scalars().first()
        if preference is None:
            return None

        signature, selected_ids, filters, candidate_results = await _compute_candidate_results(preference)
        cache = _ensure_cache(preference)
        now = _utcnow()
        cache.profile_signature = signature
        cache.candidate_results = candidate_results
        cache.candidate_generated_at = now
        cache.ai_results = None
        cache.ai_generated_at = None
        cache.last_error = None
        cache.refresh_status = "refreshing"
        cache.refresh_started_at = now
        cache.last_ai_attempt_at = now
        await db.commit()

        ai_results, used_ai = await _rerank_candidates(preference, selected_ids, filters, candidate_results)
        if used_ai:
            cache.ai_results = ai_results
            cache.ai_generated_at = _utcnow()
            cache.last_error = None
        else:
            cache.ai_results = None
            cache.ai_generated_at = None
            cache.last_error = "AI rerank unavailable"
        cache.refresh_status = "idle"
        cache.refresh_started_at = None
        await db.commit()
        return preference


async def _run_background_refresh(user_id: str) -> None:
    if user_id in _REFRESH_RUNNING:
        return

    _REFRESH_RUNNING.add(user_id)
    try:
        await _load_preference_for_refresh(user_id)
    except Exception as exc:
        print(f"[Recommendations] Background refresh failed for {user_id}: {exc}", flush=True)
        async with SessionLocal() as db:
            result = await db.execute(
                select(RecommendationCache).where(RecommendationCache.user_id == user_id)
            )
            cache = result.scalars().first()
            if cache is not None:
                cache.refresh_status = "error"
                cache.refresh_started_at = None
                cache.last_error = str(exc)
                if cache.last_ai_attempt_at is None:
                    cache.last_ai_attempt_at = _utcnow()
                await db.commit()
    finally:
        _REFRESH_RUNNING.discard(user_id)


def schedule_profile_recommendation_refresh(user_id: str) -> None:
    if user_id in _REFRESH_RUNNING:
        return
    asyncio.create_task(_run_background_refresh(user_id))


async def get_profile_recommendations(preference: UserPreference) -> dict[str, Any]:
    now = _utcnow()
    signature = _profile_signature(preference)
    cache = preference.recommendation_cache

    if _has_fresh_ai_results(cache, signature, now):
        return _cache_results_payload(cache.ai_results or [])

    if _cache_needs_candidate_refresh(cache, signature):
        _, _, _, candidate_results = await _compute_candidate_results(preference)
        cache = _ensure_cache(preference)
        cache.profile_signature = signature
        cache.candidate_results = candidate_results
        cache.candidate_generated_at = now
        cache.ai_results = None
        cache.ai_generated_at = None
        cache.last_error = None
        cache.refresh_status = "idle"

    if _should_schedule_ai_refresh(cache, signature, now):
        schedule_profile_recommendation_refresh(preference.user_id)

    candidate_results = cache.candidate_results if cache and isinstance(cache.candidate_results, list) else []
    return _cache_results_payload(candidate_results)
