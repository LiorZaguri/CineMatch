"""
This module defines Pydantic schemas for Movie-related operations.
It includes schemas for creating, updating, and retrieving movie data.
"""

from datetime import date

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class MovieBase(BaseModel):
    """
    Base schema containing shared fields for Movie models.
    """

    # The title of the movie. Must be between 1 and 255 characters.
    title: str = Field(..., min_length=1, max_length=255, description="The title of the movie. Must be between 1 and 255 characters.")
    # A brief description of the movie. Optional, max 1000 characters.
    description: str | None = Field(None, max_length=1000, description="A brief description of the movie. Optional, max 1000 characters.")
    # The release date of the movie. Optional.
    release_date: date | None = None
    # URL to the movie poster. Optional, max 500 characters.
    poster_url: HttpUrl | None = Field(None, max_length=500, description="URL to the movie poster. Optional, max 500 characters.")


class MovieCreate(MovieBase):
    """
    Schema for creating a new movie.
    Inherits all fields from MovieBase.
    """

    pass

class MovieUpdate(BaseModel):
    """
    Schema for updating an existing movie.
    All fields are optional, allowing for partial updates.
    """
    # Optional new title
    title: str | None = Field(None, min_length=1, max_length=255, description="Optional new title")
    # Optional new description
    description: str | None = Field(None, max_length=1000, description="Optional new description")
    # Optional new release date
    release_date: date | None = None
    # Optional new poster URL
    poster_url: str | None = Field(None, max_length=500, description="Optional new poster URL")


class MovieResponse(MovieBase):
    """
    Schema for the movie response returned to the client.
    Includes the database ID and the ID of the user who created it.
    """

    # The unique identifier of the movie in the database
    id: int
    # The ID of the user who created this movie entry
    created_by_user_id: int

    # Configuration to enable Pydantic to read data from ORM models
    model_config = ConfigDict(from_attributes=True)

class UploadConfirmRequest(BaseModel):
    """
    Schema for the upload confirmation request.
    
    This model is used when the frontend confirms that a file has been 
    successfully uploaded to S3, triggering the backend to update the 
    movie record.
    """
    # The ID of the movie to update
    movie_id: int
    # The S3 key (path) of the uploaded file
    file_key: str
