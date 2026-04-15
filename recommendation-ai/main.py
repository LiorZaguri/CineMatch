from contextlib import asynccontextmanager
from fastapi import FastAPI, Query
from consumer import SearchConsumer
from llm_parser import parse_user_prompt_with_fallback

consumer = SearchConsumer()

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[AI recommendation] Starting AI Recommendation Service...")
    try:
        await consumer.start()
    except Exception as e:
        # We catch the exception to allow the FastAPI application to start.
        # This keeps the health check and debug routes active even if RabbitMQ is down.
        print(f"[AI recommendation] WARNING: Failed to initialize RabbitMQ on startup: {e}")
        print("[AI recommendation] The consumer is NOT active. Please check your RabbitMQ connection.")
    
    yield
    
    await consumer.close()
    print("[AI recommendation] Shutting down AI Recommendation Service...")

app = FastAPI(
    title="CineMatch AI Recommender",
    lifespan=lifespan,
)

@app.get("/health")
async def health_check():
    # Basic health check that also reports RabbitMQ status
    rabbitmq_status = "connected" if consumer.connection and not consumer.connection.is_closed else "disconnected"
    return {
        "status": "OK",
        "rabbitmq": rabbitmq_status
    }

@app.get("/debug/parse")
async def debug_parse(prompt: str = Query(..., min_length=1)):
    parsed = await parse_user_prompt_with_fallback(prompt=prompt)
    return parsed.model_dump()
    
    
