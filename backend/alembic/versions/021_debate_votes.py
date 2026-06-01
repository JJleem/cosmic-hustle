"""debate_votes 테이블 추가

Revision ID: 021
Revises: 020
Create Date: 2026-06-01
"""
from alembic import op
import sqlalchemy as sa

revision = '021'
down_revision = '020'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'debate_votes',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('post_id', sa.String(), sa.ForeignKey('blog_posts.id'), nullable=False),
        sa.Column('ip_hash', sa.String(16), nullable=False),
        sa.Column('side', sa.String(1), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index('ix_debate_votes_post_id', 'debate_votes', ['post_id'])
    op.create_index('ix_debate_votes_post_ip', 'debate_votes', ['post_id', 'ip_hash'], unique=True)


def downgrade():
    op.drop_index('ix_debate_votes_post_ip', table_name='debate_votes')
    op.drop_index('ix_debate_votes_post_id', table_name='debate_votes')
    op.drop_table('debate_votes')
