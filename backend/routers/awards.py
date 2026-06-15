"""사원상 대시보드 API — 글/에이전트 단위 3축 점수 + 지표 수집 트리거."""
import os
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from db.connection import get_db
import awards

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
