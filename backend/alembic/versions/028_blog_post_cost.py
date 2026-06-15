"""blog_post_cost 추가 — 사원상 3축(비용 효율)용 글당 토큰/이미지 비용 로깅

Revision ID: 028
Revises: 027
Create Date: 2026-06-15
"""
from alembic import op
import sqlalchemy as sa

revision = "028"
down_revision = "027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "blog_post_cost",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("post_id", sa.String(), sa.ForeignKey("blog_posts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agent_id", sa.String(), nullable=False),
        sa.Column("phase", sa.String(), nullable=False),  # content | trend | scene | topic_pick | thumbnail | content_image
        sa.Column("model", sa.String(), nullable=True),
        sa.Column("input_tokens", sa.Integer(), server_default="0"),
        sa.Column("output_tokens", sa.Integer(), server_default="0"),
        sa.Column("cache_read_tokens", sa.Integer(), server_default="0"),
        sa.Column("cache_creation_tokens", sa.Integer(), server_default="0"),
        sa.Column("cost_usd", sa.Float(), server_default="0"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_blog_post_cost_post_id", "blog_post_cost", ["post_id"])
    op.create_index("ix_blog_post_cost_agent_id", "blog_post_cost", ["agent_id"])


def downgrade() -> None:
    op.drop_index("ix_blog_post_cost_agent_id", table_name="blog_post_cost")
    op.drop_index("ix_blog_post_cost_post_id", table_name="blog_post_cost")
    op.drop_table("blog_post_cost")
