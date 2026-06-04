"""blog_view_log 테이블 추가 (조회수 IP 중복 방지, 하루 1회)

Revision ID: 023
Revises: 022
Create Date: 2026-06-04
"""
from alembic import op
import sqlalchemy as sa

revision = '023'
down_revision = '022'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'blog_view_log',
        sa.Column('post_id', sa.String(), sa.ForeignKey('blog_posts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('ip_hash', sa.String(16), nullable=False),
        sa.Column('date', sa.String(10), nullable=False),
        sa.PrimaryKeyConstraint('post_id', 'ip_hash', 'date'),
    )


def downgrade():
    op.drop_table('blog_view_log')
