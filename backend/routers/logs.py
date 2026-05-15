"""GET /api/logs — 에러 로그 조회, POST /api/logs — 프론트엔드 에러 수신."""
import uuid
from fastapi import APIRouter, Query
from pydantic import BaseModel
from db.connection import SessionLocal
from db.models import SystemLog
from sqlalchemy import desc

router = APIRouter(prefix="/api/logs", tags=["logs"])


class LogIn(BaseModel):
    level: str = "error"
    source: str = "frontend"
    message: str
    stack_trace: str | None = None
    session_id: str | None = None


@router.post("")
def create_log(body: LogIn):
    db = SessionLocal()
    try:
        db.add(SystemLog(
            id=str(uuid.uuid4()),
            level=body.level,
            source=body.source,
            message=body.message[:2000],
            stack_trace=body.stack_trace,
            session_id=body.session_id,
        ))
        db.commit()
    finally:
        db.close()
    return {"ok": True}


@router.get("")
def get_logs(
    level: str | None = Query(None),
    source: str | None = Query(None),
    session_id: str | None = Query(None),
    limit: int = Query(50, le=200),
):
    db = SessionLocal()
    try:
        q = db.query(SystemLog)
        if level:
            q = q.filter(SystemLog.level == level)
        if source:
            q = q.filter(SystemLog.source == source)
        if session_id:
            q = q.filter(SystemLog.session_id == session_id)
        rows = q.order_by(desc(SystemLog.created_at)).limit(limit).all()
        return [
            {
                "id": r.id,
                "level": r.level,
                "source": r.source,
                "message": r.message,
                "stack_trace": r.stack_trace,
                "session_id": r.session_id,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]
    finally:
        db.close()
