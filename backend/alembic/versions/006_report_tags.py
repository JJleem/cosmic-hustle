"""report tags column

Revision ID: 006
Revises: 005
Create Date: 2026-05-18
"""
from alembic import op
import sqlalchemy as sa

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    from sqlalchemy import inspect
    bind = op.get_bind()
    cols = [c["name"] for c in inspect(bind).get_columns("reports")]
    if "tags" not in cols:
        op.add_column("reports", sa.Column("tags", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("reports", "tags")
