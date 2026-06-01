from sqlalchemy import Column, String, Text, DateTime, Integer, Float, ForeignKey, Boolean
from sqlalchemy.sql import func
from pgvector.sqlalchemy import Vector
from .connection import Base


class Session(Base):
    __tablename__ = "sessions"

    id = Column(String, primary_key=True)
    topic = Column(Text, nullable=False)
    status = Column(String, default="working")  # working | done | error | cancelled | paused
    created_at = Column(DateTime, server_default=func.now())
    completed_at = Column(DateTime, nullable=True)


class Report(Base):
    __tablename__ = "reports"

    id = Column(String, primary_key=True)
    session_id = Column(String, ForeignKey("sessions.id"))
    agent_id = Column(String, nullable=False)
    topic = Column(Text, nullable=False)
    content = Column(Text, nullable=False)
    tags = Column(Text, nullable=True)  # JSON array string
    thumbnail_prompts = Column(Text, nullable=True)  # JSON array string
    task_type = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class SessionEvent(Base):
    __tablename__ = "session_events"

    id = Column(String, primary_key=True)
    session_id = Column(String, ForeignKey("sessions.id"))
    seq = Column(Integer, nullable=False)
    payload = Column(Text, nullable=False)  # JSON string
    created_at = Column(DateTime, server_default=func.now())


class Memo(Base):
    __tablename__ = "memos"

    id = Column(String, primary_key=True)
    text = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class ReportVersion(Base):
    __tablename__ = "report_versions"

    id = Column(String, primary_key=True)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False)
    version = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    fact_feedback = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class SessionCheckpoint(Base):
    __tablename__ = "session_checkpoints"

    id = Column(String, primary_key=True)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False)
    stage = Column(String, nullable=False)  # after_plan | after_research | after_analysis
    payload = Column(Text, nullable=False)  # JSON blob with all intermediate data
    created_at = Column(DateTime, server_default=func.now())


class SystemLog(Base):
    __tablename__ = "system_logs"

    id = Column(String, primary_key=True)
    level = Column(String, nullable=False)        # error | warn | info
    source = Column(String, nullable=False)       # pipeline | agent | api | frontend
    message = Column(Text, nullable=False)
    stack_trace = Column(Text, nullable=True)
    session_id = Column(String, nullable=True)    # 어떤 리서치 중 발생했는지
    created_at = Column(DateTime, server_default=func.now())


class TokenUsage(Base):
    __tablename__ = "token_usage"

    id = Column(String, primary_key=True)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False)
    agent_id = Column(String, nullable=False)
    input_tokens = Column(Integer, default=0)
    output_tokens = Column(Integer, default=0)
    cache_read_tokens = Column(Integer, default=0)
    cache_creation_tokens = Column(Integer, default=0)
    cost_usd = Column(Float, default=0.0)
    model = Column(String, nullable=True)
    ts = Column(DateTime, server_default=func.now())


class BlogPost(Base):
    __tablename__ = "blog_posts"

    id = Column(String, primary_key=True)
    agent_id = Column(String, nullable=False)
    title = Column(String, nullable=False)
    slug = Column(String, unique=True, nullable=False)
    content = Column(Text, nullable=False)
    thumbnail_url = Column(String, nullable=True)
    tags = Column(Text, nullable=True)  # JSON array string e.g. '["AI", "트렌드"]'
    published = Column(Boolean, default=True)
    trending_topic = Column(String, nullable=True)
    published_at = Column(DateTime, nullable=False)
    likes = Column(Integer, default=0, server_default="0")
    view_count = Column(Integer, default=0, server_default="0")
    created_at = Column(DateTime, server_default=func.now())


class BlogComment(Base):
    __tablename__ = "blog_comments"

    id = Column(String, primary_key=True)
    post_id = Column(String, ForeignKey("blog_posts.id"), nullable=False)
    parent_id = Column(String, ForeignKey("blog_comments.id"), nullable=True)
    agent_id = Column(String, nullable=True)
    user_name = Column(String, nullable=True)
    anon_avatar = Column(Integer, nullable=True)   # 익명 아바타 인덱스 (0-49)
    ip_hash = Column(String(16), nullable=True)    # hash(ip+post_id+salt) 앞 16자 — IP 미저장
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class BlogDailyVisit(Base):
    __tablename__ = "blog_daily_visits"

    date = Column(String, primary_key=True)  # YYYY-MM-DD
    count = Column(Integer, default=0, server_default="0")


class WikiEntry(Base):
    __tablename__ = "wiki_entries"

    id = Column(String, primary_key=True)
    filename = Column(String, unique=True, nullable=False)
    title = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    embedding = Column(Vector(768), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now())


class AgentMemory(Base):
    __tablename__ = "agent_memory"

    agent_id = Column(String, primary_key=True)
    memory = Column(Text, nullable=True)
    updated_at = Column(DateTime, server_default=func.now())


class DebateVote(Base):
    __tablename__ = "debate_votes"

    id = Column(String, primary_key=True)
    post_id = Column(String, ForeignKey("blog_posts.id"), nullable=False)
    voter_key = Column(String, nullable=False)   # "agent:{id}" or ip_hash
    side = Column(String(1), nullable=False)     # 'a' or 'b'
    display_name = Column(String, nullable=True) # 우주 정체성 or 에이전트 이름
    anon_avatar = Column(Integer, nullable=True) # 유저 아바타 인덱스
    created_at = Column(DateTime, server_default=func.now())
