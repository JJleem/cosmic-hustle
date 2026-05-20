"""report thumbnail_prompts column

Revision ID: 008
Revises: 007
Create Date: 2026-05-20
"""
from alembic import op
import sqlalchemy as sa

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    from sqlalchemy import inspect
    bind = op.get_bind()
    cols = [c["name"] for c in inspect(bind).get_columns("reports")]
    if "thumbnail_prompts" not in cols:
        op.add_column("reports", sa.Column("thumbnail_prompts", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("reports", "thumbnail_prompts")
