import json
import re
from openai import OpenAI
from services.AImodel.config import get_AI_settings
from schemas import ParsedSearchResponse, SearchFilters
from pydantic import ValidationError

SYSTEM_PROMPT = """
You are a movie query parser.

Your job is only to convert movie-related user requests into strict JSON for movie search.
Do not answer questions.
Do not explain anything.
Do not return markdown.
Do not add text before or after the JSON.

If the user prompt is not about movies, films, cinema, genres, actors, directors, release periods,
or movie recommendations, return this exact JSON shape:
{
  "mode": "keyword",
  "filters": {
    "query": null,
    "page": 1,
    "include_adult": false
  },
  "fallback_reason": "not_movie_related"
}

For movie-related prompts, return only this structure:
{
  "mode": "discover" | "keyword",
  "filters": {
    "with_genres": [number],
    "primary_release_date_gte": "YYYY-MM-DD" | null,
    "primary_release_date_lte": "YYYY-MM-DD" | null,
    "vote_average_gte": number | null,
    "vote_count_gte": number | null,
    "with_original_language": "string" | null,
    "sort_by": "string" | null,
    "include_adult": false,
    "page": number,
    "query": "string" | null
  }
}

Rules:
- Return valid JSON only.
- Never answer the user directly.
- Only handle movie-related requests.
- Use "discover" when the request clearly maps to filters.
- Use "keyword" when the request is movie-related but vague or uncertain.
- If unsure, set mode to "keyword" and place the original request inside filters.query.
- Do not invent unsupported fields.
- Keep include_adult false.
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

def get_llm_client() -> OpenAI:
    settings = get_AI_settings()
    return OpenAI(
        base_url=settings.LLM_BASE_URL,
        api_key=settings.API_KEY,
    )


def parse_user_prompt(prompt: str, page: int = 1) -> ParsedSearchResponse:
    settings = get_AI_settings()
    client = get_llm_client()

    completion = client.chat.completions.create(
        model=settings.LLM_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"User prompt: {prompt}\nPage: {page}",
            },
        ],
        temperature=0,
        top_p=0.95,
        max_tokens=1024,
        stream=False,
    )

    raw_content = completion.choices[0].message.content

    if raw_content is None:
        raise ValueError("LLM returned empty content")

    payload = _extract_json_payload(raw_content)
    return ParsedSearchResponse.model_validate(payload)


def parse_user_prompt_with_fallback(prompt: str, page: int = 1) -> ParsedSearchResponse:
    try:
        parsed = parse_user_prompt(prompt, page=page)
        return parsed

    except (json.JSONDecodeError, ValidationError, ValueError, TypeError):
        return ParsedSearchResponse(
            mode="keyword",
            filters=SearchFilters(
                query=prompt,
                page=page,
                include_adult=False,
            ),
            fallback_reason="invalid_llm_output",
        )

