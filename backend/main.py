import sys
import asyncio
import logging
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from db.connection import engine, Base, SessionLocal
from db.models import BlogPost, AgentMemory
from routers import health, research, wiki, memos, versions, export, logs, thumbnail, blog

Base.metadata.create_all(bind=engine)

logger = logging.getLogger(__name__)
limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="Cosmic Hustle API")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
scheduler = AsyncIOScheduler()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://blog.cosmic-hustle.com", "https://cosmic-hustle.ai.kr"],
    allow_methods=["*"],
    allow_headers=["*"],
)

static_dir = Path(__file__).parent / "static"
static_dir.mkdir(exist_ok=True)

@app.middleware("http")
async def cache_static(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/static/blog/"):
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    return response

app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

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

    for attempt in range(1, 4):
        db = SessionLocal()
        try:
            from datetime import timedelta
            cutoff = datetime.now() - timedelta(days=14)
            recent_rows = (
                db.query(BlogPost.title, BlogPost.trending_topic)
                .filter(BlogPost.published_at >= cutoff)
                .order_by(BlogPost.published_at.desc())
                .limit(30).all()
            )
            recent_titles = [
                f"{title} (핵심 아이디어: {topic})" if topic else title
                for title, topic in recent_rows
            ]

            # 오늘 담당 에이전트 메모리 조회
            from blog_generator import get_today_agent
            today_agent_id, _ = get_today_agent()
            mem_row = db.query(AgentMemory).filter(AgentMemory.agent_id == today_agent_id).first()
            agent_memory = mem_row.memory if mem_row else None

            data = await generate_blog_post(recent_titles=recent_titles, memory=agent_memory)
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
            return
        except Exception as e:
            db.rollback()
            logger.error(f"블로그 자동 생성 실패 (시도 {attempt}/3): {e}")
            if attempt < 3:
                await asyncio.sleep(60)
        finally:
            db.close()

    logger.error("블로그 자동 생성 3회 모두 실패")


async def _memory_update_job():
    """어제 발행된 포스트의 유저 반응을 읽어 에이전트 메모리를 업데이트 (매일 09:05 KST)."""
    from blog_generator import update_agent_memory
    from db.models import BlogComment
    from datetime import timedelta, timezone

    db = SessionLocal()
    try:
        now = datetime.utcnow()
        # 23~49시간 전에 발행된 포스트 (어제 09:00 KST = 어제 00:00 UTC)
        start = now - timedelta(hours=49)
        end = now - timedelta(hours=23)

        posts = (
            db.query(BlogPost)
            .filter(BlogPost.published_at >= start, BlogPost.published_at <= end)
            .all()
        )

        for post in posts:
            agent_id = post.agent_id
            if "+" in agent_id:
                continue  # 콜라보 포스트 (buzz+ping) 제외

            user_comments = (
                db.query(BlogComment.content)
                .filter(BlogComment.post_id == post.id, BlogComment.agent_id.is_(None))
                .all()
            )
            comment_texts = [c.content for c in user_comments]

            mem_row = db.query(AgentMemory).filter(AgentMemory.agent_id == agent_id).first()
            current_memory = mem_row.memory if mem_row else None

            new_memory = await update_agent_memory(
                agent_id=agent_id,
                post_title=post.title,
                post_content=post.content,
                view_count=post.view_count or 0,
                likes=post.likes or 0,
                user_comments=comment_texts,
                current_memory=current_memory,
            )

            if mem_row:
                mem_row.memory = new_memory
                mem_row.updated_at = datetime.utcnow()
            else:
                db.add(AgentMemory(agent_id=agent_id, memory=new_memory))

            logger.info(f"에이전트 메모리 업데이트: {agent_id} (댓글 {len(comment_texts)}개, {post.view_count}조회)")

        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"에이전트 메모리 업데이트 실패: {e}")
    finally:
        db.close()


@app.on_event("startup")
async def startup():
    scheduler.add_job(
        _daily_blog_job,
        CronTrigger(hour=9, minute=0, timezone="Asia/Seoul"),
        id="daily_blog",
        replace_existing=True,
    )
    scheduler.add_job(
        _memory_update_job,
        CronTrigger(hour=9, minute=5, timezone="Asia/Seoul"),
        id="memory_update",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("APScheduler 시작 — 매일 09:00 블로그 자동 생성, 09:05 메모리 업데이트")


@app.on_event("shutdown")
async def shutdown():
    scheduler.shutdown(wait=False)
