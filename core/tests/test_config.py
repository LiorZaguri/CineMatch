"""
Configuration Test Module.

This module verifies that the application settings are loaded correctly from the
environment variables and that the database engine is configured with the expected parameters.
"""

import pytest
from dotenv import dotenv_values

from db.config import ENV_FILE_PATH, get_settings
from db.db import engine

# We use the ENV_FILE_PATH defined in the main config to ensure we are testing
# against the same file location as the application.


# Fixtures


@pytest.fixture(scope="session")
def raw_env():
    """
    Fixture to load environment variables directly from the .env file.
    Returns a dictionary of raw string values.
    """
    return dotenv_values(ENV_FILE_PATH)


@pytest.fixture(scope="session")
def settings():
    """
    Fixture to load the application settings using the Pydantic model.
    """
    return get_settings()


# Tests


def test_settings_load_correctly(raw_env, settings):
    """
    Verifies that Pydantic correctly loads specific fields from the .env file.
    """

    assert settings.POSTGRES_USER == raw_env["POSTGRES_USER"]
    assert settings.POSTGRES_PASSWORD == raw_env["POSTGRES_PASSWORD"]
    assert settings.POSTGRES_PORT == raw_env["POSTGRES_PORT"]


def test_database_url_construction(raw_env, settings):
    """
    Verifies that the database URL is constructed correctly from the individual
    environment variables.
    """

    # Construct the expected URL manually using the raw environment values.
    expected_url = (
        f"postgresql+asyncpg://{raw_env['POSTGRES_USER']}:"
        f"{raw_env['POSTGRES_PASSWORD']}@{raw_env['POSTGRES_HOST']}:"
        f"{raw_env['POSTGRES_PORT']}/{raw_env['POSTGRES_DB']}?ssl=require"
    )

    assert settings.database_url == expected_url


def test_engine_configuration(raw_env):
    """
    Verifies that the SQLAlchemy engine is created with the correct driver and database.
    """

    # Check if the database name exists in the engine's connection URL.
    assert raw_env["POSTGRES_DB"] in str(engine.url)
    assert engine.dialect.name == "postgresql"
    assert engine.dialect.driver == "asyncpg"
