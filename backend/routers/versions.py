from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from db.connection import get_db
from db.models import ReportVersion, TokenUsage

router = APIRouter(prefix="/api/sessions")


def _serialize_token_usage(rows):
    agents = [
        {
            "agentId": r.agent_id,
            "inputTokens": r.input_tokens or 0,
            "outputTokens": r.output_tokens or 0,
            "cacheReadTokens": r.cache_read_tokens or 0,
            "cacheCreationTokens": r.cache_creation_tokens or 0,
            "costUsd": r.cost_usd or 0.0,
            "model": r.model or "",
        }
        for r in rows
    ]
    total = {
        "inputTokens": sum(a["inputTokens"] for a in agents),
        "outputTokens": sum(a["outputTokens"] for a in agents),
        "cacheReadTokens": sum(a["cacheReadTokens"] for a in agents),
        "cacheCreationTokens": sum(a["cacheCreationTokens"] for a in agents),
        "costUsd": round(sum(a["costUsd"] for a in agents), 6),
    }
    return {"agents": agents, "total": total}


@router.get("/{session_id}/versions")
def get_versions(session_id: str, db: Session = Depends(get_db)):
    rows = (
        db.query(ReportVersion)
        .filter(ReportVersion.session_id == session_id)
        .order_by(ReportVersion.version)
        .all()
    )
    return [
        {
            "version": r.version,
            "content": r.content,
            "factFeedback": r.fact_feedback,
            "createdAt": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.get("/{session_id}/token-usage")
def get_token_usage(session_id: str, db: Session = Depends(get_db)):
    rows = (
        db.query(TokenUsage)
        .filter(TokenUsage.session_id == session_id)
        .order_by(TokenUsage.ts)
        .all()
    )
    return _serialize_token_usage(rows)


@router.get("/latest/token-usage")
def get_latest_token_usage(db: Session = Depends(get_db)):
    """가장 최근 세션(token_usage 존재하는)의 토큰 사용량 반환."""
    latest = (
        db.query(TokenUsage.session_id)
        .order_by(TokenUsage.ts.desc())
        .limit(1)
        .scalar()
    )
    if not latest:
        return {"agents": [], "total": {"inputTokens": 0, "outputTokens": 0, "cacheReadTokens": 0, "cacheCreationTokens": 0, "costUsd": 0.0}}
    rows = db.query(TokenUsage).filter(TokenUsage.session_id == latest).order_by(TokenUsage.ts).all()
    return _serialize_token_usage(rows)
