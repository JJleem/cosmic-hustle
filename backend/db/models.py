from sqlalchemy import Column, String, Text, DateTime, Integer, ForeignKey
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
    tags = Column(Text, nullable=True)  # JSON array string, e.g. '["AI","트렌드"]'
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


class WikiEntry(Base):
    __tablename__ = "wiki_entries"

    id = Column(String, primary_key=True)
    filename = Column(String, unique=True, nullable=False)
    title = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    embedding = Column(Vector(384), nullable=True)
    updated_at = Column(DateTime, server_default=func.now())
