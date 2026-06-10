import os

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from blog_daily_report import build_daily_blog_report, build_weekly_prompt_memory_report
from db.connection import get_db

router = APIRouter(prefix="/api/blog/report", tags=["blog-report"])

_ADMIN_KEY = os.environ.get("ADMIN_KEY", "")


def _require_admin(request: Request):
    key = request.headers.get("X-Admin-Key") or request.query_params.get("admin_key")
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
