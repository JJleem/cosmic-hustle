import hashlib
import os
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address
from db.connection import get_db
from db.models import BlogPost, BlogComment, BlogDailyVisit

limiter = Limiter(key_func=get_remote_address)

# ── 익명 정체성 ────────────────────────────────────────────────────────────────

_PLANETS = [
    "방구행성", "감자행성", "도넛행성", "수박행성", "먼지행성",
    "구름행성", "치즈행성", "고양이행성", "버섯행성", "졸음행성",
    "라면행성", "양말행성", "하품행성", "탕수육행성", "눈물행성",
    "지각행성", "낮잠행성", "번개행성", "얼음행성", "비밀행성",
]
_ADJECTIVES = [
    "출신 백수", "주민", "망명자", "여행자", "행상인",
    "연구원", "탐험가", "길잡이", "은둔자", "밀입국자",
    "관광객", "이주민", "수집가", "도망자", "견습생",
    "식객", "표류자", "감시자", "밀수꾼", "철학자",
]
_ANON_SALT = os.environ.get("ANON_SALT", "cosmic-hustle-2026")
_TOTAL = len(_PLANETS) * len(_ADJECTIVES)  # 400


def _anon_identity(ip: str, post_id: str, db: Session) -> tuple[str, int]:
    """IP + post_id → (이름, 아바타 인덱스). 같은 IP는 같은 포스트에서 항상 동일."""
    ip_hash = hashlib.sha256(f"{ip}{post_id}{_ANON_SALT}".encode()).hexdigest()[:16]

    # 이미 이 포스트에서 댓글 단 적 있으면 기존 값 재사용
    existing = db.query(BlogComment).filter(
        BlogComment.post_id == post_id,
        BlogComment.ip_hash == ip_hash,
    ).first()
    if existing:
        return existing.user_name, existing.anon_avatar

    # 이 포스트에서 이미 사용된 이름 목록
    taken = {
        c.user_name for c in db.query(BlogComment).filter(
            BlogComment.post_id == post_id,
            BlogComment.ip_hash.isnot(None),
        ).all()
    }

    seed = int(hashlib.md5(f"{ip}{post_id}{_ANON_SALT}".encode()).hexdigest(), 16)
    for offset in range(_TOTAL):
        idx = (seed + offset) % _TOTAL
        name = f"{_PLANETS[idx % len(_PLANETS)]} {_ADJECTIVES[(idx // len(_PLANETS)) % len(_ADJECTIVES)]}"
        if name not in taken:
            return name, idx % 50

    return "우주 방랑자", seed % 50
from blog_generator import (
    generate_blog_post, generate_comments,
    generate_scene_prompt_from_content,
    AGENT_PERSONAS, DAY_SCHEDULE,
)

router = APIRouter(prefix="/api/blog", tags=["blog"])


def _comment_counts(db: Session, post_ids: list) -> dict:
    rows = (
        db.query(BlogComment.post_id, func.count(BlogComment.id))
        .filter(BlogComment.post_id.in_(post_ids))
        .group_by(BlogComment.post_id)
        .all()
    )
    return {post_id: count for post_id, count in rows}


def _with_comment_count(post, count: int) -> dict:
    d = {c.name: getattr(post, c.name) for c in post.__table__.columns}
    d["comment_count"] = count
    return d


@router.get("/posts")
def list_posts(page: int = 1, limit: int = 12, published_only: bool = True, db: Session = Depends(get_db)):
    offset = (page - 1) * limit
    q = db.query(BlogPost)
    if published_only:
        q = q.filter(BlogPost.published == True)
    total = q.count()
    posts = q.order_by(BlogPost.published_at.desc()).offset(offset).limit(limit).all()
    counts = _comment_counts(db, [p.id for p in posts])
    return {
        "posts": [_with_comment_count(p, counts.get(p.id, 0)) for p in posts],
        "total": total,
        "page": page,
        "limit": limit,
        "has_next": (page * limit) < total,
    }


@router.get("/posts/{slug}")
def get_post(slug: str, db: Session = Depends(get_db)):
    post = db.query(BlogPost).filter(BlogPost.slug == slug).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    count = db.query(func.count(BlogComment.id)).filter(BlogComment.post_id == post.id).scalar()
    return _with_comment_count(post, count or 0)


@router.post("/generate")
async def trigger_generate(agent_id: str | None = None, force: bool = False, db: Session = Depends(get_db)):
    """수동으로 블로그 포스트 + 댓글 생성 (테스트·관리용). force=true 시 slug suffix 붙여서 중복 우회."""
    data = await generate_blog_post(agent_id)

    existing = db.query(BlogPost).filter(BlogPost.slug == data["slug"]).first()
    if existing:
        if not force:
            raise HTTPException(status_code=409, detail=f"이미 존재: {data['slug']}")
        n = 2
        base_slug = data["slug"]
        while db.query(BlogPost).filter(BlogPost.slug == f"{base_slug}-{n}").first():
            n += 1
        data["slug"] = f"{base_slug}-{n}"

    post = BlogPost(**data)
    db.add(post)
    db.flush()  # post.id 확보

    # AI 댓글 생성
    summary = data["content"][:300]
    comments = await generate_comments(post.id, post.agent_id, post.title, summary)
    for c in comments:
        db.add(BlogComment(**c))

    db.commit()
    db.refresh(post)
    return post


