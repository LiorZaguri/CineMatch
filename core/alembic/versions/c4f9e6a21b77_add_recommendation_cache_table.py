"""add_recommendation_cache_table

Revision ID: c4f9e6a21b77
Revises: a6e8f20b4c13
Create Date: 2026-04-16 13:05:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c4f9e6a21b77"
down_revision: Union[str, Sequence[str], None] = "a6e8f20b4c13"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "recommendation_caches",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("profile_signature", sa.String(length=128), nullable=False),
        sa.Column("candidate_results", sa.JSON(), nullable=False),
        sa.Column("ai_results", sa.JSON(), nullable=True),
        sa.Column("candidate_generated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ai_generated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_ai_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("refresh_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("refresh_status", sa.String(length=32), nullable=False),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["user_preferences.user_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_recommendation_caches_id"), "recommendation_caches", ["id"], unique=False)
    op.create_index(
        op.f("ix_recommendation_caches_profile_signature"),
        "recommendation_caches",
        ["profile_signature"],
        unique=False,
    )
    op.create_index(op.f("ix_recommendation_caches_user_id"), "recommendation_caches", ["user_id"], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_recommendation_caches_user_id"), table_name="recommendation_caches")
    op.drop_index(op.f("ix_recommendation_caches_profile_signature"), table_name="recommendation_caches")
    op.drop_index(op.f("ix_recommendation_caches_id"), table_name="recommendation_caches")
    op.drop_table("recommendation_caches")
