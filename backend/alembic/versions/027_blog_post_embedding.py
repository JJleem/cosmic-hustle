"""blog_posts.embedding 추가 (관련글 의미기반 추천용, ko-sroberta 768)

Revision ID: 027
Revises: 026
Create Date: 2026-06-12
"""
from alembic import op

revision = "027"
down_revision = "026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE blog_posts ADD COLUMN embedding vector(768)")


def downgrade() -> None:
    op.execute("ALTER TABLE blog_posts DROP COLUMN embedding")
