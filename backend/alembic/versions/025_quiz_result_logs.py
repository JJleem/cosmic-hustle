"""퀴즈 결과 집계 테이블 추가

Revision ID: 025
Revises: 024
Create Date: 2026-06-10
"""
from alembic import op
import sqlalchemy as sa

revision = '025'
down_revision = '024'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'quiz_result_logs',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('slug', sa.String(200), nullable=False, index=True),
        sa.Column('agent_id', sa.String(50), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table('quiz_result_logs')
