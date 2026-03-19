import json
import re
from openai import AsyncOpenAI
from services.AImodel.config import get_AI_settings
from schemas import ParsedSearchResponse, SearchFilters
from pydantic import ValidationError
import asyncio
import time



SYSTEM_PROMPT = """
    Convert movie-related user requests into strict JSON.

    Return JSON only.
    No markdown.
    No explanation.
    No extra text.
    Never answer the user directly.

    Output:
    {
    "mode": "discover" | "keyword",
    "filters": { ... },
    "fallback_reason": "not_movie_related" | null
    }

    If the prompt is not about movies, return exactly:
    {
    "mode": "keyword",
    "filters": {},
    "fallback_reason": "not_movie_related"
    }

    Use only these filter fields:
    certification
    language
    original_language
    with_genres
    without_genres
    with_cast
    with_crew
    year
    primary_release_year
    primary_release_date_gte
    primary_release_date_lte
    release_date_gte
    release_date_lte
    with_runtime_gte
    with_runtime_lte
    vote_average_gte
    vote_average_lte
    vote_count_gte
    vote_count_lte
    sort_by
    include_adult
    query

    Rules:
    - Return all relevant filters and no irrelevant filters.
    - Use "discover" for structured movie requests.
    - Use "keyword" for vague but movie-related requests.
    - If unsure but movie-related, return:
    {
        "mode": "keyword",
        "filters": {
        "query": "<original user request>"
        },
        "fallback_reason": null
    }

    Value rules:
    - with_genres, without_genres, with_cast, and with_crew must always be JSON arrays of integers, even for one value.
    - Example: "with_genres": [28], not "with_genres": 28
    - Example: "with_cast": [31], not "with_cast": 31
    - language must be a string such as "ar", "en", or "fr".
    - original_language must be a string such as "ar", "en", or "fr".
    - Dates must use YYYY-MM-DD.
    - Numeric filters must be numbers, not strings.
    - include_adult is false unless explicitly requested.

    Genre IDs:
    Action=28
    Adventure=12
    Animation=16
    Comedy=35
    Crime=80
    Documentary=99
    Drama=18
    Family=10751
    Fantasy=14
    History=36
    Horror=27
    Music=10402
    Mystery=9648
    Romance=10749
    Science Fiction=878
    TV Movie=10770
    Thriller=53
    War=10752
    Western=37

    Example:
    {
    "mode": "discover",
    "filters": {
        "with_genres": [28],
        "primary_release_year": 2016
    },
    "fallback_reason": null
    }
    """.strip()



def _extract_json_payload(raw_content: str) -> dict:
    cleaned = raw_content.strip()

    # Common model behavior is to wrap JSON in markdown fences.
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
        cleaned = cleaned.strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise json.JSONDecodeError("No JSON object found", cleaned, 0)

    return json.loads(cleaned[start : end + 1])

def get_llm_client() -> AsyncOpenAI:
    settings = get_AI_settings()
    return AsyncOpenAI(
        base_url=settings.LLM_BASE_URL,
        api_key=settings.API_KEY,
    )



async def parse_user_prompt(prompt: str) -> ParsedSearchResponse:
    settings = get_AI_settings()
    client = get_llm_client()

    started_at = time.perf_counter()
    print(f"[AI Parser] Starting LLM call for prompt: {prompt}", flush=True)

    completion = await asyncio.wait_for(
    client.chat.completions.create(
        model=settings.LLM_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"User prompt: {prompt}",
            },
        ],
        temperature=0,
        top_p=0.95,
        max_tokens=800,
        stream=False,
    ),
    timeout=60.0,
)
    elapsed = time.perf_counter() - started_at
    print(f"[AI Parser] LLM call completed in {elapsed:.2f}s", flush=True)
    raw_content = completion.choices[0].message.content
    if raw_content is None:
        raise ValueError("LLM returned empty content")

    payload = _extract_json_payload(raw_content)
    return ParsedSearchResponse.model_validate(payload)


async def parse_user_prompt_with_fallback(prompt: str) -> ParsedSearchResponse:
    try:
        parsed = await parse_user_prompt(prompt)
        return parsed

    except (asyncio.TimeoutError, json.JSONDecodeError, ValidationError, ValueError, TypeError) as e:
        print(f"[AI Parser] Exception details: {e}", flush=True)
        return ParsedSearchResponse(
            mode="keyword",
            filters=SearchFilters(
                query=prompt,
                include_adult=False,
            ),
            fallback_reason="invalid_llm_output",
        )

