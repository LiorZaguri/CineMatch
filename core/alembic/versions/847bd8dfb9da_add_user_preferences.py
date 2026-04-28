"""add_user_preferences

Revision ID: 847bd8dfb9da
Revises: 2c5d1e8c243a
Create Date: 2026-04-15 11:34:42.147800

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '847bd8dfb9da'
down_revision: Union[str, Sequence[str], None] = '2c5d1e8c243a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None




def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()

    # Safely create Enums using DO blocks to handle "already exists" cases
    def create_enum_safely(name, values):
        values_str = ", ".join(f"'{v}'" for v in values)
        bind.execute(sa.text(f"""
            DO $$ BEGIN
                CREATE TYPE {name} AS ENUM ({values_str});
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        """))

    create_enum_safely('discoverymode', ['MAINSTREAM', 'HIDDEN_GEMS', 'BEST_MIX'])
    create_enum_safely('language', ['ENGLISH', 'KOREAN', 'JAPANESE', 'FRENCH', 'SPANISH', 'OPEN'])
    create_enum_safely('runtime', ['UNDER_100', 'BETWEEN_100_140', 'OVER_140', 'NO_PREFERENCE'])
    create_enum_safely('era', ['ERA_1970', 'ERA_1980', 'ERA_1990', 'ERA_2000', 'ERA_2010', 'ERA_2020'])
    create_enum_safely('genrename', [
        'THRILLER', 'DRAMA', 'SCI_FI', 'CRIME', 'MYSTERY', 'COMEDY', 'ROMANCE', 'HORROR', 'ANIMATION', 'FANTASY', 'DOCUMENTARY', 'ACTION'
    ])

    # Define the types for column use with create_type=False
    discovery_mode_type = postgresql.ENUM(name='discoverymode', create_type=False)
    language_type = postgresql.ENUM(name='language', create_type=False)
    runtime_type = postgresql.ENUM(name='runtime', create_type=False)
    era_type = postgresql.ENUM(name='era', create_type=False)
    genrename_type = postgresql.ENUM(name='genrename', create_type=False)

    # Helper function to check if table exists
    def table_exists(name):
        from sqlalchemy import inspect
        insp = inspect(bind)
        return name in insp.get_table_names()

    # Create the movies table (missing from previous migrations)
    if not table_exists('movies'):
        op.create_table('movies',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('title', sa.String(length=255), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('release_date', sa.Date(), nullable=True),
            sa.Column('poster_url', sa.String(length=255), nullable=True),
            sa.Column('created_by_user_id', sa.Integer(), nullable=False),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_movies_created_by_user_id'), 'movies', ['created_by_user_id'], unique=False)

    # Create user_preferences table
    if not table_exists('user_preferences'):
        op.create_table('user_preferences',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.String(), nullable=False),
            sa.Column('discovery_mode', discovery_mode_type, nullable=False),
            sa.Column('languages', language_type, nullable=True),
            sa.Column('runtime', runtime_type, nullable=True),
            sa.Column('eras', era_type, nullable=True),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_user_preferences_id'), 'user_preferences', ['id'], unique=False)
        op.create_index(op.f('ix_user_preferences_user_id'), 'user_preferences', ['user_id'], unique=True)

    # Create liked_genres table
    if not table_exists('liked_genres'):
        op.create_table('liked_genres',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.String(), nullable=False),
            sa.Column('name', genrename_type, nullable=False),
            sa.ForeignKeyConstraint(['user_id'], ['user_preferences.user_id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('idx_liked_genre_unique', 'liked_genres', ['user_id', 'name'], unique=True)
        op.create_index(op.f('ix_liked_genres_id'), 'liked_genres', ['id'], unique=False)
        op.create_index(op.f('ix_liked_genres_name'), 'liked_genres', ['name'], unique=False)
        op.create_index(op.f('ix_liked_genres_user_id'), 'liked_genres', ['user_id'], unique=False)

    # Create disliked_genres table
    if not table_exists('disliked_genres'):
        op.create_table('disliked_genres',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.String(), nullable=False),
            sa.Column('name', genrename_type, nullable=False),
            sa.ForeignKeyConstraint(['user_id'], ['user_preferences.user_id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('idx_disliked_genre_unique', 'disliked_genres', ['user_id', 'name'], unique=True)
        op.create_index(op.f('ix_disliked_genres_id'), 'disliked_genres', ['id'], unique=False)
        op.create_index(op.f('ix_disliked_genres_name'), 'disliked_genres', ['name'], unique=False)
        op.create_index(op.f('ix_disliked_genres_user_id'), 'disliked_genres', ['user_id'], unique=False)

    # Create user_moods table
    if not table_exists('user_moods'):
        op.create_table('user_moods',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('name', sa.String(length=100), nullable=False),
            sa.Column('user_id', sa.String(), nullable=False),
            sa.ForeignKeyConstraint(['user_id'], ['user_preferences.user_id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('idx_user_mood_unique', 'user_moods', ['user_id', 'name'], unique=True)
        op.create_index(op.f('ix_user_moods_id'), 'user_moods', ['id'], unique=False)
        op.create_index(op.f('ix_user_moods_name'), 'user_moods', ['name'], unique=False)
        op.create_index(op.f('ix_user_moods_user_id'), 'user_moods', ['user_id'], unique=False)

    # Create user_movies table
    if not table_exists('user_movies'):
        op.create_table('user_movies',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.String(), nullable=False),
            sa.Column('tmdb_id', sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint(['user_id'], ['user_preferences.user_id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('idx_user_movie_unique', 'user_movies', ['user_id', 'tmdb_id'], unique=True)
        op.create_index(op.f('ix_user_movies_id'), 'user_movies', ['id'], unique=False)
        op.create_index(op.f('ix_user_movies_tmdb_id'), 'user_movies', ['tmdb_id'], unique=False)
        op.create_index(op.f('ix_user_movies_user_id'), 'user_movies', ['user_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_user_movies_user_id'), table_name='user_movies')
    op.drop_index(op.f('ix_user_movies_tmdb_id'), table_name='user_movies')
    op.drop_index(op.f('ix_user_movies_id'), table_name='user_movies')
    op.drop_index('idx_user_movie_unique', table_name='user_movies')
    op.drop_table('user_movies')
    op.drop_index(op.f('ix_user_moods_user_id'), table_name='user_moods')
    op.drop_index(op.f('ix_user_moods_name'), table_name='user_moods')
    op.drop_index(op.f('ix_user_moods_id'), table_name='user_moods')
    op.drop_index('idx_user_mood_unique', table_name='user_moods')
    op.drop_table('user_moods')
    op.drop_index(op.f('ix_disliked_genres_user_id'), table_name='disliked_genres')
    op.drop_index(op.f('ix_disliked_genres_name'), table_name='disliked_genres')
    op.drop_index(op.f('ix_disliked_genres_id'), table_name='disliked_genres')
    op.drop_index('idx_disliked_genre_unique', table_name='disliked_genres')
    op.drop_table('disliked_genres')
    op.drop_index(op.f('ix_liked_genres_user_id'), table_name='liked_genres')
    op.drop_index(op.f('ix_liked_genres_name'), table_name='liked_genres')
    op.drop_index(op.f('ix_liked_genres_id'), table_name='liked_genres')
    op.drop_index('idx_liked_genre_unique', table_name='liked_genres')
    op.drop_table('liked_genres')
    op.drop_index(op.f('ix_user_preferences_user_id'), table_name='user_preferences')
    op.drop_index(op.f('ix_user_preferences_id'), table_name='user_preferences')
    op.drop_table('user_preferences')
    op.drop_index(op.f('ix_movies_created_by_user_id'), table_name='movies')
    op.drop_table('movies')

    # Drop enums
    sa.Enum(name='discoverymode').drop(op.get_bind())
    sa.Enum(name='language').drop(op.get_bind())
    sa.Enum(name='runtime').drop(op.get_bind())
    sa.Enum(name='era').drop(op.get_bind())
    sa.Enum(name='genrename').drop(op.get_bind())
