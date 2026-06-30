"""blog_posts SEO·요약 메타 필드 추가 — summary/seo_title/seo_description/content_type + updated_at

- 5개 컬럼 모두 nullable, server_default 없음.
- updated_at만 기존 글을 published_at(없으면 created_at)으로 백필 →
  기존 글이 "마이그 실행 시각에 수정됨"으로 보이지 않게 함.
- summary/seo_title/seo_description/content_type은 이번 단계에서 백필하지 않음(전부 null 유지).

Revision ID: 032
Revises: 031
Create Date: 2026-06-29
"""
from alembic import op
import sqlalchemy as sa

revision = "032"
down_revision = "031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1) 5개 컬럼 추가 — 전부 nullable, server_default 없음(기존 글은 null 유지)
    op.add_column("blog_posts", sa.Column("updated_at", sa.DateTime(), nullable=True))
    op.add_column("blog_posts", sa.Column("summary", sa.Text(), nullable=True))
    op.add_column("blog_posts", sa.Column("seo_title", sa.String(), nullable=True))
    op.add_column("blog_posts", sa.Column("seo_description", sa.Text(), nullable=True))
    op.add_column("blog_posts", sa.Column("content_type", sa.String(), nullable=True))

    # 2) updated_at만 백필: published_at(없으면 created_at, 둘 다 없으면 null)
    #    COALESCE로 의미 보존. published_at은 현재 NOT NULL이라 사실상 항상 published_at.
    op.execute(
        "UPDATE blog_posts "
        "SET updated_at = COALESCE(published_at, created_at) "
        "WHERE updated_at IS NULL"
    )
    # summary/seo_title/seo_description/content_type은 백필하지 않음 — 전부 null 유지.


def downgrade() -> None:
    op.drop_column("blog_posts", "content_type")
    op.drop_column("blog_posts", "seo_description")
    op.drop_column("blog_posts", "seo_title")
    op.drop_column("blog_posts", "summary")
    op.drop_column("blog_posts", "updated_at")
