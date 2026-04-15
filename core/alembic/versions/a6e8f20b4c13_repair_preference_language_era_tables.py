"""repair_preference_language_era_tables

Revision ID: a6e8f20b4c13
Revises: 9b4c2d6f7a81
Create Date: 2026-04-15 17:48:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a6e8f20b4c13"
down_revision: Union[str, Sequence[str], None] = "9b4c2d6f7a81"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def _has_table(table_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return table_name in inspector.get_table_names()


def _create_user_languages_table() -> None:
    language = postgresql.ENUM(
        "ENGLISH", "KOREAN", "JAPANESE", "FRENCH", "SPANISH", "OPEN",
        name="language",
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


def _create_user_eras_table() -> None:
    era = postgresql.ENUM(
        "ERA_1970", "ERA_1980", "ERA_1990", "ERA_2000", "ERA_2010", "ERA_2020",
        name="era",
        create_type=False,
    )

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


def upgrade() -> None:
    """Upgrade schema."""
    if not _has_table("user_languages"):
        _create_user_languages_table()

    if not _has_table("user_eras"):
        _create_user_eras_table()

    if _has_column("user_preferences", "languages"):
        op.execute(
            """
            INSERT INTO user_languages (user_id, name)
            SELECT user_id,
                   CASE language_value
                       WHEN 'English' THEN 'ENGLISH'::language
                       WHEN 'Korean' THEN 'KOREAN'::language
                       WHEN 'Japanese' THEN 'JAPANESE'::language
                       WHEN 'French' THEN 'FRENCH'::language
                       WHEN 'Spanish' THEN 'SPANISH'::language
                       WHEN 'Open to anything' THEN 'OPEN'::language
                       WHEN 'ENGLISH' THEN 'ENGLISH'::language
                       WHEN 'KOREAN' THEN 'KOREAN'::language
                       WHEN 'JAPANESE' THEN 'JAPANESE'::language
                       WHEN 'FRENCH' THEN 'FRENCH'::language
                       WHEN 'SPANISH' THEN 'SPANISH'::language
                       WHEN 'OPEN' THEN 'OPEN'::language
                   END
            FROM user_preferences
            CROSS JOIN LATERAL jsonb_array_elements_text(languages) AS selected_language(language_value)
            WHERE language_value IS NOT NULL
            ON CONFLICT DO NOTHING
            """
        )
        op.drop_column("user_preferences", "languages")

    if _has_column("user_preferences", "eras"):
        op.execute(
            """
            INSERT INTO user_eras (user_id, name)
            SELECT user_id,
                   CASE era_value
                       WHEN '1970' THEN 'ERA_1970'::era
                       WHEN '1980' THEN 'ERA_1980'::era
                       WHEN '1990' THEN 'ERA_1990'::era
                       WHEN '2000' THEN 'ERA_2000'::era
                       WHEN '2010' THEN 'ERA_2010'::era
                       WHEN '2020' THEN 'ERA_2020'::era
                       WHEN 'ERA_1970' THEN 'ERA_1970'::era
                       WHEN 'ERA_1980' THEN 'ERA_1980'::era
                       WHEN 'ERA_1990' THEN 'ERA_1990'::era
                       WHEN 'ERA_2000' THEN 'ERA_2000'::era
                       WHEN 'ERA_2010' THEN 'ERA_2010'::era
                       WHEN 'ERA_2020' THEN 'ERA_2020'::era
                   END
            FROM user_preferences
            CROSS JOIN LATERAL jsonb_array_elements_text(eras) AS selected_era(era_value)
            WHERE era_value IS NOT NULL
            ON CONFLICT DO NOTHING
            """
        )
        op.drop_column("user_preferences", "eras")


def downgrade() -> None:
    """Downgrade schema."""
    if not _has_column("user_preferences", "languages"):
        op.add_column(
            "user_preferences",
            sa.Column("languages", postgresql.JSONB(), nullable=False, server_default="[]"),
        )
        op.execute(
            """
            UPDATE user_preferences
            SET languages = COALESCE(language_list.languages, '[]'::jsonb)
            FROM (
                SELECT user_id, jsonb_agg(name::text ORDER BY id) AS languages
                FROM user_languages
                GROUP BY user_id
            ) AS language_list
            WHERE user_preferences.user_id = language_list.user_id
            """
        )

    if not _has_column("user_preferences", "eras"):
        op.add_column(
            "user_preferences",
            sa.Column("eras", postgresql.JSONB(), nullable=False, server_default="[]"),
        )
        op.execute(
            """
            UPDATE user_preferences
            SET eras = COALESCE(era_list.eras, '[]'::jsonb)
            FROM (
                SELECT user_id, jsonb_agg(name::text ORDER BY id) AS eras
                FROM user_eras
                GROUP BY user_id
            ) AS era_list
            WHERE user_preferences.user_id = era_list.user_id
            """
        )

    if _has_table("user_eras"):
        op.drop_index(op.f("ix_user_eras_user_id"), table_name="user_eras")
        op.drop_index(op.f("ix_user_eras_name"), table_name="user_eras")
        op.drop_index(op.f("ix_user_eras_id"), table_name="user_eras")
        op.drop_index("idx_user_era_unique", table_name="user_eras")
        op.drop_table("user_eras")

    if _has_table("user_languages"):
        op.drop_index(op.f("ix_user_languages_user_id"), table_name="user_languages")
        op.drop_index(op.f("ix_user_languages_name"), table_name="user_languages")
        op.drop_index(op.f("ix_user_languages_id"), table_name="user_languages")
        op.drop_index("idx_user_language_unique", table_name="user_languages")
        op.drop_table("user_languages")
