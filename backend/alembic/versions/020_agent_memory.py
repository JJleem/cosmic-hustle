"""agent_memory 테이블 추가

Revision ID: 020
Revises: 019
Create Date: 2026-06-01
"""
from alembic import op
import sqlalchemy as sa

revision = '020'
down_revision = '019'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'agent_memory',
        sa.Column('agent_id', sa.String(), primary_key=True),
        sa.Column('memory', sa.Text(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table('agent_memory')
