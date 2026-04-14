from collections.abc import Sequence

from pydantic import BaseModel, Field, ValidationError


class ReviewInput(BaseModel):
    rating: float = Field(ge=1, le=10)
    content: str = Field(min_length=1, max_length=1000)


class SummaryRequest(BaseModel):
    movie_title: str | None = Field(default=None, min_length=1, max_length=200)
    reviews: list[ReviewInput] = Field(min_length=1, max_length=20)
    instructions: str | None = Field(default=None, min_length=1, max_length=4000)
    max_words: int | None = Field(default=120, ge=20, le=600)
    max_output_tokens: int | None = Field(default=300, ge=64, le=2000)
    max_tokens: int | None = Field(default=None, ge=64, le=2000)
    max_completion_tokens: int | None = Field(default=None, ge=64, le=2000)


class SummaryResponse(BaseModel):
    ok: bool
    summary: str | None = Field(default=None, min_length=1)
    error: str | None = None


def normalize_reviews(reviews: Sequence[ReviewInput | dict]) -> list[ReviewInput]:
    normalized: list[ReviewInput] = []
    for review in reviews:
        try:
            normalized.append(
                review if isinstance(review, ReviewInput) else ReviewInput.model_validate(review)
            )
        except ValidationError as exc:
            raise ValueError(f"Invalid review payload: {exc}") from exc

    if not normalized:
        raise ValueError("At least one review is required.")

    return normalized
