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

    Use only these filter fields:
    certification
    language
    original_language
    reference_title
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

    Rules:
    - Return all relevant filters and no irrelevant filters.
    - Use "discover" for structured movie requests.
    - Use "keyword" for vague but movie-related requests.
    - Apply spelling correction and normalization to every string value you emit in "filters".
    - If you emit "query", it must be a corrected English search phrase that preserves the user's intended meaning, not the raw typo-filled text.
    - Treat requests such as "like", "similar to", "same vibe as", "in the style of", or comparable phrasing as similarity requests, not direct title lookup requests.
    - For similarity requests like "movies like Harry Potter", prefer "mode": "discover" and set "reference_title" to the corrected movie or franchise name.
    - For similarity requests, do not put only the reference title into "query". "query" is for direct title search, not for "movies like X" intent.
    - The backend will use "reference_title" to look up the reference movie, read its genres and a subset of its keywords, and then search for related movies.
    - If the user is searching by movie title or clearly naming a specific movie, put that title request in "query" because title matching should use TMDB search, not discover-only filters.
    - Prefer "query" for requests like "find Titanic", "movie Inception", or misspelled title searches such as "interstelar".
    - Disambiguation rule:
      - "find Titanic" -> use "query"
      - "movies like Titanic" -> set "reference_title" to "Titanic" and use "discover"
    - If unsure but movie-related, return:
    {
        "mode": "keyword",
        "filters": {
        "query": "<corrected English query preserving the user's intent>"
        },
        "fallback_reason": null
    }

    Global spelling correction and normalization rules:
    - The user may misspell actor names, director names, movie titles, character names, franchise names, genres, certifications, languages, sort intent, or topical keywords.
    - Correct obvious spelling mistakes, missing letters, swapped letters, phonetic spellings, spacing issues, and casing issues before returning structured values.
    - Normalize every free-text value you output, not only names or keywords. This applies to any string field and to every string item inside arrays.
    - Return the most likely canonical English spelling or canonical TMDB-friendly value when the intended meaning is clear.
    - Normalize text before mapping it into numeric, boolean, date, or enum-like outputs.
    - Keep numeric, boolean, and date outputs structurally correct. Do not turn numbers, booleans, or dates into strings just because the user misspelled surrounding words.
    - If the intended correction is not reasonably clear, do not invent a specific person, title, keyword, genre, or other entity. In that case preserve the broad meaning as best as possible in a corrected "query".
    - When the user asks for movies similar to a known movie or franchise, set "reference_title" to the corrected canonical title or franchise name and let the backend derive genres and some keywords from it.
    - For similarity requests, you may still add extra discover filters when the user adds extra intent beyond the reference movie, such as tone, runtime, date range, quality, language, cast, or crew preferences.
    - If the reference movie or franchise is not recognized confidently, do not invent a "reference_title". Fall back to a corrected "query" that preserves the user's intent.
    - with_genres and without_genres must be JSON arrays of integers, even for one value.
    - with_cast and with_crew may be JSON arrays of TMDB person IDs or cast/crew names.
    - with_keywords may be a JSON array of TMDB keyword IDs or clean keyword/topic names.
    - certification, language, original_language, sort_by, query, and reference_title are string fields and must contain normalized, corrected values when used.
    - Example: "with_genres": [28], not "with_genres": 28
    - Example: "with_cast": ["Gal Gadot"] or "with_cast": [31]
    - Example: "with_keywords": ["school"] or "with_keywords": [1234]
    - Example: "reference_title": "Harry Potter"
    - Example: "query": "Titanic"
    - Example: "query": "Interstellar"
    - If the user asks for movies in a specific spoken language, set "original_language" to that language's ISO 639-1 code.
      For example, "movies in Spanish" becomes "original_language": "es".
      Apply the same rule even if the language name is misspelled, such as "spanich".
    - Use "language" only when the user wants localized TMDB response fields, not movie spoken language.
    - language must be a string such as "ar", "en", or "fr".
    - original_language must be a string such as "ar", "en", or "fr".
    - Dates must use YYYY-MM-DD.
    - Numeric filters must be numbers, not strings.
    - include_adult is false unless explicitly requested.
    - "good", "best", "high-rated", "top-rated", "excellent", "quality" -> prefer movies with high vote_average and high vote_count.
    - "bad", "worst", "low-rated", "terrible", "poor" -> prefer movies with low vote_average and low vote_count.
    - If the user asks for a "good" movie, set a higher vote_average_gte (e.g. 7.0 or above) and encourage higher vote_count_gte.
    - If the user asks for a "bad" movie, set a lower vote_average_lte (e.g. 5.0 or below) and allow lower vote_count_gte.
    - When the user mentions an actor, actress, or cast member by name, return that person in "with_cast" so the core service can resolve the name to a TMDB person ID.
    - Normalize misspelled person names to their corrected canonical form before adding them to "with_cast".
    - When the user mentions a director, writer, or other crew member by name, return that person in "with_crew" using the corrected canonical form.
    - When the user expresses a topic or keyword search such as "wizards", "space adventure", or "romantic comedy", return only the clean keyword/topic term(s) in "with_keywords" so the core service can resolve them to TMDB keyword IDs.
    - Normalize misspelled keyword/topic terms to their corrected canonical form before adding them to "with_keywords".
    - Do not include generic words like "movie", "film", "with", "about", "related", or "in" in the keyword values.
    - If the TMDB person ID or keyword ID is unknown, return the actor/keyword name string rather than inventing a number.

    Example:
    {
    "mode": "discover",
    "filters": {
        "with_genres": [28],
        "primary_release_year": 2016
    },
    "fallback_reason": null
    }

    - Examples:
      - "tom holand" -> "Tom Holland"
      - "movies by scorcese" -> "Martin Scorsese"
      - "rommantic comdy" -> "romantic comedy"
      - "movies in spanich" -> original_language "es"
      - fallback query example: "moovies like harry poter but darker" -> query "movies like Harry Potter but darker"

    Example:
    {
    "mode": "discover",
    "filters": {
        "with_cast": ["Tom Holland"],
        "primary_release_date_gte": "1980-01-01",
        "primary_release_date_lte": "1989-12-31"
    },
    "fallback_reason": null
    }

    Example:
    {
    "mode": "keyword",
    "filters": {
        "query": "Interstellar"
    },
    "fallback_reason": null
    }

    Example:
    {
    "mode": "discover",
    "filters": {
        "reference_title": "Harry Potter"
    },
    "fallback_reason": null
    }

    Example:
    {
    "mode": "discover",
    "filters": {
        "reference_title": "Interstellar"
    },
    "fallback_reason": null
    }

    Example:
    {
    "mode": "discover",
    "filters": {
        "reference_title": "Titanic",
        "with_keywords": ["darker"]
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

    except Exception as e:
        # Catching all exceptions to ensure we always return a valid fallback 
        # for the search system, regardless of whether it's a timeout, 
        # validation error, or a connection issue with the LLM provider.
        print(f"[AI Parser] Exception encountered: {type(e).__name__} - {e}", flush=True)
        return ParsedSearchResponse(
            mode="keyword",
            filters=SearchFilters(
                query=prompt,
                include_adult=False,
            ),
            fallback_reason="ai_service_error",
        )

