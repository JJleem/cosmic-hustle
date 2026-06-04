"""GA 월간 스냅샷 + 에이전트 메모리 히스토리 테이블 추가

Revision ID: 024
Revises: 023
Create Date: 2026-06-04
"""
from alembic import op
import sqlalchemy as sa

revision = '024'
down_revision = '023'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'ga_monthly_snapshot',
        sa.Column('period', sa.String(30), primary_key=True),   # "2026-05-01 ~ 2026-05-31"
        sa.Column('overview_json', sa.Text(), nullable=False),
        sa.Column('ka_analysis', sa.Text(), nullable=True),
        sa.Column('buzz_suggestions', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_table(
        'agent_memory_history',
        sa.Column('id', sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column('agent_id', sa.String(), nullable=False),
        sa.Column('period', sa.String(30), nullable=False),
        sa.Column('memory_snapshot', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table('agent_memory_history')
    op.drop_table('ga_monthly_snapshot')
