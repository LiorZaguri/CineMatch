"""
Database Configuration Module.

This module sets up the asynchronous SQLAlchemy engine and session factory.
It provides lifecycle functions for verifying and disposing of database connections,
as well as a dependency function `get_db` for managing database sessions in routes.
"""
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .config import get_settings

# Load settings from the configuration module.
# Using lru_cache ensures we don't re-read the environment variables on every import.
settings = get_settings()

# Retrieve the database URL constructed in the settings.
SQLALCHEMY_DATABASE_URL = settings.database_url

# Create the SQLAlchemy Engine.
# pool_pre_ping=True: Checks the connection before using it (prevents "server has gone away" errors).
# echo=True: Logs all generated SQL to stdout (useful for debugging, disable in production).
engine = create_async_engine(
    SQLALCHEMY_DATABASE_URL, 
    pool_pre_ping=True, 
    echo=True
)


# Create a SessionLocal class.
# This is a factory for creating new database sessions.
# expire_on_commit=False: Prevents attributes from expiring after commit (essential for async workflows).
SessionLocal = async_sessionmaker(
    bind=engine, 
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False
)


async def init_db():
    """
    Verifies the database connection on application startup.
    
    Executes a basic 'SELECT 1' query to ensure the database is reachable.
    If the connection fails, it catches the exception, logs a critical error,
    and re-raises it to prevent the application from starting in an invalid state.
    """
    print("[DB] Verifying database connection...", flush=True)        
    try:
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))

            print("[DB] Database connection verified successfully.", flush=True)
    except Exception as e:
        # If the database is down, it's better to know immediately on startup
        print(f"[DB] CRITICAL: Failed to connect to the database: {e}", flush=True)
        raise e  # Optionally raise to stop FastAPI from starting if the DB is strictly required


async def close_db():
    """
    Gracefully closes the database connection pool during application shutdown.
    
    Releases all active connections to the database by calling engine.dispose().
    """
    print("[DB] Disposing of database connection pool...", flush=True)
    # .dispose() closes all connections in the pool gracefully
    await engine.dispose()
    print("[DB] Database connections closed.", flush=True)

async def get_db():
    """
    FastAPI dependency that yields an asynchronous database session.
    
    Ensures the session is automatically and safely closed after the request finishes.
    """
    async with SessionLocal() as db:
        yield db
