"""make_preference_language_era_lists

Revision ID: 9b4c2d6f7a81
Revises: 847bd8dfb9da
Create Date: 2026-04-15 17:25:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9b4c2d6f7a81"
down_revision: Union[str, Sequence[str], None] = "847bd8dfb9da"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    language = postgresql.ENUM(
        "ENGLISH", "KOREAN", "JAPANESE", "FRENCH", "SPANISH", "OPEN",
        name="language",
        create_type=False,
    )
    era = postgresql.ENUM(
        "ERA_1970", "ERA_1980", "ERA_1990", "ERA_2000", "ERA_2010", "ERA_2020",
        name="era",
        create_type=False,
    )

    op.create_table(
        "user_languages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", language, nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user_preferences.user_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_user_language_unique", "user_languages", ["user_id", "name"], unique=True)
    op.create_index(op.f("ix_user_languages_id"), "user_languages", ["id"], unique=False)
    op.create_index(op.f("ix_user_languages_name"), "user_languages", ["name"], unique=False)
    op.create_index(op.f("ix_user_languages_user_id"), "user_languages", ["user_id"], unique=False)

    op.create_table(
        "user_eras",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", era, nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user_preferences.user_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_user_era_unique", "user_eras", ["user_id", "name"], unique=True)
    op.create_index(op.f("ix_user_eras_id"), "user_eras", ["id"], unique=False)
    op.create_index(op.f("ix_user_eras_name"), "user_eras", ["name"], unique=False)
    op.create_index(op.f("ix_user_eras_user_id"), "user_eras", ["user_id"], unique=False)

    op.execute(
        """
        INSERT INTO user_languages (user_id, name)
        SELECT user_id, languages
        FROM user_preferences
        WHERE languages IS NOT NULL
        """
    )
    op.execute(
        """
        INSERT INTO user_eras (user_id, name)
        SELECT user_id, eras
        FROM user_preferences
        WHERE eras IS NOT NULL
        """
    )

    op.drop_column("user_preferences", "languages")
    op.drop_column("user_preferences", "eras")


def downgrade() -> None:
    """Downgrade schema."""
    language = postgresql.ENUM(
        "ENGLISH", "KOREAN", "JAPANESE", "FRENCH", "SPANISH", "OPEN",
        name="language",
        create_type=False,
    )
    era = postgresql.ENUM(
        "ERA_1970", "ERA_1980", "ERA_1990", "ERA_2000", "ERA_2010", "ERA_2020",
        name="era",
        create_type=False,
    )

    op.add_column("user_preferences", sa.Column("languages", language, nullable=True))
    op.add_column("user_preferences", sa.Column("eras", era, nullable=True))

    op.execute(
        """
        UPDATE user_preferences
        SET languages = first_language.name
        FROM (
            SELECT DISTINCT ON (user_id) user_id, name
            FROM user_languages
            ORDER BY user_id, id
        ) AS first_language
        WHERE user_preferences.user_id = first_language.user_id
        """
    )
    op.execute(
        """
        UPDATE user_preferences
        SET eras = first_era.name
        FROM (
            SELECT DISTINCT ON (user_id) user_id, name
            FROM user_eras
            ORDER BY user_id, id
        ) AS first_era
        WHERE user_preferences.user_id = first_era.user_id
        """
    )

    op.drop_index(op.f("ix_user_eras_user_id"), table_name="user_eras")
    op.drop_index(op.f("ix_user_eras_name"), table_name="user_eras")
    op.drop_index(op.f("ix_user_eras_id"), table_name="user_eras")
    op.drop_index("idx_user_era_unique", table_name="user_eras")
    op.drop_table("user_eras")

    op.drop_index(op.f("ix_user_languages_user_id"), table_name="user_languages")
    op.drop_index(op.f("ix_user_languages_name"), table_name="user_languages")
    op.drop_index(op.f("ix_user_languages_id"), table_name="user_languages")
    op.drop_index("idx_user_language_unique", table_name="user_languages")
    op.drop_table("user_languages")
