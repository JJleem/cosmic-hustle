"""에이전트 DM — 시맨틱 캐시 + 메시지 로그(비용·IP 가드용)

Revision ID: 031
Revises: 030
Create Date: 2026-06-15
"""
from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

revision = "031"
down_revision = "030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 시맨틱 캐시 — 거의 동일한 질문(코사인거리 < 임계값) 재사용. 환각/비용 동시 절감.
    op.create_table(
        "dm_cache",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("agent_id", sa.String(), nullable=False, index=True),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=False),
        sa.Column("sources", sa.Text(), nullable=True),          # JSON [{type,title,slug}]
        sa.Column("embedding", Vector(768), nullable=True),      # 질문 임베딩(ko-sroberta)
        sa.Column("hits", sa.Integer(), server_default="0"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    # 메시지 로그 — 일일 글로벌 지출 합산 + IP당 일일 횟수 카운트(둘 다 이 한 테이블로).
    op.create_table(
        "dm_message_log",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("date", sa.String(length=10), nullable=False, index=True),  # YYYY-MM-DD KST
        sa.Column("ip_hash", sa.String(length=16), nullable=True, index=True),
        sa.Column("agent_id", sa.String(), nullable=False),
        sa.Column("cost_usd", sa.Float(), server_default="0"),
        sa.Column("cached", sa.Boolean(), server_default="false"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("dm_message_log")
    op.drop_table("dm_cache")
