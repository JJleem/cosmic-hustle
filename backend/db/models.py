from sqlalchemy import Column, String, Text, DateTime, Integer, Float, ForeignKey, Boolean
from sqlalchemy.orm import deferred
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


# content_type 허용값 — DB에는 제약(ENUM/CHECK)을 두지 않고 app 레이어에서만 검증.
# 분류 체계가 진화 중이라(피벗 이력) 마이그레이션이 번거로운 PG ENUM 대신 nullable 문자열 사용.
CONTENT_TYPES = (
    "MARKETING",  # buzz — 마케팅/바이럴
    "WIKI",       # wiki — 이번 주 키워드 해설
    "DATA",       # ka — 데이터·숫자 인사이트
    "DESIGN",     # pixel — 디자인/문화 감상
    "IDEA",       # ping — 엉뚱한 아이디어
    "SCIENCE",    # pocke·ka — Discovery(과학·우주)
    "ESSAY",      # over — 감성 에세이
    "DEBATE",     # *+fact — AI 토론 시리즈
    "QUIZ",       # plan — AI 테스트
    "INTRO",      # buzz+ping — 소개/공지
    "LAB",        # root — 실험실 리포트(우리 운영 데이터로 쓰는 월간 1차 자료)
)


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
    # 글 수정 시각 — ORM 수정(PATCH /posts/{id}) 시 onupdate로 자동 갱신.
    # server_default는 두지 않음: 기존 글이 "마이그 실행 시각에 수정됨"으로 찍히는 것 방지.
    # 기존 글은 마이그 032에서 published_at(없으면 created_at)으로 백필.
    updated_at = Column(DateTime, nullable=True, onupdate=func.now())
    # SEO·요약 메타 (마이그 032 추가). 전부 nullable — 채우기는 후속 단계(생성기·백필).
    summary = Column(Text, nullable=True)            # 독자용 핵심 요약 1~2문장
    seo_title = Column(String, nullable=True)         # 검색·공유용 제목
    seo_description = Column(Text, nullable=True)     # 검색용 고유 설명
    content_type = Column(String, nullable=True)      # CONTENT_TYPES 중 하나(app 검증, DB 제약 없음)
    # 관련글 의미기반 추천용 임베딩(ko-sroberta 768). deferred — 목록/상세 조회 시 로드 안 됨.
    embedding = deferred(Column(Vector(768), nullable=True))


class BlogComment(Base):
    __tablename__ = "blog_comments"

    id = Column(String, primary_key=True)
    post_id = Column(String, ForeignKey("blog_posts.id"), nullable=False)
    parent_id = Column(String, ForeignKey("blog_comments.id"), nullable=True)
    agent_id = Column(String, nullable=True)
    user_name = Column(String, nullable=True)
    anon_avatar = Column(Integer, nullable=True)   # 익명 아바타 인덱스 (0-49)
    ip_hash = Column(String(16), nullable=True)    # hash(ip+post_id+salt) 앞 16자 — IP 미저장
    client_id = Column(String(64), nullable=True)  # 브라우저 생성 익명 ID — 웹푸시 답글 알림 연결용
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id = Column(String, primary_key=True)
    endpoint = Column(Text, nullable=False, unique=True)
    p256dh = Column(Text, nullable=False)
    auth = Column(Text, nullable=False)
    client_id = Column(String(64), nullable=True)  # 브라우저 익명 ID — 답글 알림 타겟팅용
    created_at = Column(DateTime, server_default=func.now())


