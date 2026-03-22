from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException

from config import get_settings
from worker import ReviewSummaryWorker
from schemas import SummaryRequest, SummaryResponse


@asynccontextmanager
async def lifespan(app: FastAPI):
    worker = ReviewSummaryWorker()
    app.state.worker = worker
    await worker.start()
    try:
        yield
    finally:
        await worker.close()


app = FastAPI(
    title="CineMatch Review Summary AI",
    lifespan=lifespan,
)


@app.get("/health")
async def health_check():
    settings = get_settings()
    return {
        "status": "ok",
        "queue": settings.AI_REVIEW_SUMMARIZER_QUEUE,
    }


@app.post("/summarize", response_model=SummaryResponse)
async def summarize_reviews(payload: SummaryRequest):
    worker = app.state.worker

    try:
        if worker.pipeline is None:
            raise RuntimeError("worker_not_initialized")
        summary = worker.pipeline.summarize_with_fallback(
            payload.reviews,
            movie_title=payload.movie_title,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "error": "summarization_failed",
            },
        ) from exc

    return SummaryResponse(
        ok=True,
        summary=summary,
    )
