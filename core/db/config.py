"""
Configuration Management Module.

This module handles loading application settings and environment variables
using Pydantic. It defines the database connection parameters and provides
a cached function to access these settings efficiently.
"""

from functools import lru_cache
from pathlib import Path

from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Determine the path to the .env file.
# We navigate up from core/db/config.py to the project root (CineMatch/).
ENV_FILE_PATH = Path(__file__).resolve().parent.parent / ".env"


class Setting(BaseSettings):
    """
    Application Settings Class.
    Inherits from BaseSettings to automatically load fields from environment variables.
    """

    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_DB: str
    POSTGRES_HOST: str
    POSTGRES_PORT: str

    # Configuration for Pydantic Settings
    # env_file: Path to the environment file
    # extra="ignore": Ignore any extra environment variables not defined in this class
    model_config = SettingsConfigDict(
        env_file=ENV_FILE_PATH, env_file_encoding="utf-8", extra="ignore"
    )

    @computed_field
    @property
    def database_url(self) -> str:
        """
        Constructs the SQLAlchemy database URL from individual components.
        The @computed_field decorator ensures this property is included when serialized.
        """
        return f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}?ssl=require"


@lru_cache()
def get_settings() -> Setting:
    """
    Factory function to create and cache the Setting instance.
    """
    return Setting()
