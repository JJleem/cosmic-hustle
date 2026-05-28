"""blog_posts 테이블 추가

Revision ID: 013
Revises: 012
Create Date: 2026-05-28
"""
from alembic import op
import sqlalchemy as sa

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # create_all이 먼저 실행된 경우 테이블이 이미 존재할 수 있음
    bind = op.get_bind()
    if not bind.dialect.has_table(bind, "blog_posts"):
        op.create_table(
            "blog_posts",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("agent_id", sa.String(), nullable=False),
            sa.Column("title", sa.String(), nullable=False),
            sa.Column("slug", sa.String(), nullable=False),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("thumbnail_url", sa.String(), nullable=True),
            sa.Column("published", sa.Boolean(), nullable=False, server_default="true"),
            sa.Column("trending_topic", sa.String(), nullable=True),
            sa.Column("published_at", sa.DateTime(), nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("slug"),
        )


def downgrade() -> None:
    op.drop_table("blog_posts")
