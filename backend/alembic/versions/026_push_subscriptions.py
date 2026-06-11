"""push_subscriptions 테이블 + blog_comments.client_id 추가 (웹푸시 알림)

Revision ID: 026
Revises: 025
Create Date: 2026-06-11
"""
from alembic import op
import sqlalchemy as sa

revision = '026'
down_revision = '025'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'push_subscriptions',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('endpoint', sa.Text(), nullable=False),
        sa.Column('p256dh', sa.Text(), nullable=False),
        sa.Column('auth', sa.Text(), nullable=False),
        sa.Column('client_id', sa.String(64), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('endpoint', name='uq_push_subscriptions_endpoint'),
    )
    op.create_index('ix_push_subscriptions_client_id', 'push_subscriptions', ['client_id'])

    op.add_column('blog_comments', sa.Column('client_id', sa.String(64), nullable=True))
    op.create_index('ix_blog_comments_client_id', 'blog_comments', ['client_id'])


def downgrade():
    op.drop_index('ix_blog_comments_client_id', table_name='blog_comments')
    op.drop_column('blog_comments', 'client_id')
    op.drop_index('ix_push_subscriptions_client_id', table_name='push_subscriptions')
    op.drop_table('push_subscriptions')
