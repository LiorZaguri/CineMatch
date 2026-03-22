"""
RabbitMQ Configuration Module.

This module handles loading RabbitMQ-related settings and environment variables
using Pydantic. It defines the connection parameters and provides
a cached function to access these settings efficiently.
"""
from functools import lru_cache
from pathlib import Path

from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Determine the path to the .env file.
# We navigate up from core/services/rabbitmq/config.py to the project root (CineMatch/).
ENV_FILE_PATH = Path(__file__).resolve().parent.parent.parent / ".env"

class RabbitMQSettings(BaseSettings):
    """
    RabbitMQ Settings Class.
    Inherits from BaseSettings to automatically load fields from environment variables.
    """

    RABBITMQ_USER: str
    RABBITMQ_PASSWORD: str
    RABBITMQ_HOST: str
    RABBITMQ_PORT: int
    AI_RECOMMENDATION_QUEUE: str
    AI_REVIEW_SUMMARIZER_QUEUE: str



    # Configuration for Pydantic Settings
    # env_file: Path to the environment file
    # extra="ignore": Ignore any extra environment variables not defined in this class
    model_config = SettingsConfigDict(
        env_file=ENV_FILE_PATH, env_file_encoding="utf-8", extra="ignore"
    )

    @computed_field
    @property
    def rabbitmq_url(self) -> str:
        """
        Constructs the RabbitMQ connection URL.
        """
        return f"amqp://{self.RABBITMQ_USER}:{self.RABBITMQ_PASSWORD}@{self.RABBITMQ_HOST}:{self.RABBITMQ_PORT}/"
    
@lru_cache
def get_rabbitmq_settings() -> RabbitMQSettings:
    """
    Factory function to create and cache the RabbitMQSettings instance.
    """
    return RabbitMQSettings()