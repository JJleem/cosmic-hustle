from sqlalchemy import Column, String, Text, DateTime, Integer, ForeignKey
from sqlalchemy.sql import func
from pgvector.sqlalchemy import Vector
from .connection import Base

class Session(Base):
    __tablename__ = "sessions"

    id = Column(String, primary_key=True)
    topic = Column(Text, nullable=False)
    status = Column(String, default="working")  # working | done | error | cancelled
    created_at = Column(DateTime, server_default=func.now())
    completed_at = Column(DateTime, nullable=True)


class Report(Base):
    __tablename__ = "reports"

    id = Column(String, primary_key=True)
    session_id = Column(String, ForeignKey("sessions.id"))
    agent_id = Column(String, nullable=False)
    topic = Column(Text, nullable=False)
    content = Column(Text, nullable=False)
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


class WikiEntry(Base):
    __tablename__ = "wiki_entries"

    id = Column(String, primary_key=True)
    filename = Column(String, unique=True, nullable=False)
    title = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    embedding = Column(Vector(384), nullable=True)
    updated_at = Column(DateTime, server_default=func.now())
