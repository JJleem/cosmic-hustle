import os

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from blog_daily_report import build_daily_blog_report, build_weekly_prompt_memory_report
from db.connection import get_db

router = APIRouter(prefix="/api/blog/report", tags=["blog-report"])

_ADMIN_KEY = os.environ.get("ADMIN_KEY", "")


def _require_admin(request: Request):
    # 헤더만 허용 — 서버 TLS 미적용이라 쿼리스트링 키는 nginx 로그·브라우저 히스토리에 평문 노출됨
    key = request.headers.get("X-Admin-Key")
    if not _ADMIN_KEY or key != _ADMIN_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")


@router.get("/daily/preview")
async def preview_daily_blog_report(request: Request, db: Session = Depends(get_db)):
    _require_admin(request)
    return await build_daily_blog_report(db, send_slack=False)


@router.post("/daily")
async def send_daily_blog_report(request: Request, db: Session = Depends(get_db)):
    _require_admin(request)
    return await build_daily_blog_report(db, send_slack=True)


@router.get("/prompt-memory/weekly/preview")
async def preview_weekly_prompt_memory_report(request: Request, db: Session = Depends(get_db)):
    _require_admin(request)
    return await build_weekly_prompt_memory_report(db, send_slack=False)


@router.post("/prompt-memory/weekly")
async def send_weekly_prompt_memory_report(request: Request, db: Session = Depends(get_db)):
    _require_admin(request)
    return await build_weekly_prompt_memory_report(db, send_slack=True)
