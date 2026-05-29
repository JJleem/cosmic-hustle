"""blog_posts tags 컬럼 추가

Revision ID: 018
Revises: 017
Create Date: 2026-05-29
"""
from alembic import op
import sqlalchemy as sa

revision = '018'
down_revision = '017'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('blog_posts', sa.Column('tags', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('blog_posts', 'tags')
