"""blog_post_metrics 추가 — 사원상 2축(성과)용 글별 GSC/GA 지표 월별 적재

Revision ID: 029
Revises: 028
Create Date: 2026-06-15
"""
from alembic import op
import sqlalchemy as sa

revision = "029"
down_revision = "028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "blog_post_metrics",
        sa.Column("post_id", sa.String(), sa.ForeignKey("blog_posts.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("period", sa.String(7), primary_key=True),  # YYYY-MM
        sa.Column("agent_id", sa.String(), nullable=False),
        # GSC (검색 노출/클릭) — 순위 대비 CTR 잔차 계산용
        sa.Column("impressions", sa.Integer(), server_default="0"),
        sa.Column("clicks", sa.Integer(), server_default="0"),
        sa.Column("ctr", sa.Float(), server_default="0"),
        sa.Column("position", sa.Float(), server_default="0"),
        # GA4 (참여) — 유입량 운 제거된 품질 지표
        sa.Column("sessions", sa.Integer(), server_default="0"),
        sa.Column("avg_session_sec", sa.Integer(), server_default="0"),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_blog_post_metrics_period", "blog_post_metrics", ["period"])


def downgrade() -> None:
    op.drop_index("ix_blog_post_metrics_period", table_name="blog_post_metrics")
    op.drop_table("blog_post_metrics")
