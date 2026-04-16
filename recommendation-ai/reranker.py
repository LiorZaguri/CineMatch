import asyncio
import json
import re
import time

from openai import AsyncOpenAI
from pydantic import ValidationError

from schemas import RerankRequest, RerankResponse
from services.AImodel.config import get_AI_settings


SYSTEM_PROMPT = """
You rank movie candidates for a user's taste profile.

You are a strict JSON API.
Return JSON only.
No markdown.
No explanation.
Do not describe your reasoning.
Do not write movie titles outside JSON.
The first visible character must be { and the last visible character must be }.
Never invent movie IDs.
Use only candidate IDs from the provided candidate list.

Output:
{
  "ranked_ids": [123, 456, 789],
  "match_scores": {
    "123": 94,
    "456": 89,
    "789": 84
  }
}

Ranking rules:
- Prefer movies that match explicit liked genres, moods, selected favorite titles, language, runtime, and era preferences.
- Treat reduced_filters as the deterministic retrieval query that produced these candidates.
- Avoid movies that clearly match disliked genres or conflict with the profile.
- Use overview, title, release date, original language, and vote average as weak signals only.
- Preserve enough variety; do not rank near-duplicates just because one signal repeats.
- If the profile is sparse, prefer broadly strong candidates with clear appeal.
- Return at most the requested max_results IDs.
- match_scores must use string movie IDs as keys and integer scores from 60 to 99.
- match_scores means AI confidence that the title fits this user's profile, not the TMDB vote average.
- ranked_ids is required. match_scores is preferred but may be omitted if needed.
""".strip()


def _extract_json_payload(raw_content: str) -> dict:
    cleaned = raw_content.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.removeprefix("```json").removeprefix("```").strip()
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3].strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise json.JSONDecodeError("No JSON object found", cleaned, 0)

    return json.loads(cleaned[start : end + 1])


def _extract_ranked_ids_payload(raw_content: str) -> dict:
    try:
        return _extract_json_payload(raw_content)
    except json.JSONDecodeError:
        pass

    ranked_ids_match = re.search(r'"ranked_ids"\s*:\s*\[(?P<ids>[^\]]*)\]', raw_content, re.DOTALL)
    if ranked_ids_match is None:
        raise json.JSONDecodeError("No ranked_ids array found", raw_content, 0)

    ranked_ids = [int(movie_id) for movie_id in re.findall(r"\d+", ranked_ids_match.group("ids"))]
    return {"ranked_ids": ranked_ids, "match_scores": {}}


def _fallback_response(reason: str) -> RerankResponse:
    return RerankResponse(ranked_ids=[], fallback_reason=reason)


def get_llm_client() -> AsyncOpenAI:
    settings = get_AI_settings()
    return AsyncOpenAI(base_url=settings.LLM_BASE_URL, api_key=settings.API_KEY)


def _request_payload(request: RerankRequest) -> dict:
    return {
        "user_profile": request.user_profile.model_dump(),
        "reduced_filters": request.reduced_filters,
        "max_results": request.max_results,
        "candidates": [candidate.model_dump() for candidate in request.candidates],
    }


def _user_message(request: RerankRequest) -> str:
    return (
        "Rank these candidates and respond with exactly one JSON object. "
        "No reasoning, no prose, no markdown.\n"
        f"{json.dumps(_request_payload(request), ensure_ascii=False)}"
    )


def _validate_ranked_ids(raw_ids: list[int], request: RerankRequest) -> list[int]:
    candidate_ids = {candidate.id for candidate in request.candidates}
    ranked_ids: list[int] = []
    seen: set[int] = set()

    for movie_id in raw_ids:
        if movie_id in candidate_ids and movie_id not in seen:
            ranked_ids.append(movie_id)
            seen.add(movie_id)
        if len(ranked_ids) >= request.max_results:
            break

    return ranked_ids


def _validate_match_scores(raw_scores: object, ranked_ids: list[int]) -> dict[str, int]:
    if not isinstance(raw_scores, dict):
        return {}

    ranked_id_set = set(ranked_ids)
    match_scores: dict[str, int] = {}
    for raw_movie_id, raw_score in raw_scores.items():
        try:
            movie_id = int(raw_movie_id)
            score = int(round(float(raw_score)))
        except (TypeError, ValueError):
            continue

        if movie_id not in ranked_id_set:
            continue

        match_scores[str(movie_id)] = max(60, min(score, 99))

    return match_scores


async def rerank_recommendations_with_fallback(request: RerankRequest) -> RerankResponse:
    try:
        settings = get_AI_settings()
        client = get_llm_client()

        started_at = time.perf_counter()
        print(
            f"[AI Reranker] Starting LLM rerank for {len(request.candidates)} candidates",
            flush=True,
        )

        last_error: Exception | None = None
        for use_json_mode in (True, False):
            request_kwargs = {
                "model": settings.LLM_MODEL,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": _user_message(request),
                    },
                ],
                "temperature": 0,
                "top_p": 0.95,
                "stream": False,
            }
            if use_json_mode:
                request_kwargs["response_format"] = {"type": "json_object"}

            try:
                completion = await client.chat.completions.create(**request_kwargs)

                elapsed = time.perf_counter() - started_at
                mode = "json_mode" if use_json_mode else "plain_mode"
                print(f"[AI Reranker] LLM rerank completed mode={mode} in {elapsed:.2f}s", flush=True)

                raw_content = completion.choices[0].message.content
                if raw_content is None:
                    raise ValueError("empty_llm_output")

                payload = _extract_ranked_ids_payload(raw_content)
                raw_ranked_ids = payload.get("ranked_ids")
                if not isinstance(raw_ranked_ids, list):
                    raise ValueError("invalid_ranked_ids")

                ranked_ids = _validate_ranked_ids(
                    [movie_id for movie_id in raw_ranked_ids if isinstance(movie_id, int)],
                    request,
                )
                if not ranked_ids:
                    return _fallback_response("empty_ranked_ids")

                match_scores = _validate_match_scores(payload.get("match_scores"), ranked_ids)
                return RerankResponse(
                    ranked_ids=ranked_ids,
                    match_scores=match_scores,
                    fallback_reason=None,
                )
            except (json.JSONDecodeError, ValidationError, ValueError, TypeError) as exc:
                last_error = exc
                mode = "json_mode" if use_json_mode else "plain_mode"
                raw_sample = locals().get("raw_content")
                print(
                    f"[AI Reranker] Invalid LLM output mode={mode}: {exc}; sample={raw_sample!r}",
                    flush=True,
                )

        print(f"[AI Reranker] Exception details: {last_error}", flush=True)
        return _fallback_response("invalid_llm_output")

    except (asyncio.TimeoutError, json.JSONDecodeError, ValidationError, ValueError, TypeError) as exc:
        print(f"[AI Reranker] Exception details: {exc}", flush=True)
        return _fallback_response("invalid_llm_output")
