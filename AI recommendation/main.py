from contextlib import asynccontextmanager
from fastapi import FastAPI, Query
from consumer import SearchConsumer
from llm_parser import parse_user_prompt_with_fallback

consumer = SearchConsumer()

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[AI recommendation] Start FastApi")
    await consumer.start()
    yield
    await consumer.close()
    print("[AI recommendation] Shutting down FastApi")

app = FastAPI(
    title="CineMatch AI Recommender",
    lifespan=lifespan,
)

@app.get("/health")
async def health_check():
    return {"status": "OK"}

@app.get("/debug/parse")
async def debug_parse(prompt: str = Query(..., min_length=1)):
    parsed = parse_user_prompt_with_fallback(prompt=prompt, page=1)
    return parsed.model_dump()
    
    
