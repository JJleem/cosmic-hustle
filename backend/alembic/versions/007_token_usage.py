"""token usage table

Revision ID: 007
Revises: 006
Create Date: 2026-05-20
"""
from alembic import op
import sqlalchemy as sa

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    from sqlalchemy import inspect
    bind = op.get_bind()
    tables = inspect(bind).get_table_names()
    if "token_usage" not in tables:
        op.create_table(
            "token_usage",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("session_id", sa.String(), sa.ForeignKey("sessions.id"), nullable=False),
            sa.Column("agent_id", sa.String(), nullable=False),
            sa.Column("input_tokens", sa.Integer(), nullable=True, server_default="0"),
            sa.Column("output_tokens", sa.Integer(), nullable=True, server_default="0"),
            sa.Column("cache_read_tokens", sa.Integer(), nullable=True, server_default="0"),
            sa.Column("cache_creation_tokens", sa.Integer(), nullable=True, server_default="0"),
            sa.Column("cost_usd", sa.Float(), nullable=True, server_default="0"),
            sa.Column("model", sa.String(), nullable=True),
            sa.Column("ts", sa.DateTime(), server_default=sa.text("now()")),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_token_usage_session_id", "token_usage", ["session_id"])


def downgrade() -> None:
    op.drop_index("ix_token_usage_session_id", table_name="token_usage")
    op.drop_table("token_usage")
