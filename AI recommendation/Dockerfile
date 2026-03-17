# Use the official uv image with Python 3.12 on Debian Bookworm Slim.
# This image includes the 'uv' package manager pre-installed.
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

# Set the working directory inside the container to /app.
WORKDIR /app

# Set environment variables:
# UV_COMPILE_BYTECODE=1: Compiles Python source files to bytecode for faster startup.
# PATH: Adds the virtual environment bin directory to the system PATH.
ENV UV_COMPILE_BYTECODE=1 \
    PATH="/app/.venv/bin:$PATH"

# Copy dependency definition files first to leverage Docker layer caching.
# If these files haven't changed, Docker will skip the next RUN step.
COPY pyproject.toml uv.lock ./

# Install dependencies defined in uv.lock.
# --frozen: Ensures the lockfile is strictly followed (fails if out of sync).
# --no-install-project: Installs only dependencies, not the project itself yet.
RUN uv sync --frozen --no-install-project

# Copy the rest of the application source code into the container.
COPY . .

# Sync the environment again to install the project itself.
RUN uv sync --frozen

# Expose port 8000 to allow external access to the application.
EXPOSE 8000

# Define the command to run the application.
# Uses 'uv run' to execute uvicorn within the managed environment.
CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]