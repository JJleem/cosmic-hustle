"""initial schema

Revision ID: 001
Revises:
Create Date: 2025-05-11
"""
from alembic import op
import sqlalchemy as sa

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sessions",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("topic", sa.Text(), nullable=False),
        sa.Column("status", sa.String(), server_default="working"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
    )
    op.create_table(
        "reports",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("session_id", sa.String(), sa.ForeignKey("sessions.id")),
        sa.Column("agent_id", sa.String(), nullable=False),
        sa.Column("topic", sa.Text(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_table(
        "session_events",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("session_id", sa.String(), sa.ForeignKey("sessions.id")),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("payload", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_table(
        "memos",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_session_events_session_seq", "session_events", ["session_id", "seq"])


def downgrade() -> None:
    op.drop_index("ix_session_events_session_seq")
    op.drop_table("memos")
    op.drop_table("session_events")
    op.drop_table("reports")
    op.drop_table("sessions")
