"""blog post likes and view_count

Revision ID: 015
Revises: 014
Create Date: 2026-05-28
"""
from alembic import op
import sqlalchemy as sa

revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    cols = {row[0] for row in bind.execute(sa.text("SELECT column_name FROM information_schema.columns WHERE table_name='blog_posts'"))}
    if "likes" not in cols:
        op.add_column("blog_posts", sa.Column("likes", sa.Integer(), nullable=False, server_default="0"))
    if "view_count" not in cols:
        op.add_column("blog_posts", sa.Column("view_count", sa.Integer(), nullable=False, server_default="0"))


def downgrade():
    op.drop_column("blog_posts", "view_count")
    op.drop_column("blog_posts", "likes")
