from functools import lru_cache
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_FILE_PATH = Path(__file__).resolve().parents[2] / ".env"

class AImodel(BaseSettings):
    API_KEY: str
    LLM_BASE_URL: str
    LLM_MODEL: str 

    model_config = SettingsConfigDict(
        env_file=ENV_FILE_PATH,
        env_file_encoding="utf-8",
        extra="ignore",
    )

@lru_cache
def get_AI_settings() -> AImodel:
    return AImodel()
