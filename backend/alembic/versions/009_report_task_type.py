"""report task_type column

Revision ID: 009
Revises: 008
Create Date: 2026-05-20
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


def upgrade() -> None:
    bind = op.get_bind()
    cols = [c["name"] for c in inspect(bind).get_columns("reports")]
    if "task_type" not in cols:
        op.add_column("reports", sa.Column("task_type", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("reports", "task_type")
