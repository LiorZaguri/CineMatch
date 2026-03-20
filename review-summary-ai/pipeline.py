import json
import re
import statistics
from collections.abc import Sequence

from openai import OpenAI

from config import get_settings
from prompt import SYSTEM_PROMPT
from schemas import ReviewInput, normalize_reviews

MAX_REVIEW_CHARS = 600
MAX_BATCH_CHARS = 6000


def _extract_summary(raw_content: str) -> str:
    cleaned = raw_content.strip()
    fenced = cleaned
    if fenced.startswith("```"):
        fenced = fenced.removeprefix("```json").removeprefix("```").strip()
        if fenced.endswith("```"):
            fenced = fenced[:-3].strip()

    candidates = [fenced]

    start = fenced.find("{")
    end = fenced.rfind("}")
    if start != -1 and end != -1 and end > start:
        candidates.append(fenced[start : end + 1])

    for candidate in candidates:
        try:
            payload = json.loads(candidate)
        except json.JSONDecodeError:
            continue

        summary = payload.get("summary") if isinstance(payload, dict) else None
        if isinstance(summary, str) and summary.strip():
            return summary.strip()

    plain_text = re.sub(r"^\s*summary\s*:\s*", "", fenced, flags=re.IGNORECASE).strip()
    if plain_text and "{" not in plain_text and "}" not in plain_text:
        return plain_text

    raise ValueError("Model response did not include a valid summary.")


def fallback_summary(reviews: Sequence[ReviewInput | dict]) -> str:
    normalized_reviews = normalize_reviews(reviews)
    average_rating = round(statistics.fmean(review.rating for review in normalized_reviews), 2)
    consensus = "positive" if average_rating >= 7 else "mixed" if average_rating >= 5 else "negative"
    snippets = " ".join(review.content.strip() for review in normalized_reviews[:3])
    return (
        f"Overall audience consensus is {consensus}. "
        f"The average rating across {len(normalized_reviews)} reviews is {average_rating}/10. "
        f"Common points mentioned include: {snippets[:500]}"
    ).strip()


class ReviewSummaryPipeline:
    def __init__(self, *, client: OpenAI, model: str | None = None) -> None:
        settings = get_settings()
        self.client = client
        self.model = model or settings.LLM_MODEL

    def summarize(
        self,
        reviews: Sequence[ReviewInput | dict],
        *,
        movie_title: str | None = None,
    ) -> str:
        normalized_reviews = normalize_reviews(reviews)
        review_lines: list[str] = []
        total_chars = 0

        for review in normalized_reviews:
            content = review.content.strip()[:MAX_REVIEW_CHARS]
            line = f"- rating={review.rating}/10 review={content}"
            total_chars += len(line)
            if total_chars > MAX_BATCH_CHARS:
                break
            review_lines.append(line)

        if not review_lines:
            raise ValueError("No usable review content available for summarization.")

        user_prompt = "Reviews:\n" + "\n".join(review_lines)
        if movie_title:
            user_prompt = f"Movie title: {movie_title.strip()[:200]}\n" + user_prompt

        completion = self.client.chat.completions.create(
            model=self.model,
            temperature=0.2,
            max_tokens=400,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
        )

        raw_content = completion.choices[0].message.content
        if raw_content is None:
            raise ValueError("Model returned empty content.")

        return _extract_summary(raw_content)

    def summarize_with_fallback(
        self,
        reviews: Sequence[ReviewInput | dict],
        *,
        movie_title: str | None = None,
    ) -> str:
        normalized_reviews = normalize_reviews(reviews)
        try:
            return self.summarize(normalized_reviews, movie_title=movie_title)
        except Exception:
            return fallback_summary(normalized_reviews)


def summarize_reviews(
    reviews: Sequence[ReviewInput | dict],
    *,
    client: OpenAI,
    model: str | None = None,
    movie_title: str | None = None,
) -> str:
    pipeline = ReviewSummaryPipeline(client=client, model=model)
    return pipeline.summarize(reviews, movie_title=movie_title)
