# ==========================================
# STAGE 1: Builder
# ==========================================

# Use the official uv image with Python 3.12 on Debian Bookworm Slim.
# This image includes the 'uv' package manager pre-installed.
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder 

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
RUN uv sync --frozen --no-install-project --no-dev

# Copy the rest of the application source code into the container.
COPY . .

# Sync the environment again to install the project itself.
RUN uv sync --frozen --no-dev


# ==========================================
# STAGE 2: Production Runner
# ==========================================

# Use a lightweight Python image for the final production environment.
FROM python:3.12-slim-bookworm AS runner

# Set the working directory to /app.
WORKDIR /app

# Create a non-root user for better security.
RUN useradd -m appuser

# Copy the virtual environment from the builder stage.
COPY --from=builder /app/.venv /app/.venv

# Copy the application source code and change ownership to the non-root user.
COPY --from=builder --chown=appuser:appuser /app /app

# Switch to the non-root user.
USER appuser

# Add the virtual environment to the system PATH.
ENV PATH="/app/.venv/bin:$PATH"

# Expose the port that the application runs on.
EXPOSE 8000

# Specify the command to run the application using Uvicorn.
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
