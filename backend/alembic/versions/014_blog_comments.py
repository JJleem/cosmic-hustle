"""blog_comments 테이블 추가

Revision ID: 014
Revises: 013
Create Date: 2026-05-28
"""
from alembic import op
import sqlalchemy as sa

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if not bind.dialect.has_table(bind, "blog_comments"):
        op.create_table(
            "blog_comments",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("post_id", sa.String(), nullable=False),
            sa.Column("parent_id", sa.String(), nullable=True),
            sa.Column("agent_id", sa.String(), nullable=True),
            sa.Column("user_name", sa.String(), nullable=True),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["post_id"], ["blog_posts.id"]),
            sa.ForeignKeyConstraint(["parent_id"], ["blog_comments.id"]),
            sa.PrimaryKeyConstraint("id"),
        )


def downgrade() -> None:
    op.drop_table("blog_comments")
