import sys
import uuid
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
from routers import health, wiki, blog, blog_report, awards, dm

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
app.include_router(wiki.router)
app.include_router(blog.router)
app.include_router(blog_report.router)
app.include_router(awards.router)
app.include_router(dm.router)


async def _daily_blog_job():
    from blog_generator import generate_blog_post, generate_discovery_post, generate_comments, attach_embedding, record_post_costs
    from db.models import BlogComment

    for attempt in range(1, 4):
        db = SessionLocal()
        try:
            from routers.blog import _recent_post_context
            # 오늘 담당 에이전트 메모리 조회
            from blog_generator import get_today_agent
            today_agent_id, _ = get_today_agent()

            recent_titles, frequent_tags, recent_posts, agent_recent_tags = _recent_post_context(db, agent_id=today_agent_id)
            mem_row = db.query(AgentMemory).filter(AgentMemory.agent_id == today_agent_id).first()
            agent_memory = mem_row.memory if mem_row else None

            last_agent_title = None
            if today_agent_id == "pixel":
                last_pixel = (
                    db.query(BlogPost.title)
                    .filter(BlogPost.agent_id == "pixel")
                    .order_by(BlogPost.published_at.desc())
                    .first()
                )
                last_agent_title = last_pixel[0] if last_pixel else None

            if today_agent_id == "pocke":
                # 포케는 discovery 전용 — 실사진 박힌 단일주제 과학글(카테고리 날짜 로테이션)
                data = await generate_discovery_post(recent_titles=recent_titles, seo_markers=True)
            else:
                data = await generate_blog_post(recent_titles=recent_titles, frequent_tags=frequent_tags, memory=agent_memory, last_agent_title=last_agent_title, recent_posts=recent_posts, agent_recent_tags=agent_recent_tags)
            existing = db.query(BlogPost).filter(BlogPost.slug == data["slug"]).first()
            if existing:
                logger.info(f"블로그 포스트 이미 존재: {data['slug']}")
                return
            costs = data.pop("costs", [])
            post = BlogPost(**attach_embedding(data))
            db.add(post)
            db.flush()
            record_post_costs(db, post.id, post.agent_id, costs)
            summary = data["content"][:300]
            comments = await generate_comments(post.id, post.agent_id, post.title, summary)
            for c in comments:
                db.add(BlogComment(**c))
            db.commit()
            logger.info(f"블로그 포스트+댓글 생성 완료: {data['slug']}")
            from blog_generator import notify_search_engines_bg, revalidate_frontend_bg, AGENT_PERSONAS
            notify_search_engines_bg(f"https://cosmic-hustle.ai.kr/{data['slug']}")
            revalidate_frontend_bg([data["slug"]])

            from web_push import broadcast_new_post
            agent_name = AGENT_PERSONAS.get(data["agent_id"], {}).get("name", data["agent_id"])
            await broadcast_new_post(
                db,
                title=data["title"],
                url=f"https://cosmic-hustle.ai.kr/{data['slug']}",
                agent_name=agent_name,
                thumbnail_url=data.get("thumbnail_url"),
            )
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


async def _user_reply_job():
    """어제 포스트의 미답변 유저 댓글에 작성자 에이전트가 대댓글 (포스트당 최대 2개, 09:10 KST)."""
    from blog_generator import generate_user_reply
    from db.models import BlogComment
    from datetime import timedelta

    db = SessionLocal()
    try:
        now   = datetime.utcnow()
        start = now - timedelta(hours=49)
        end   = now - timedelta(hours=23)
        reply_pushes: list = []

        posts = (
            db.query(BlogPost)
            .filter(BlogPost.published_at >= start, BlogPost.published_at <= end)
            .all()
        )

        for post in posts:
            agent_id = post.agent_id
            if "+" in agent_id:
                continue  # 콜라보 포스트 제외

            # 유저 댓글 중 아직 작성자 에이전트가 대댓글 안 단 것
            user_comments = (
                db.query(BlogComment)
                .filter(
                    BlogComment.post_id == post.id,
                    BlogComment.agent_id.is_(None),
                    BlogComment.parent_id.is_(None),
                )
                .order_by(BlogComment.created_at.asc())
                .all()
            )

            replied_parent_ids = {
                c.parent_id for c in
                db.query(BlogComment)
                .filter(
                    BlogComment.post_id == post.id,
                    BlogComment.agent_id == agent_id,
                    BlogComment.parent_id.isnot(None),
                )
                .all()
            }

            unreplied = [c for c in user_comments if c.id not in replied_parent_ids][:2]
            if not unreplied:
                continue

            for uc in unreplied:
                reply_text = await generate_user_reply(agent_id, post.title, uc.content)
                if not reply_text:
                    continue
                db.add(BlogComment(
                    id=str(uuid.uuid4()),
                    post_id=post.id,
                    parent_id=uc.id,
                    agent_id=agent_id,
                    user_name=None,
                    content=reply_text,
                    created_at=datetime.utcnow(),
                ))
                logger.info(f"유저 댓글 대댓글 생성: {agent_id} → post={post.id}")
                reply_pushes.append((uc.client_id, post.title, post.slug, agent_id, reply_text))

        db.commit()

        # 답글 받은 익명 구독자에게 웹푸시 (커밋 후)
        from web_push import notify_comment_reply
        from blog_generator import AGENT_PERSONAS as _PERSONAS
        for client_id, title, slug, r_agent_id, r_text in reply_pushes:
            agent_name = _PERSONAS.get(r_agent_id, {}).get("name", r_agent_id)
            await notify_comment_reply(
                db, client_id=client_id, post_title=title, post_slug=slug,
                agent_name=agent_name, reply_text=r_text, agent_id=r_agent_id,
            )
    except Exception as e:
        db.rollback()
        logger.error(f"유저 댓글 대댓글 생성 실패: {e}")
    finally:
        db.close()


