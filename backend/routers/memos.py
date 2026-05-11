import uuid
from datetime import timezone
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db.connection import get_db
from db import models

router = APIRouter(prefix="/api")


def _ts(dt) -> int | None:
    if dt is None:
        return None
    try:
        return int(dt.replace(tzinfo=timezone.utc).timestamp())
    except Exception:
        return None


class MemoCreate(BaseModel):
    text: str


@router.get("/memos")
def list_memos(db: Session = Depends(get_db)):
    rows = (
        db.query(models.Memo)
        .order_by(models.Memo.created_at.desc())
        .limit(200)
        .all()
    )
    return [{"id": m.id, "text": m.text, "createdAt": _ts(m.created_at)} for m in rows]


@router.post("/memos")
def create_memo(body: MemoCreate, db: Session = Depends(get_db)):
    text = body.text.strip()
    if not text:
        from fastapi.responses import JSONResponse
        return JSONResponse({"error": "text required"}, status_code=400)
    memo = models.Memo(id=str(uuid.uuid4()), text=text)
    db.add(memo)
    db.commit()
    db.refresh(memo)
    return {"id": memo.id, "text": memo.text, "createdAt": _ts(memo.created_at)}


@router.delete("/memos/{memo_id}")
def delete_memo(memo_id: str, db: Session = Depends(get_db)):
    db.query(models.Memo).filter(models.Memo.id == memo_id).delete()
    db.commit()
    return {"ok": True}
