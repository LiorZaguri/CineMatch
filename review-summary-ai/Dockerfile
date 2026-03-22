FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 \
    PATH="/app/.venv/bin:$PATH"

COPY pyproject.toml ./
RUN uv sync --no-dev --no-install-project

COPY . .

RUN uv sync --no-dev --no-install-project

EXPOSE 8002

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8002"]