async def _ga_monthly_job():
    """매월 1일 06:00 KST — GA 데이터 분석 + 메모리 업데이트 + 이메일."""
    from ga_monthly import run_monthly_ga_report
    result = await run_monthly_ga_report()
    if result.get("ok"):
        logger.info("GA 월간 분석 완료")
    else:
        logger.error(f"GA 월간 분석 실패: {result.get('error')}")


async def _daily_blog_report_job():
    """매일 09:20 KST — 버즈가 블로그 성장 지표/트렌드를 Slack으로 보고."""
    from blog_daily_report import build_daily_blog_report

    db = SessionLocal()
    try:
        result = await build_daily_blog_report(db, send_slack=True)
        slack = result.get("slack", {})
        if slack.get("ok"):
            logger.info("버즈 블로그 데일리 Slack 리포트 완료")
        else:
            logger.warning(f"버즈 블로그 데일리 Slack 리포트 미전송: {slack}")
    except Exception as e:
        logger.error(f"버즈 블로그 데일리 리포트 실패: {e}")
    finally:
        db.close()


async def _weekly_prompt_memory_report_job():
    """매주 월요일 09:30 KST — 프롬프트 주입 메모리 현황을 Slack으로 보고."""
    from blog_daily_report import build_weekly_prompt_memory_report

    db = SessionLocal()
    try:
        result = await build_weekly_prompt_memory_report(db, send_slack=True)
        slack = result.get("slack", {})
        if slack.get("ok"):
            logger.info("주간 프롬프트 메모리 Slack 리포트 완료")
        else:
            logger.warning(f"주간 프롬프트 메모리 Slack 리포트 미전송: {slack}")
    except Exception as e:
        logger.error(f"주간 프롬프트 메모리 리포트 실패: {e}")
    finally:
        db.close()


async def _awards_metrics_job():
    """매일 06:30 KST — 이번 달 글별 GSC/GA 지표를 사원상 대시보드용으로 갱신."""
    import awards
    from datetime import date

    db = SessionLocal()
    try:
        period = date.today().strftime("%Y-%m")
        count = awards.collect_post_metrics(db, period)
        logger.info(f"사원상 지표 수집 완료: period={period}, posts={count}")
    except Exception as e:
        logger.error(f"사원상 지표 수집 실패: {e}")
    finally:
        db.close()


async def _awards_judge_job():
    """매일 09:25 KST — 새 글 품질 판정(앵커 대비 페어와이즈). only_missing이라 기존 글은 스킵."""
    import quality

    db = SessionLocal()
    try:
        result = await quality.judge_all(db, only_missing=True)
        logger.info(f"사원상 품질 판정 완료: {result}")
    except Exception as e:
        logger.error(f"사원상 품질 판정 실패: {e}")
    finally:
        db.close()


@app.post("/api/ga/run-monthly")
async def run_ga_monthly_now(
    start_date: str | None = None,
    end_date: str | None = None,
    update_memory: bool = True,
):
    """수동 테스트용 — start_date/end_date 미지정 시 전달 기준."""
    from ga_monthly import run_monthly_ga_report
    result = await run_monthly_ga_report(
        start_date=start_date,
        end_date=end_date,
        update_memory=update_memory,
    )
    return result


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
    scheduler.add_job(
        _user_reply_job,
        CronTrigger(hour=9, minute=10, timezone="Asia/Seoul"),
        id="user_reply",
        replace_existing=True,
    )
    scheduler.add_job(
        _ga_monthly_job,
        CronTrigger(day=1, hour=6, minute=0, timezone="Asia/Seoul"),
        id="ga_monthly",
        replace_existing=True,
    )
    scheduler.add_job(
        _daily_blog_report_job,
        CronTrigger(hour=9, minute=20, timezone="Asia/Seoul"),
        id="daily_blog_report",
        replace_existing=True,
    )
    scheduler.add_job(
        _weekly_prompt_memory_report_job,
        CronTrigger(day_of_week="mon", hour=9, minute=30, timezone="Asia/Seoul"),
        id="weekly_prompt_memory_report",
        replace_existing=True,
    )
    scheduler.add_job(
        _awards_metrics_job,
        CronTrigger(hour=6, minute=30, timezone="Asia/Seoul"),
        id="awards_metrics",
        replace_existing=True,
    )
    scheduler.add_job(
        _awards_judge_job,
        CronTrigger(hour=9, minute=25, timezone="Asia/Seoul"),
        id="awards_judge",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("APScheduler 시작 — 매일 06:30 사원상 지표 수집, 09:00 블로그 자동 생성, 09:05 메모리 업데이트, 09:10 유저 댓글 대댓글, 09:20 버즈 리포트, 09:25 사원상 품질 판정, 매주 월 09:30 메모리 리포트, 매월 1일 06:00 GA 분석")


@app.on_event("shutdown")
async def shutdown():
    scheduler.shutdown(wait=False)