@router.patch("/posts/{post_id}")
def update_post(post_id: str, body: dict, db: Session = Depends(get_db)):
    post = db.query(BlogPost).filter(BlogPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    for field in ("published", "content", "title", "thumbnail_url"):
        if field in body:
            setattr(post, field, body[field])
    db.commit()
    db.refresh(post)
    return post


@router.post("/posts/{slug}/regenerate-thumbnail")
async def regenerate_thumbnail(slug: str, body: dict = None, db: Session = Depends(get_db)):
    """썸네일만 재생성. scene_prompt 없으면 본문 기반으로 자동 생성."""
    from blog_generator import _generate_thumbnail
    post = db.query(BlogPost).filter(BlogPost.slug == slug).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    scene_prompt = (body or {}).get("scene_prompt")
    if not scene_prompt:
        scene_prompt = await generate_scene_prompt_from_content(
            post.agent_id, post.title, post.content or ""
        )

    url = await _generate_thumbnail(post.agent_id, scene_prompt)
    if not url:
        raise HTTPException(status_code=500, detail="썸네일 생성 실패 (FAL_KEY 확인)")

    post.thumbnail_url = url
    db.commit()
    return {"thumbnail_url": url, "scene_prompt": scene_prompt}


# ── 댓글 ──────────────────────────────────────────────────────────────────────

@router.post("/posts/{slug}/view")
def increment_view(slug: str, db: Session = Depends(get_db)):
    post = db.query(BlogPost).filter(BlogPost.slug == slug).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    post.view_count = (post.view_count or 0) + 1

    today = str(date.today())
    visit = db.query(BlogDailyVisit).filter(BlogDailyVisit.date == today).first()
    if visit:
        visit.count += 1
    else:
        db.add(BlogDailyVisit(date=today, count=1))

    db.commit()
    return {"view_count": post.view_count}


@router.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    today = str(date.today())
    today_row = db.query(BlogDailyVisit).filter(BlogDailyVisit.date == today).first()
    total = db.query(func.sum(BlogDailyVisit.count)).scalar() or 0
    return {
        "today": today_row.count if today_row else 0,
        "total": total,
    }


@router.post("/posts/{slug}/like")
def like_post(slug: str, db: Session = Depends(get_db)):
    post = db.query(BlogPost).filter(BlogPost.slug == slug).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    post.likes = (post.likes or 0) + 1
    db.commit()
    return {"likes": post.likes}


@router.post("/posts/{slug}/unlike")
def unlike_post(slug: str, db: Session = Depends(get_db)):
    post = db.query(BlogPost).filter(BlogPost.slug == slug).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    post.likes = max(0, (post.likes or 0) - 1)
    db.commit()
    return {"likes": post.likes}


def _serialize_comment(c) -> dict:
    d = {col.name: getattr(c, col.name) for col in c.__table__.columns}
    if d.get("created_at"):
        d["created_at"] = d["created_at"].isoformat() + "Z"
    return d


@router.get("/posts/{slug}/comments")
def list_comments(slug: str, db: Session = Depends(get_db)):
    post = db.query(BlogPost).filter(BlogPost.slug == slug).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    comments = (
        db.query(BlogComment)
        .filter(BlogComment.post_id == post.id)
        .order_by(BlogComment.created_at)
        .all()
    )
    return [_serialize_comment(c) for c in comments]


@router.post("/posts/{slug}/comments")
@limiter.limit("5/minute")
def add_user_comment(request: Request, slug: str, body: dict, db: Session = Depends(get_db)):
    """실사용자 댓글 추가."""
    post = db.query(BlogPost).filter(BlogPost.slug == slug).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    raw_name = (body.get("user_name") or "").strip()[:50]
    content = (body.get("content") or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="내용을 입력하세요")
    if len(content) > 1000:
        raise HTTPException(status_code=400, detail="댓글은 1000자 이하로 작성해주세요")

    parent_id = body.get("parent_id")
    if parent_id:
        parent = db.query(BlogComment).filter(BlogComment.id == parent_id).first()
        if not parent or parent.post_id != post.id:
            raise HTTPException(status_code=400, detail="잘못된 parent_id")
        if parent.parent_id is not None:
            raise HTTPException(status_code=400, detail="대댓글에는 답글을 달 수 없습니다")

    # 이름 미입력 시 익명 정체성 자동 부여
    ip = request.client.host
    if raw_name:
        user_name, anon_avatar, ip_hash = raw_name, None, None
    else:
        user_name, anon_avatar = _anon_identity(ip, post.id, db)
        ip_hash = hashlib.sha256(f"{ip}{post.id}{_ANON_SALT}".encode()).hexdigest()[:16]

    import uuid
    comment = BlogComment(
        id=str(uuid.uuid4()),
        post_id=post.id,
        parent_id=parent_id,
        agent_id=None,
        user_name=user_name,
        anon_avatar=anon_avatar,
        ip_hash=ip_hash,
        content=content,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return _serialize_comment(comment)


# ── 메타 ──────────────────────────────────────────────────────────────────────

@router.get("/schedule")
def get_schedule():
    """요일별 에이전트 스케줄 반환 (블로그 프론트용)."""
    weekdays = ["월", "화", "수", "목", "금", "토", "일"]
    return [
        {
            "weekday": weekdays[day],
            "agent_id": sched["agent_id"],
            "theme": sched["theme"],
            **{k: v for k, v in AGENT_PERSONAS[sched["agent_id"]].items()},
        }
        for day, sched in DAY_SCHEDULE.items()
    ]


@router.get("/agents")
def list_agents():
    """에이전트 목록 반환 (블로그 프론트용)."""
    return [{"id": aid, **info} for aid, info in AGENT_PERSONAS.items()]
