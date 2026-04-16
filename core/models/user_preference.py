"""
User Preference Models.

This module defines the models related to user tastes and discovery settings.
It includes the primary UserPreference model and its related entities like 
chosen movies, preferred genres, and moods, which are used by the 
AI recommendation engine to personalize results.
"""

import enum
from datetime import datetime
from typing import Any, List

from sqlalchemy import DateTime, Enum, ForeignKey, Index, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class DiscoveryMode(enum.Enum):
    """Enumeration of available discovery modes for the recommendation engine."""
    MAINSTREAM = "mainstream confident"
    HIDDEN_GEMS = "hidden gems"
    BEST_MIX = "best mix"


class Language(enum.Enum):
    """Enumeration of supported primary languages for movie filtering."""
    ENGLISH = "English"
    KOREAN = "Korean"
    JAPANESE = "Japanese"
    FRENCH = "French"
    SPANISH = "Spanish"
    OPEN = "Open to anything"


class Runtime(enum.Enum):
    """Enumeration of preferred movie duration ranges (in minutes)."""
    UNDER_100 = "100"
    BETWEEN_100_140 = "100-140"
    OVER_140 = "140+"
    NO_PREFERENCE = "No preference"


class Era(enum.Enum):
    """Enumeration of preferred release decades/eras."""
    ERA_1970 = "1970"
    ERA_1980 = "1980"
    ERA_1990 = "1990"
    ERA_2000 = "2000"
    ERA_2010 = "2010"
    ERA_2020 = "2020"


class GenreName(enum.Enum):
    """Enumeration of valid genre names supported by the system."""
    THRILLER = "Thriller"
    DRAMA = "Drama"
    SCI_FI = "Sci-fi"
    CRIME = "Crime"
    MYSTERY = "Mystery"
    COMEDY = "Comedy"
    ROMANCE = "Romance"
    HORROR = "Horror"
    ANIMATION = "Animation"
    FANTASY = "Fantasy"
    DOCUMENTARY = "Documentary"
    ACTION = "Action"


class UserPreference(Base):
    """
    Model representing core user tastes and discovery configuration.

    This serves as the central profile for a user's recommendation settings,
    linking to their specific likes, dislikes, and chosen movies.
    """

    __tablename__ = "user_preferences"

    # Unique identifier for the preference record
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    
    # Logical reference to the user (managed by the Auth/Gateway service)
    user_id: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)

    # How "safe" or "experimental" the recommendations should be
    discovery_mode: Mapped[DiscoveryMode] = mapped_column(
        Enum(DiscoveryMode), 
        default=DiscoveryMode.BEST_MIX, 
        nullable=False
    )

    # Preferred length of movies
    runtime: Mapped[Runtime | None] = mapped_column(
        Enum(Runtime),
        nullable=True
    )

    # Relationship to the list of movies explicitly chosen/liked by the user
    chosen_movies: Mapped[List["UserMovie"]] = relationship(
        "UserMovie", back_populates="user_preference", cascade="all, delete-orphan"
    )

    # Relationship to preferred movie languages
    language_preferences: Mapped[List["UserLanguage"]] = relationship(
        "UserLanguage", back_populates="user_preference", cascade="all, delete-orphan"
    )

    # Relationship to preferred release eras
    era_preferences: Mapped[List["UserEra"]] = relationship(
        "UserEra", back_populates="user_preference", cascade="all, delete-orphan"
    )

    # Relationship to genres the user explicitly likes
    liked_genres: Mapped[List["LikedGenre"]] = relationship(
        "LikedGenre", back_populates="user_preference", cascade="all, delete-orphan"
    )

    # Relationship to genres the user explicitly avoids
    disliked_genres: Mapped[List["DislikedGenre"]] = relationship(
        "DislikedGenre", back_populates="user_preference", cascade="all, delete-orphan"
    )

    # Relationship to specific moods/vibes the user is interested in
    moods: Mapped[List["UserMood"]] = relationship(
        "UserMood", back_populates="user_preference", cascade="all, delete-orphan"
    )

    recommendation_cache: Mapped["RecommendationCache | None"] = relationship(
        "RecommendationCache",
        back_populates="user_preference",
        cascade="all, delete-orphan",
        uselist=False,
    )

    def __repr__(self) -> str:
        return f"<UserPreference(user_id={self.user_id})>"

    @property
    def languages(self) -> list[Language]:
        """Expose language relationship as a plain API list."""
        return [preference.name for preference in self.language_preferences]

    @property
    def eras(self) -> list[Era]:
        """Expose era relationship as a plain API list."""
        return [preference.name for preference in self.era_preferences]