class BlogPostLike(Base):
    __tablename__ = "blog_post_likes"

    post_id = Column(String, ForeignKey("blog_posts.id"), primary_key=True, nullable=False)
    ip_hash = Column(String(16), primary_key=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class BlogDailyVisit(Base):
    __tablename__ = "blog_daily_visits"

    date = Column(String, primary_key=True)  # YYYY-MM-DD
    count = Column(Integer, default=0, server_default="0")


class BlogViewLog(Base):
    __tablename__ = "blog_view_log"

    post_id = Column(String, ForeignKey("blog_posts.id", ondelete="CASCADE"), primary_key=True)
    ip_hash = Column(String(16), primary_key=True)
    date = Column(String(10), primary_key=True)  # YYYY-MM-DD


class QuizResultLog(Base):
    __tablename__ = "quiz_result_logs"

    id         = Column(String(36), primary_key=True)
    slug       = Column(String(200), nullable=False, index=True)
    agent_id   = Column(String(50), nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class BlogPostCost(Base):
    __tablename__ = "blog_post_cost"

    id = Column(String, primary_key=True)
    post_id = Column(String, ForeignKey("blog_posts.id", ondelete="CASCADE"), nullable=False, index=True)
    agent_id = Column(String, nullable=False, index=True)
    phase = Column(String, nullable=False)  # content | trend | scene | topic_pick | thumbnail | content_image
    model = Column(String, nullable=True)
    input_tokens = Column(Integer, default=0, server_default="0")
    output_tokens = Column(Integer, default=0, server_default="0")
    cache_read_tokens = Column(Integer, default=0, server_default="0")
    cache_creation_tokens = Column(Integer, default=0, server_default="0")
    cost_usd = Column(Float, default=0.0, server_default="0")
    created_at = Column(DateTime, server_default=func.now())


class BlogPostMetrics(Base):
    __tablename__ = "blog_post_metrics"

    post_id = Column(String, ForeignKey("blog_posts.id", ondelete="CASCADE"), primary_key=True)
    period = Column(String(7), primary_key=True)  # YYYY-MM
    agent_id = Column(String, nullable=False)
    impressions = Column(Integer, default=0, server_default="0")
    clicks = Column(Integer, default=0, server_default="0")
    ctr = Column(Float, default=0.0, server_default="0")
    position = Column(Float, default=0.0, server_default="0")
    sessions = Column(Integer, default=0, server_default="0")
    avg_session_sec = Column(Integer, default=0, server_default="0")
    updated_at = Column(DateTime, server_default=func.now())


class QualityReference(Base):
    __tablename__ = "quality_reference"

    post_id = Column(String, ForeignKey("blog_posts.id", ondelete="CASCADE"), primary_key=True)
    note = Column(String, nullable=True)
    added_at = Column(DateTime, server_default=func.now())


class BlogPostQuality(Base):
    __tablename__ = "blog_post_quality"

    post_id = Column(String, ForeignKey("blog_posts.id", ondelete="CASCADE"), primary_key=True)
    score = Column(Float, default=0.0, server_default="0")  # 0~100 앵커 대비 페어와이즈 승률
    dims = Column(Text, nullable=True)                      # 축별 승률 JSON
    n_comparisons = Column(Integer, default=0, server_default="0")
    model = Column(String, nullable=True)
    judged_at = Column(DateTime, server_default=func.now())


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


class DmCache(Base):
    __tablename__ = "dm_cache"

    id = Column(String, primary_key=True)
    agent_id = Column(String, nullable=False, index=True)
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)
    sources = Column(Text, nullable=True)                  # JSON [{type,title,slug}]
    embedding = Column(Vector(768), nullable=True)         # 질문 임베딩(ko-sroberta)
    hits = Column(Integer, default=0, server_default="0")
    created_at = Column(DateTime, server_default=func.now())


class DmMessageLog(Base):
    __tablename__ = "dm_message_log"

    id = Column(String, primary_key=True)
    date = Column(String(10), nullable=False, index=True)  # YYYY-MM-DD KST
    ip_hash = Column(String(16), nullable=True, index=True)
    agent_id = Column(String, nullable=False)
    cost_usd = Column(Float, default=0.0, server_default="0")
    cached = Column(Boolean, default=False, server_default="false")
    created_at = Column(DateTime, server_default=func.now())


class GaMonthlySnapshot(Base):
    __tablename__ = "ga_monthly_snapshot"

    period = Column(String(30), primary_key=True)
    overview_json = Column(Text, nullable=False)
    ka_analysis = Column(Text, nullable=True)
    buzz_suggestions = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class AgentMemoryHistory(Base):
    __tablename__ = "agent_memory_history"

    id = Column(Integer, autoincrement=True, primary_key=True)
    agent_id = Column(String, nullable=False)
    period = Column(String(30), nullable=False)
    memory_snapshot = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class DebateVote(Base):
    __tablename__ = "debate_votes"

    id = Column(String, primary_key=True)
    post_id = Column(String, ForeignKey("blog_posts.id"), nullable=False)
    voter_key = Column(String, nullable=False)   # "agent:{id}" or ip_hash
    side = Column(String(1), nullable=False)     # 'a' or 'b'
    display_name = Column(String, nullable=True) # 우주 정체성 or 에이전트 이름
    anon_avatar = Column(Integer, nullable=True) # 유저 아바타 인덱스
    created_at = Column(DateTime, server_default=func.now())
