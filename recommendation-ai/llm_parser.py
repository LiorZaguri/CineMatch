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

    The user prompt may be in any language. Understand the intent regardless of language
    and return the structured filters in English JSON using the fields below.

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

    When the user mentions an actor, actress, or cast member by name, return that person in "with_cast" so the core service can resolve the name to a TMDB person ID.
    When the user expresses a topic or keyword search such as "wizards", "space adventure", or "romantic comedy", return only the clean keyword/topic term(s) in "with_keywords" so the core service can resolve them to TMDB keyword IDs.
    Do not include generic words like "movie", "film", "with", "about", "related", or "in" in the keyword values.
    If the TMDB person ID or keyword ID is unknown, return the actor/keyword name string rather than inventing a number.

    Define what "good" and "bad" mean:
    - "good", "best", "high-rated", "top-rated", "excellent", "quality" -> prefer movies with high vote_average and high vote_count.
    - "bad", "worst", "low-rated", "terrible", "poor" -> prefer movies with low vote_average and low vote_count.
    - If the user asks for a "good" movie, set a higher vote_average_gte (e.g. 7.0 or above) and encourage higher vote_count_gte.
    - If the user asks for a "bad" movie, set a lower vote_average_lte (e.g. 5.0 or below) and allow lower vote_count_gte.

    Use only these filter fields:
    certification
    language
    original_language
    with_genres
    without_genres
    with_cast
    with_crew
    with_keywords
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
    - with_genres and without_genres must be JSON arrays of integers, even for one value.
    - with_cast and with_crew may be JSON arrays of TMDB person IDs or cast/crew names.
    - with_keywords may be a JSON array of TMDB keyword IDs or clean keyword/topic names.
    - Example: "with_genres": [28], not "with_genres": 28
    - Example: "with_cast": ["Gal Gadot"] or "with_cast": [31]
    - Example: "with_keywords": ["school"] or "with_keywords": [1234]
    - If the user asks for movies in a specific spoken language, set "original_language" to that language's ISO 639-1 code.
      For example, "movies in Spanish" becomes "original_language": "es".
    - Use "language" only when the user wants localized TMDB response fields, not movie spoken language.
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

