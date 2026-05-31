"""blog_comments, blog_posts 인덱스 추가

Revision ID: 019
Revises: 018
Create Date: 2026-05-31
"""
from alembic import op

revision = '019'
down_revision = '018'
branch_labels = None
depends_on = None


def upgrade():
    op.create_index('ix_blog_comments_post_id', 'blog_comments', ['post_id'])
    op.create_index('ix_blog_comments_parent_id', 'blog_comments', ['parent_id'])
    op.create_index('ix_blog_comments_ip_hash', 'blog_comments', ['ip_hash'])
    op.create_index('ix_blog_posts_published_at', 'blog_posts', ['published_at'])


def downgrade():
    op.drop_index('ix_blog_comments_post_id', table_name='blog_comments')
    op.drop_index('ix_blog_comments_parent_id', table_name='blog_comments')
    op.drop_index('ix_blog_comments_ip_hash', table_name='blog_comments')
    op.drop_index('ix_blog_posts_published_at', table_name='blog_posts')
