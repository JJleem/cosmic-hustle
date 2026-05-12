from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from db.connection import get_db
from db.models import ReportVersion

router = APIRouter(prefix="/api/sessions")


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
