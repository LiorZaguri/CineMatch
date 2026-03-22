from openai import OpenAI

from config import get_settings


def create_openai_client(
    *,
    api_key: str | None = None,
    base_url: str | None = None,
) -> OpenAI:
    settings = get_settings()
    resolved_api_key = api_key if api_key is not None else settings.API_KEY
    resolved_base_url = base_url if base_url is not None else settings.LLM_BASE_URL

    if not resolved_api_key.strip():
        raise ValueError("API_KEY is required to initialize the OpenAI client.")

    return OpenAI(
        api_key=resolved_api_key,
        base_url=resolved_base_url,
    )
