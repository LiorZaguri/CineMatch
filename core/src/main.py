"""
This module is the main entry point for the Core FastAPI application.
It defines the FastAPI app instance, lifespan events, and API endpoints for
managing movies.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from db.db import init_db, close_db
from routers.movies import router as movies_router
from services.rabbitmq.rabbitmq import close_rabbitmq, init_rabbitmq
from services.s3.s3_service import close_s3, init_s3_bucket
from services.tmdb.tmdbservice import init_tmdb, close_tmdb


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for the FastAPI application.
    
    Handles the initialization of external resources (Database, S3, RabbitMQ, TMDB)
    on startup and performs necessary graceful cleanup on shutdown.
    """
    print("[Core] Start FastApi")
    # Verify the database connection
    await init_db()
    # Initialize the S3 bucket (create if not exists)
    init_s3_bucket()
    # Initialize RabbitMQ (connect and declare exchanges)
    await init_rabbitmq()

    # Initialize the global TMDB API HTTP client
    init_tmdb()
    
    
    # Yield control to the application to start serving requests
    yield
    
    # Code after yield runs on application shutdown
    print("[Core] Shutting Down FastApi")

    # Dispose of the database connection pool
    await close_db()

    # Gracefully close the RabbitMQ connection
    await close_rabbitmq()

    # Close the S3 client connection
    close_s3()

    # Close the TMDB API HTTP client
    await close_tmdb()





# Initialize the FastAPI application with a title and the lifespan context manager.
app = FastAPI(
    title="CineMatch Core API",
    lifespan=lifespan
)

# Include routers to register API endpoints
app.include_router(movies_router)


@app.get("/api/health/", tags=["Health"])
def health_check():
    """
    Simple health check endpoint to verify the service is running.
    """
    return {"status": "OK"}
