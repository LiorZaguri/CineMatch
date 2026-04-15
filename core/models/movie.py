from datetime import date

from sqlalchemy import Date, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class Movie(Base):
    """
    Represents a movie entity in the database.
    """

    __tablename__ = "movies"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # The title of the movie
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    # A brief description or synopsis of the movie
    description: Mapped[str] = mapped_column(Text, nullable=True)
    # The official release date of the movie
    release_date: Mapped[date] = mapped_column(Date, nullable=True)
    # URL to the movie's poster image
    poster_url: Mapped[str] = mapped_column(String(255), nullable=True)
    # ID of the user who created this movie entry
    created_by_user_id: Mapped[int] = mapped_column(index=True, nullable=False)

    def __repr__(self) -> str:
        return f"<Movie(id={self.id}, title='{self.title}')>"
