"""blog_post_likes 테이블 추가 (좋아요 중복 방지)

Revision ID: 022
Revises: 021
Create Date: 2026-06-04
"""
from alembic import op
import sqlalchemy as sa

revision = '022'
down_revision = '021'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'blog_post_likes',
        sa.Column('post_id', sa.String(), sa.ForeignKey('blog_posts.id'), nullable=False),
        sa.Column('ip_hash', sa.String(16), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('post_id', 'ip_hash'),
    )
    op.create_index('ix_blog_post_likes_post_id', 'blog_post_likes', ['post_id'])


def downgrade():
    op.drop_index('ix_blog_post_likes_post_id', table_name='blog_post_likes')
    op.drop_table('blog_post_likes')
