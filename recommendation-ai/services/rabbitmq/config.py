from functools import lru_cache
from pathlib import Path
from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


ENV_FILE_PATH = Path(__file__).resolve().parents[2] / ".env"


class RabbitMQ(BaseSettings):
    RABBITMQ_USER: str
    RABBITMQ_PASSWORD: str
    RABBITMQ_HOST: str
    RABBITMQ_PORT: int
    AI_SEARCH_QUEUE: str

    model_config = SettingsConfigDict(
        env_file=ENV_FILE_PATH,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @computed_field
    @property
    def rabbitmq_url(self) -> str:
        return (
            f"amqp://{self.RABBITMQ_USER}:{self.RABBITMQ_PASSWORD}"
            f"@{self.RABBITMQ_HOST}:{self.RABBITMQ_PORT}/{self.RABBITMQ_USER}"
        )


@lru_cache
def get_rabbitmq_settings() -> RabbitMQ:
    return RabbitMQ()
