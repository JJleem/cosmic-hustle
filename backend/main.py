import sys
import asyncio
import logging
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from db.connection import engine, Base, SessionLocal
from db.models import BlogPost
from routers import health, research, wiki, memos, versions, export, logs, thumbnail, blog

Base.metadata.create_all(bind=engine)

logger = logging.getLogger(__name__)
app = FastAPI(title="Cosmic Hustle API")
scheduler = AsyncIOScheduler()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://blog.cosmic-hustle.com"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(research.router)
app.include_router(wiki.router)
app.include_router(memos.router)
app.include_router(versions.router)
app.include_router(export.router)
app.include_router(logs.router)
app.include_router(thumbnail.router)
app.include_router(blog.router)


async def _daily_blog_job():
    from blog_generator import generate_blog_post, generate_comments
    from db.models import BlogComment
    db = SessionLocal()
    try:
        data = await generate_blog_post()
        existing = db.query(BlogPost).filter(BlogPost.slug == data["slug"]).first()
        if existing:
            logger.info(f"블로그 포스트 이미 존재: {data['slug']}")
            return
        post = BlogPost(**data)
        db.add(post)
        db.flush()
        summary = data["content"][:300]
        comments = await generate_comments(post.id, post.agent_id, post.title, summary)
        for c in comments:
            db.add(BlogComment(**c))
        db.commit()
        logger.info(f"블로그 포스트+댓글 생성 완료: {data['slug']}")
    except Exception as e:
        logger.error(f"블로그 자동 생성 실패: {e}")
    finally:
        db.close()


@app.on_event("startup")
async def startup():
    scheduler.add_job(
        _daily_blog_job,
        CronTrigger(hour=9, minute=0),  # 매일 오전 9시 (서버 시간 기준)
        id="daily_blog",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("APScheduler 시작 — 매일 09:00 블로그 자동 생성")


@app.on_event("shutdown")
async def shutdown():
    scheduler.shutdown(wait=False)
