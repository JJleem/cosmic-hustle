"""사원상 1축(내재 품질) — 고정앵커 페어와이즈 판사용 테이블

Revision ID: 030
Revises: 029
Create Date: 2026-06-15
"""
from alembic import op
import sqlalchemy as sa

revision = "030"
down_revision = "029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 고정 레퍼런스 세트(앵커) — 사람이 선별. 품질 범위를 spread 하도록 상/하 섞어 등록.
    op.create_table(
        "quality_reference",
        sa.Column("post_id", sa.String(), sa.ForeignKey("blog_posts.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("note", sa.String(), nullable=True),  # 왜 앵커인지 (예: "상-논리탄탄", "하-평범")
        sa.Column("added_at", sa.DateTime(), server_default=sa.func.now()),
    )
    # 글별 내재 품질 점수 — 앵커 대비 페어와이즈 승률. 주제 독립이라 period 없음(글당 고정).
    op.create_table(
        "blog_post_quality",
        sa.Column("post_id", sa.String(), sa.ForeignKey("blog_posts.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("score", sa.Float(), server_default="0"),       # 0~100 승률
        sa.Column("dims", sa.Text(), nullable=True),              # 축별 승률 JSON
        sa.Column("n_comparisons", sa.Integer(), server_default="0"),
        sa.Column("model", sa.String(), nullable=True),           # haiku | haiku+sonnet
        sa.Column("judged_at", sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("blog_post_quality")
    op.drop_table("quality_reference")
