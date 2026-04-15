"""
This module defines Pydantic schemas for User Preference operations.
It includes schemas for creating, updating, and retrieving user-specific 
tastes, discovery settings, and liked/disliked content.
"""

from typing import List

from pydantic import BaseModel, ConfigDict, Field

from models.user_preference import DiscoveryMode, Era, GenreName, Language, Runtime


class UserMovieBase(BaseModel):
    """
    Base schema for a specific movie choice.
    """
    # External ID from The Movie Database (TMDB)
    tmdb_id: int = Field(..., description="External ID from The Movie Database (TMDB)")


class UserMovieCreate(UserMovieBase):
    """
    Schema for creating a user movie link.
    Inherits all fields from UserMovieBase.
    """
    pass


class UserMovieRead(UserMovieBase):
    """
    Schema for reading user movie data.
    Includes the database ID.
    """
    # Unique identifier for the user-movie link
    id: int

    model_config = ConfigDict(from_attributes=True)


class GenreBase(BaseModel):
    """
    Base schema for genre-related entities.
    """
    # The validated name of the genre
    name: GenreName = Field(..., description="The validated name of the genre")


class LikedGenreCreate(GenreBase):
    """
    Schema for creating a liked genre.
    Inherits all fields from GenreBase.
    """
    pass


class LikedGenreRead(GenreBase):
    """
    Schema for reading liked genre data.
    Includes the database ID.
    """
    # Unique identifier for the liked genre record
    id: int

    model_config = ConfigDict(from_attributes=True)


class DislikedGenreCreate(GenreBase):
    """
    Schema for creating a disliked genre.
    Inherits all fields from GenreBase.
    """
    pass


class DislikedGenreRead(GenreBase):
    """
    Schema for reading disliked genre data.
    Includes the database ID.
    """
    # Unique identifier for the disliked genre record
    id: int

    model_config = ConfigDict(from_attributes=True)


class UserMoodBase(BaseModel):
    """
    Base schema for a specific movie mood or vibe.
    """
    # The name of the mood/vibe (e.g., 'Dark & tense', 'Fun & easy')
    name: str = Field(..., max_length=100, description="The name of the mood/vibe")


class UserMoodCreate(UserMoodBase):
    """
    Schema for creating a user mood.
    Inherits all fields from UserMoodBase.
    """
    pass


class UserMoodRead(UserMoodBase):
    """
    Schema for reading user mood data.
    Includes the database ID.
    """
    # Unique identifier for the user mood record
    id: int

    model_config = ConfigDict(from_attributes=True)


class UserPreferenceBase(BaseModel):
    """
    Base schema containing shared fields for User Preference models.
    """
    # How "safe" or "experimental" the recommendations should be
    discovery_mode: DiscoveryMode = Field(
        default=DiscoveryMode.BEST_MIX,
        description="How 'safe' or 'experimental' recommendations should be"
    )
    # Preferred language for movies. Optional.
    languages: Language | None = Field(None, description="Preferred language for movies")
    # Preferred length of movies. Optional.
    runtime: Runtime | None = Field(None, description="Preferred length of movies")
    # Preferred release era. Optional.
    eras: Era | None = Field(None, description="Preferred release era")


class UserPreferenceCreate(UserPreferenceBase):
    """
    Schema for creating or fully updating a user's preference profile.
    This includes all nested collections.
    """
    # List of movies explicitly chosen by the user
    chosen_movies: List[UserMovieCreate] = Field(default_factory=list, description="List of movies explicitly chosen by the user")
    # List of genres the user explicitly likes
    liked_genres: List[LikedGenreCreate] = Field(default_factory=list, description="List of genres the user explicitly likes")
    # List of genres the user explicitly avoids
    disliked_genres: List[DislikedGenreCreate] = Field(default_factory=list, description="List of genres the user explicitly avoids")
    # List of specific moods/vibes the user is interested in
    moods: List[UserMoodCreate] = Field(default_factory=list, description="List of specific moods/vibes the user is interested in")


class UserPreferenceUpdate(BaseModel):
    """
    Schema for partial updates to user preferences.
    All fields are optional, allowing for partial updates.
    """
    # Optional new discovery mode
    discovery_mode: DiscoveryMode | None = Field(None, description="Optional new discovery mode")
    # Optional new preferred language
    languages: Language | None = Field(None, description="Optional new preferred language")
    # Optional new preferred runtime
    runtime: Runtime | None = Field(None, description="Optional new preferred runtime")
    # Optional new preferred era
    eras: Era | None = Field(None, description="Optional new preferred era")
    
    # Optional replacement of the chosen movies list
    chosen_movies: List[UserMovieCreate] | None = Field(None, description="Optional replacement of the chosen movies list")
    # Optional replacement of the liked genres list
    liked_genres: List[LikedGenreCreate] | None = Field(None, description="Optional replacement of the liked genres list")
    # Optional replacement of the disliked genres list
    disliked_genres: List[DislikedGenreCreate] | None = Field(None, description="Optional replacement of the disliked genres list")
    # Optional replacement of the moods list
    moods: List[UserMoodCreate] | None = Field(None, description="Optional replacement of the moods list")


class UserPreferenceRead(UserPreferenceBase):
    """
    Schema for the user preference response returned to the client.
    Includes the database ID, the logical user ID, and all nested collections.
    """
    # Unique identifier for the preference record
    id: int
    # Logical reference to the user (managed by the Auth/Gateway service)
    user_id: str
    
    # List of movies chosen by the user
    chosen_movies: List[UserMovieRead] = Field(default_factory=list, description="List of movies chosen by the user")
    # List of genres liked by the user
    liked_genres: List[LikedGenreRead] = Field(default_factory=list, description="List of genres liked by the user")
    # List of genres disliked by the user
    disliked_genres: List[DislikedGenreRead] = Field(default_factory=list, description="List of genres disliked by the user")
    # List of moods/vibes preferred by the user
    moods: List[UserMoodRead] = Field(default_factory=list, description="List of moods/vibes preferred by the user")

    model_config = ConfigDict(from_attributes=True)
