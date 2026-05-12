"""wiki_entries with pgvector

Revision ID: 002
Revises: 001
Create Date: 2026-05-12
"""
from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "wiki_entries",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("filename", sa.String(), nullable=False, unique=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(384), nullable=True),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_wiki_entries_filename", "wiki_entries", ["filename"])


def downgrade() -> None:
    op.drop_index("ix_wiki_entries_filename")
    op.drop_table("wiki_entries")
