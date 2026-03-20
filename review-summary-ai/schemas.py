from collections.abc import Sequence

from pydantic import BaseModel, Field, ValidationError


class ReviewInput(BaseModel):
    rating: int = Field(ge=1, le=10)
    content: str = Field(min_length=1, max_length=1000)


class SummaryRequest(BaseModel):
    movie_title: str | None = Field(default=None, min_length=1, max_length=200)
    reviews: list[ReviewInput] = Field(min_length=1, max_length=20)


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
