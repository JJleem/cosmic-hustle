"""session_checkpoints table

Revision ID: 004
Revises: 003
Create Date: 2026-05-14
"""
from alembic import op
import sqlalchemy as sa

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "session_checkpoints",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("session_id", sa.String(), sa.ForeignKey("sessions.id"), nullable=False),
        sa.Column("stage", sa.String(), nullable=False),
        sa.Column("payload", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_session_checkpoints_session", "session_checkpoints", ["session_id"])


def downgrade() -> None:
    op.drop_index("ix_session_checkpoints_session")
    op.drop_table("session_checkpoints")
