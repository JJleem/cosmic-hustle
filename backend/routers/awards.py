"""사원상 대시보드 API — 글/에이전트 단위 3축 점수 + 지표 수집 트리거."""
import os
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from db.connection import get_db
from db.models import QualityReference, BlogPost
import awards
import quality

router = APIRouter(prefix="/api/awards", tags=["awards"])

_ADMIN_KEY = os.environ.get("ADMIN_KEY", "")


def _require_admin(request: Request):
    key = request.headers.get("X-Admin-Key")
    if not _ADMIN_KEY or key != _ADMIN_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")


def _default_period() -> str:
    return date.today().strftime("%Y-%m")


@router.get("")
def get_awards(period: str | None = None, db: Session = Depends(get_db)):
    """해당 월의 사원상 점수표. period 미지정 시 이번 달."""
    return awards.build_awards(db, period or _default_period())


@router.post("/collect")
def collect(period: str | None = None, db: Session = Depends(get_db), _=Depends(_require_admin)):
    """GSC/GA 지표를 긁어 blog_post_metrics에 적재(현재 달 갱신용). 관리자 전용."""
    p = period or _default_period()
    count = awards.collect_post_metrics(db, p)
    return {"period": p, "posts_processed": count}


@router.get("/reference")
def get_reference(db: Session = Depends(get_db)):
    """현재 고정 레퍼런스 세트(앵커) 목록."""
    rows = (
        db.query(QualityReference, BlogPost)
        .join(BlogPost, BlogPost.id == QualityReference.post_id)
        .all()
    )
    return [{"slug": p.slug, "title": p.title, "agent_id": p.agent_id, "note": q.note} for q, p in rows]


@router.post("/reference")
def set_reference(items: list[dict], db: Session = Depends(get_db), _=Depends(_require_admin)):
    """레퍼런스 세트 교체. body: [{"slug": ..., "note": ...}]. 기존 품질 점수는 무효화됨. 관리자 전용."""
    count = quality.set_reference(db, items)
    return {"registered": count, "note": "set_reference 후 /judge 로 재판정 필요"}


@router.post("/judge")
async def judge(only_missing: bool = True, db: Session = Depends(get_db), _=Depends(_require_admin)):
    """개인 글 전체를 앵커 대비 페어와이즈로 판정해 blog_post_quality에 적재. 관리자 전용."""
    return await quality.judge_all(db, only_missing=only_missing)
