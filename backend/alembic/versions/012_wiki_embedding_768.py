"""wiki_entries embedding 384 → 768 (ko-sroberta-multitask)

Revision ID: 012
Revises: 011
Create Date: 2026-05-28
"""
from alembic import op

revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE wiki_entries ALTER COLUMN embedding TYPE vector(768) USING NULL")


def downgrade() -> None:
    op.execute("ALTER TABLE wiki_entries ALTER COLUMN embedding TYPE vector(384) USING NULL")
