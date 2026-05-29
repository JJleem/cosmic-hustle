"""blog_comment anon_avatar, ip_hash 추가

Revision ID: 017
Revises: 016
Create Date: 2026-05-29
"""
from alembic import op
import sqlalchemy as sa

revision = '017'
down_revision = '016'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('blog_comments', sa.Column('anon_avatar', sa.Integer(), nullable=True))
    op.add_column('blog_comments', sa.Column('ip_hash', sa.String(16), nullable=True))


def downgrade():
    op.drop_column('blog_comments', 'ip_hash')
    op.drop_column('blog_comments', 'anon_avatar')
