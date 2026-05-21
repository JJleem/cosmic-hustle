"""backfill report task_type from agent_id

Revision ID: 010
Revises: 009
Create Date: 2026-05-20
"""
from alembic import op

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        UPDATE reports
        SET task_type = CASE agent_id
            WHEN 'buzz'  THEN 'marketing'
            WHEN 'pixel' THEN 'design_ux'
            WHEN 'run'   THEN 'dev'
            ELSE              'research'
        END
        WHERE task_type IS NULL
    """)


def downgrade() -> None:
    pass
