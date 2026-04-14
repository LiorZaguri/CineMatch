import json
import re
from collections.abc import Sequence

from openai import OpenAI

from config import get_settings
from prompt import SYSTEM_PROMPT
from schemas import ReviewInput, normalize_reviews

MAX_REVIEW_CHARS = 600
MAX_BATCH_CHARS = 6000
DEFAULT_MAX_WORDS = 120
DEFAULT_MAX_OUTPUT_TOKENS = 300


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


def _trim_to_word_limit(value: str, max_words: int) -> str:
    words = value.split()
    if len(words) <= max_words:
        return value.strip()
    return " ".join(words[:max_words]).strip()


def _normalize_summary(value: str, max_words: int) -> str:
    cleaned = _trim_to_word_limit(re.sub(r"\s+", " ", value).strip(), max_words=max_words)
    if not cleaned:
        raise ValueError("Summary was empty after normalization.")

    if cleaned[-1] in ".!?":
        return cleaned

    last_sentence_end = max(cleaned.rfind("."), cleaned.rfind("!"), cleaned.rfind("?"))
    if last_sentence_end >= 0:
        completed = cleaned[: last_sentence_end + 1].strip()
        if completed:
            return completed

    return f"{cleaned.rstrip(' ,;:')}."


def fallback_summary(reviews: Sequence[ReviewInput | dict], *, max_words: int = DEFAULT_MAX_WORDS) -> str:
    normalized_reviews = normalize_reviews(reviews)
    ratings = [review.rating for review in normalized_reviews]
    average_rating = sum(ratings) / len(ratings)
    if average_rating >= 7.5:
        consensus = "Audience sentiment is strongly positive overall."
    elif average_rating >= 6:
        consensus = "Audience sentiment is generally positive with some reservations."
    elif average_rating >= 4.5:
        consensus = "Audience reactions are mixed."
    else:
        consensus = "Audience sentiment is mostly negative."

    strengths: list[str] = []
    criticisms: list[str] = []
    for review in normalized_reviews[:5]:
        text = review.content.strip()
        if len(text) < 20:
            continue
        if review.rating >= 7 and len(strengths) < 2:
            strengths.append(text[:120].rstrip(" ,;:"))
        elif review.rating <= 5 and len(criticisms) < 2:
            criticisms.append(text[:120].rstrip(" ,;:"))

    parts = [consensus]
    if strengths:
        parts.append("Positive reviews often praise the film's atmosphere, performances, or emotional impact.")
    if criticisms:
        parts.append("More critical reviews point to weaker pacing, writing, or payoff.")
    if not strengths and not criticisms:
        parts.append("The available reviews are limited, but they still suggest a clear overall reaction.")

    return _normalize_summary(" ".join(parts), max_words=max_words)


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
        instructions: str | None = None,
        max_output_tokens: int = DEFAULT_MAX_OUTPUT_TOKENS,
        max_words: int = DEFAULT_MAX_WORDS,
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
        user_prompt += f"\n\nTarget length: 3 to 5 sentences, under {max_words} words."
        if instructions:
            user_prompt += f"\nAdditional instructions:\n{instructions.strip()[:2000]}"
        user_prompt += (
            "\nReturn only a single JSON object in the exact shape "
            '{"summary":"..."} and nothing before or after it. '
            "Do not include analysis, notes, or hidden reasoning in the visible output."
        )
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ]

        errors: list[str] = []
        for use_json_mode in (True, False):
            mode = "json_mode" if use_json_mode else "plain_mode"
            try:
                request_kwargs = {
                    "model": self.model,
                    "temperature": 0.2,
                    "max_tokens": max_output_tokens,
                    "messages": messages,
                }
                if use_json_mode:
                    request_kwargs["response_format"] = {"type": "json_object"}

                print(
                    f"[ReviewSummaryPipeline] requesting summary mode={mode} model={self.model} "
                    f"reviews={len(review_lines)} max_tokens={max_output_tokens}",
                    flush=True,
                )
                completion = self.client.chat.completions.create(**request_kwargs)
                raw_content = completion.choices[0].message.content
                print(
                    f"[ReviewSummaryPipeline] raw_response mode={mode}: {raw_content!r}",
                    flush=True,
                )
                if raw_content is None:
                    raise ValueError("Model returned empty content.")

                return _normalize_summary(_extract_summary(raw_content), max_words=max_words)
            except Exception as exc:
                print(
                    f"[ReviewSummaryPipeline] mode_failed mode={mode}: {exc}",
                    flush=True,
                )
                errors.append(f"{mode}: {exc}")

        raise ValueError("; ".join(errors))

def summarize_reviews(
    reviews: Sequence[ReviewInput | dict],
    *,
    client: OpenAI,
    model: str | None = None,
    movie_title: str | None = None,
    instructions: str | None = None,
    max_output_tokens: int = DEFAULT_MAX_OUTPUT_TOKENS,
    max_words: int = DEFAULT_MAX_WORDS,
) -> str:
    pipeline = ReviewSummaryPipeline(client=client, model=model)
    return pipeline.summarize(
        reviews,
        movie_title=movie_title,
        instructions=instructions,
        max_output_tokens=max_output_tokens,
        max_words=max_words,
    )
