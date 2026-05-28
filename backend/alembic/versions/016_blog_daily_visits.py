"""blog_daily_visits 테이블 추가

Revision ID: 016
Revises: 015
Create Date: 2026-05-28
"""
from alembic import op
import sqlalchemy as sa

revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    tables = {row[0] for row in bind.execute(sa.text("SELECT tablename FROM pg_tables WHERE schemaname='public'"))}
    if "blog_daily_visits" not in tables:
        op.create_table(
            "blog_daily_visits",
            sa.Column("date", sa.String(), primary_key=True),
            sa.Column("count", sa.Integer(), nullable=False, server_default="0"),
        )


def downgrade():
    op.drop_table("blog_daily_visits")
