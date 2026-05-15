"""system_logs table

Revision ID: 005
Revises: 004
Create Date: 2026-05-15
"""
from alembic import op
import sqlalchemy as sa

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    from sqlalchemy import inspect
    bind = op.get_bind()
    if "system_logs" not in inspect(bind).get_table_names():
        op.create_table(
            "system_logs",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("level", sa.String(), nullable=False),
            sa.Column("source", sa.String(), nullable=False),
            sa.Column("message", sa.Text(), nullable=False),
            sa.Column("stack_trace", sa.Text(), nullable=True),
            sa.Column("session_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        )
    existing_indexes = [i["name"] for i in inspect(bind).get_indexes("system_logs")]
    if "ix_system_logs_level" not in existing_indexes:
        op.create_index("ix_system_logs_level", "system_logs", ["level"])
    if "ix_system_logs_created_at" not in existing_indexes:
        op.create_index("ix_system_logs_created_at", "system_logs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_system_logs_created_at", "system_logs")
    op.drop_index("ix_system_logs_level", "system_logs")
    op.drop_table("system_logs")
