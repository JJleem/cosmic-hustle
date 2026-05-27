"""wiki_entries created_at

Revision ID: 011
Revises: 010
Create Date: 2026-05-27
"""
from alembic import op
import sqlalchemy as sa

revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    from sqlalchemy import inspect
    bind = op.get_bind()
    existing_cols = [c["name"] for c in inspect(bind).get_columns("wiki_entries")]
    if "created_at" not in existing_cols:
        op.add_column(
            "wiki_entries",
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        )


def downgrade() -> None:
    op.drop_column("wiki_entries", "created_at")