class UserLanguage(Base):
    """Represents a language that a user prefers for recommendations."""

    __tablename__ = "user_languages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[Language] = mapped_column(Enum(Language), index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("user_preferences.user_id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    user_preference: Mapped["UserPreference"] = relationship(
        "UserPreference", back_populates="language_preferences"
    )

    __table_args__ = (
        Index("idx_user_language_unique", "user_id", "name", unique=True),
    )

    def __repr__(self) -> str:
        return f"<UserLanguage(user_id={self.user_id}, name='{self.name.value}')>"


class UserEra(Base):
    """Represents a release era that a user prefers for recommendations."""

    __tablename__ = "user_eras"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[Era] = mapped_column(Enum(Era), index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("user_preferences.user_id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    user_preference: Mapped["UserPreference"] = relationship(
        "UserPreference", back_populates="era_preferences"
    )

    __table_args__ = (
        Index("idx_user_era_unique", "user_id", "name", unique=True),
    )

    def __repr__(self) -> str:
        return f"<UserEra(user_id={self.user_id}, name='{self.name.value}')>"


class UserMovie(Base):
    """
    Model representing a specific movie choice by a user.
    
    Links a user profile to a movie from the TMDB database.
    """

    __tablename__ = "user_movies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    # Foreign key referencing UserPreference profile
    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("user_preferences.user_id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    # External ID from The Movie Database (TMDB)
    tmdb_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)

    # Back-reference to the parent UserPreference
    user_preference: Mapped["UserPreference"] = relationship(
        "UserPreference", back_populates="chosen_movies"
    )

    # Unique constraint to prevent duplicate choices of the same movie per user
    __table_args__ = (
        Index("idx_user_movie_unique", "user_id", "tmdb_id", unique=True),
    )

    def __repr__(self) -> str:
        return f"<UserMovie(user_id={self.user_id}, tmdb_id={self.tmdb_id})>"


class GenreBase:
    """
    Base class for genre-related entities to provide consistent structure.
    """
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    # The validated name of the genre
    name: Mapped[GenreName] = mapped_column(Enum(GenreName), index=True, nullable=False)


class LikedGenre(GenreBase, Base):
    """Represents a genre that a user has explicitly marked as a favorite."""
    __tablename__ = "liked_genres"

    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("user_preferences.user_id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    user_preference: Mapped["UserPreference"] = relationship(
        "UserPreference", back_populates="liked_genres"
    )

    __table_args__ = (
        Index("idx_liked_genre_unique", "user_id", "name", unique=True),
    )

    def __repr__(self) -> str:
        return f"<LikedGenre(user_id={self.user_id}, name='{self.name.value}')>"


class DislikedGenre(GenreBase, Base):
    """Represents a genre that a user wants to exclude from recommendations."""
    __tablename__ = "disliked_genres"

    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("user_preferences.user_id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    user_preference: Mapped["UserPreference"] = relationship(
        "UserPreference", back_populates="disliked_genres"
    )

    __table_args__ = (
        Index("idx_disliked_genre_unique", "user_id", "name", unique=True),
    )

    def __repr__(self) -> str:
        return f"<DislikedGenre(user_id={self.user_id}, name='{self.name.value}')>"


class UserMood(Base):
    """
    Model representing specific movie 'moods' or 'vibes' selected by the user.
    
    Examples: 'Dark & tense', 'Fun & easy', 'Mind-bending'.
    """
    __tablename__ = "user_moods"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    
    # The name of the mood/vibe
    name: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    
    # Foreign key referencing UserPreference profile
    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("user_preferences.user_id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    # Back-reference to the parent UserPreference
    user_preference: Mapped["UserPreference"] = relationship(
        "UserPreference", back_populates="moods"
    )

    # Unique constraint to prevent duplicate moods per user
    __table_args__ = (
        Index("idx_user_mood_unique", "user_id", "name", unique=True),
    )

    def __repr__(self) -> str:
        return f"<UserMood(user_id={self.user_id}, name='{self.name}')>"


class RecommendationCache(Base):
    """Stores the latest deterministic and AI-ranked recommendations for a user."""

    __tablename__ = "recommendation_caches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("user_preferences.user_id", ondelete="CASCADE"),
        unique=True,
        index=True,
        nullable=False,
    )
    profile_signature: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    candidate_results: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    ai_results: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON, nullable=True)
    candidate_generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ai_generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_ai_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    refresh_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    refresh_status: Mapped[str] = mapped_column(String(32), default="idle", nullable=False)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    user_preference: Mapped["UserPreference"] = relationship(
        "UserPreference",
        back_populates="recommendation_cache",
    )

    def __repr__(self) -> str:
        return f"<RecommendationCache(user_id={self.user_id}, status={self.refresh_status})>"
