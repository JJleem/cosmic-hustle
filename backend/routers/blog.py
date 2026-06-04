import hashlib
import json
import logging
import os
import smtplib
import uuid
from collections import Counter
from datetime import date, datetime, timedelta
from email.mime.text import MIMEText
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import desc, func
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address
from db.connection import get_db
from db.models import BlogPost, BlogComment, BlogDailyVisit, BlogPostLike, DebateVote, BlogViewLog
from blog_generator import (
    generate_blog_post, generate_comments,
    generate_scene_prompt_from_content,
    generate_intro_post, generate_intro_comments,
    generate_debate_post, generate_debate_comments,
    generate_discovery_post,
    AGENT_PERSONAS, DAY_SCHEDULE,
)

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
        row[0] for row in db.query(BlogComment.user_name).filter(
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


router = APIRouter(prefix="/api/blog", tags=["blog"])


def _get_ip_hash(request: Request, post_id: str) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    ip = forwarded.split(",")[0].strip() if forwarded else request.client.host
    return hashlib.sha256(f"{ip}{post_id}{_ANON_SALT}".encode()).hexdigest()[:16]


def _comment_counts(db: Session, post_ids: list) -> dict:
    rows = (
        db.query(BlogComment.post_id, func.count(BlogComment.id))
        .filter(BlogComment.post_id.in_(post_ids))
        .group_by(BlogComment.post_id)
        .all()
    )
    return {post_id: count for post_id, count in rows}


def _agent_reply_set(db: Session, post_ids: list) -> set:
    """에이전트가 유저 댓글에 대댓글 단 post_id 집합."""
    rows = (
        db.query(BlogComment.post_id)
        .filter(
            BlogComment.post_id.in_(post_ids),
            BlogComment.agent_id.isnot(None),
            BlogComment.parent_id.isnot(None),
        )
        .distinct()
        .all()
    )
    return {row[0] for row in rows}


def _with_comment_count(post, count: int, has_agent_reply: bool = False) -> dict:
    d = {c.name: getattr(post, c.name) for c in post.__table__.columns}
    d["comment_count"] = count
    d["has_agent_reply"] = has_agent_reply
    return d


@router.get("/posts")
def list_posts(page: int = 1, limit: int = 12, published_only: bool = True, db: Session = Depends(get_db)):
    offset = (page - 1) * limit
    q = db.query(BlogPost)
    if published_only:
        q = q.filter(BlogPost.published == True)
    total = q.count()
    posts = q.order_by(BlogPost.published_at.desc()).offset(offset).limit(limit).all()
    post_ids = [p.id for p in posts]
    counts = _comment_counts(db, post_ids)
    agent_replied = _agent_reply_set(db, post_ids)
    return {
        "posts": [_with_comment_count(p, counts.get(p.id, 0), p.id in agent_replied) for p in posts],
        "total": total,
        "page": page,
        "limit": limit,
        "has_next": (page * limit) < total,
    }


def _vote_result(db: Session, post_id: str, my_voter_key: str | None = None) -> dict:
    rows = db.query(DebateVote).filter(DebateVote.post_id == post_id).all()
    vote_a, vote_b, voters_a, voters_b = 0, 0, [], []
    my_vote = None
    for v in rows:
        is_agent = v.voter_key.startswith("agent:")
        entry = {
            "type": "agent" if is_agent else "user",
            "agent_id": v.voter_key[6:] if is_agent else None,
            "display_name": v.display_name,
            "anon_avatar": v.anon_avatar,
        }
        if v.side == "a":
            vote_a += 1
            voters_a.append(entry)
        else:
            vote_b += 1
            voters_b.append(entry)
        if my_voter_key and v.voter_key == my_voter_key:
            my_vote = v.side
    return {"vote_a": vote_a, "vote_b": vote_b,
            "voters_a": voters_a, "voters_b": voters_b, "my_vote": my_vote}


@router.get("/posts/{slug}")
def get_post(slug: str, request: Request, db: Session = Depends(get_db)):
    post = db.query(BlogPost).filter(BlogPost.slug == slug).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    count = db.query(func.count(BlogComment.id)).filter(BlogComment.post_id == post.id).scalar()
    has_agent_reply = db.query(BlogComment).filter(
        BlogComment.post_id == post.id,
        BlogComment.agent_id.isnot(None),
        BlogComment.parent_id.isnot(None),
    ).first() is not None
    result = _with_comment_count(post, count or 0, has_agent_reply)

    ip_hash = _get_ip_hash(request, post.id)
    result["liked"] = db.query(BlogPostLike).filter(
        BlogPostLike.post_id == post.id,
        BlogPostLike.ip_hash == ip_hash,
    ).first() is not None

    if "+" in (post.agent_id or ""):
        result.update(_vote_result(db, post.id, my_voter_key=ip_hash))

    return result


@router.get("/posts/{slug}/vote")
def get_vote_status(slug: str, request: Request, db: Session = Depends(get_db)):
    """현재 유저의 투표 상태 조회."""
    post = db.query(BlogPost).filter(BlogPost.slug == slug).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    ip = request.headers.get("X-Forwarded-For", request.client.host).split(",")[0].strip()
    ip_hash = hashlib.sha256(f"{ip}{post.id}{_ANON_SALT}".encode()).hexdigest()[:16]
    return _vote_result(db, post.id, my_voter_key=ip_hash)


@router.post("/posts/{slug}/vote")
def vote_debate(slug: str, side: str, request: Request, db: Session = Depends(get_db)):
    """배틀 포스트 투표. side=a or b. 같은 side 재투표 시 취소, 다른 side면 변경."""
    if side not in ("a", "b"):
        raise HTTPException(status_code=400, detail="side는 'a' 또는 'b'여야 합니다")

    post = db.query(BlogPost).filter(BlogPost.slug == slug).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if "+" not in (post.agent_id or ""):
        raise HTTPException(status_code=400, detail="배틀 포스트가 아닙니다")

    ip = request.headers.get("X-Forwarded-For", request.client.host).split(",")[0].strip()
    ip_hash = hashlib.sha256(f"{ip}{post.id}{_ANON_SALT}".encode()).hexdigest()[:16]

    existing = db.query(DebateVote).filter(
        DebateVote.post_id == post.id,
        DebateVote.voter_key == ip_hash,
    ).first()

    if existing:
        if existing.side == side:
            db.delete(existing)
        else:
            existing.side = side
    else:
        # 유저 우주 정체성 조회 (댓글과 동일 로직)
        anon_name, anon_avatar = _anon_identity(ip, post.id, db)
        db.add(DebateVote(
            id=str(uuid.uuid4()),
            post_id=post.id,
            voter_key=ip_hash,
            side=side,
            display_name=anon_name,
            anon_avatar=anon_avatar,
        ))

    db.commit()
    return _vote_result(db, post.id, my_voter_key=ip_hash)


def _recent_post_context(db: Session) -> tuple[list[str], list[str]]:
    """최근 90일 포스트 제목 목록 + 자주 쓴 태그 top10 반환. main.py _daily_blog_job과 공유."""
    cutoff = datetime.now() - timedelta(days=90)
    recent_rows = (
        db.query(BlogPost.title, BlogPost.trending_topic, BlogPost.tags)
        .filter(BlogPost.published_at >= cutoff)
        .order_by(desc(BlogPost.published_at))
        .limit(60).all()
    )
    recent_titles = [
        f"{title} (핵심 아이디어: {topic})" if topic else title
        for title, topic, _ in recent_rows
    ]
    tag_counter: Counter = Counter()
    for _, _, tags_raw in recent_rows:
        if tags_raw:
            try:
                for t in json.loads(tags_raw):
                    tag_counter[t] += 1
            except Exception:
                pass
    return recent_titles, [tag for tag, _ in tag_counter.most_common(10)]


@router.post("/generate")
async def trigger_generate(agent_id: str | None = None, force: bool = False, db: Session = Depends(get_db)):
    """수동으로 블로그 포스트 + 댓글 생성 (테스트·관리용). force=true 시 slug suffix 붙여서 중복 우회."""
    recent_titles, frequent_tags = _recent_post_context(db)
    data = await generate_blog_post(agent_id, recent_titles=recent_titles, frequent_tags=frequent_tags)

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


@router.post("/generate-intro")
async def trigger_generate_intro(db: Session = Depends(get_db)):
    """버즈+핑 콜라보 Cosmic Hustle 자기소개 포스트 생성."""
    data = await generate_intro_post()

    existing = db.query(BlogPost).filter(BlogPost.slug == data["slug"]).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"이미 존재: {data['slug']}. 삭제 후 재시도하거나 날짜가 바뀌면 다시 생성하세요.")

    post = BlogPost(**data)
    db.add(post)
    db.flush()

    summary  = data["content"][:300]
    comments = await generate_intro_comments(post.id, post.title, summary)
    for c in comments:
        db.add(BlogComment(**c))

    db.commit()
    db.refresh(post)
    return {"post_id": post.id, "slug": post.slug, "title": post.title, "thumbnail_url": post.thumbnail_url}


@router.post("/generate-debate")
async def trigger_generate_debate(
    topic: str,
    agent_a: str = "over",
    agent_b: str = "fact",
    thumbnail_url: str | None = None,
    db: Session = Depends(get_db),
):
    """두 에이전트 배틀 이벤트 포스트 생성. topic 필수, agent_a/b 선택(기본: buzz vs fact)."""
    if agent_a not in AGENT_PERSONAS or agent_b not in AGENT_PERSONAS:
        raise HTTPException(status_code=400, detail="유효하지 않은 agent_id")
    if agent_a == agent_b:
        raise HTTPException(status_code=400, detail="두 에이전트가 달라야 합니다")

    data = await generate_debate_post(topic, agent_a, agent_b, preset_thumbnail=thumbnail_url)

    existing = db.query(BlogPost).filter(BlogPost.slug == data["slug"]).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"이미 존재: {data['slug']}")

    post = BlogPost(**data)
    db.add(post)
    db.flush()

    summary = data["content"][:300]
    result  = await generate_debate_comments(post.id, post.title, summary, agent_a, agent_b)
    for c in result["comments"]:
        db.add(BlogComment(**c))
    for v in result["agent_votes"]:
        db.add(DebateVote(
            id=str(uuid.uuid4()),
            post_id=post.id,
            voter_key=v["voter_key"],
            side=v["side"],
            display_name=v["display_name"],
            anon_avatar=None,
        ))

    db.commit()
    db.refresh(post)
    return {"post_id": post.id, "slug": post.slug, "title": post.title, "thumbnail_url": post.thumbnail_url}


@router.post("/generate-discovery")
async def trigger_generate_discovery(topic: str | None = None, db: Session = Depends(get_db)):
    """디스커버리 채널 포스트 생성. topic 없으면 자연/과학 RSS에서 자동 선정."""
    data = await generate_discovery_post(topic)

    slug_base = data["slug"]
    if db.query(BlogPost).filter(BlogPost.slug == slug_base).first():
        n = 2
        while db.query(BlogPost).filter(BlogPost.slug == f"{slug_base}-{n}").first():
            n += 1
        data["slug"] = f"{slug_base}-{n}"

    post = BlogPost(**data)
    db.add(post)
    db.flush()

    summary = data["content"][:300]
    comments = await generate_comments(post.id, post.agent_id, post.title, summary)
    for c in comments:
        db.add(BlogComment(**c))

    db.commit()
    db.refresh(post)
    return {"post_id": post.id, "slug": post.slug, "title": post.title, "thumbnail_url": post.thumbnail_url, "agent_id": post.agent_id}


@router.patch("/posts/{post_id}")
def update_post(post_id: str, body: dict, db: Session = Depends(get_db)):
    post = db.query(BlogPost).filter(BlogPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    for field in ("published", "content", "title", "thumbnail_url", "slug", "published_at", "created_at", "trending_topic", "tags"):
        if field in body:
            val = body[field]
            if field in ("published_at", "created_at") and isinstance(val, str):
                try:
                    val = datetime.fromisoformat(val)
                except ValueError:
                    raise HTTPException(status_code=400, detail=f"Invalid datetime format for {field}")
            setattr(post, field, val)
    db.commit()
    db.refresh(post)
    return post


@router.delete("/posts/{post_id}")
def delete_post(post_id: str, db: Session = Depends(get_db)):
    post = db.query(BlogPost).filter(BlogPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    db.query(BlogComment).filter(BlogComment.post_id == post_id).delete()
    db.delete(post)
    db.commit()
    return {"deleted": post_id}


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
def increment_view(slug: str, request: Request, db: Session = Depends(get_db)):
    post = db.query(BlogPost).filter(BlogPost.slug == slug).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    ip = request.headers.get("X-Forwarded-For", request.client.host).split(",")[0].strip()
    ip_hash = hashlib.sha256(f"{ip}{post.id}{_ANON_SALT}".encode()).hexdigest()[:16]
    today = str(date.today())

    already_viewed = db.query(BlogViewLog).filter(
        BlogViewLog.post_id == post.id,
        BlogViewLog.ip_hash == ip_hash,
        BlogViewLog.date == today,
    ).first()

    if not already_viewed:
        first_visit_today = not db.query(BlogViewLog).filter(
            BlogViewLog.ip_hash == ip_hash,
            BlogViewLog.date == today,
        ).first()

        db.add(BlogViewLog(post_id=post.id, ip_hash=ip_hash, date=today))
        db.query(BlogPost).filter(BlogPost.id == post.id).update(
            {BlogPost.view_count: BlogPost.view_count + 1}
        )

        if first_visit_today:
            updated = db.query(BlogDailyVisit).filter(BlogDailyVisit.date == today).update(
                {BlogDailyVisit.count: BlogDailyVisit.count + 1}
            )
            if not updated:
                db.add(BlogDailyVisit(date=today, count=1))

        db.commit()

    db.refresh(post)
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
def like_post(slug: str, request: Request, db: Session = Depends(get_db)):
    post = db.query(BlogPost).filter(BlogPost.slug == slug).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    ip_hash = _get_ip_hash(request, post.id)
    already = db.query(BlogPostLike).filter(
        BlogPostLike.post_id == post.id,
        BlogPostLike.ip_hash == ip_hash,
    ).first()
    if already:
        db.refresh(post)
        return {"likes": post.likes, "liked": True}

    db.add(BlogPostLike(post_id=post.id, ip_hash=ip_hash))
    db.query(BlogPost).filter(BlogPost.id == post.id).update(
        {BlogPost.likes: BlogPost.likes + 1}
    )
    db.commit()
    db.refresh(post)
    return {"likes": post.likes, "liked": True}


@router.post("/posts/{slug}/unlike")
def unlike_post(slug: str, request: Request, db: Session = Depends(get_db)):
    post = db.query(BlogPost).filter(BlogPost.slug == slug).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    ip_hash = _get_ip_hash(request, post.id)
    existing = db.query(BlogPostLike).filter(
        BlogPostLike.post_id == post.id,
        BlogPostLike.ip_hash == ip_hash,
    ).first()
    if not existing:
        db.refresh(post)
        return {"likes": post.likes, "liked": False}

    db.delete(existing)
    db.query(BlogPost).filter(BlogPost.id == post.id).update(
        {BlogPost.likes: BlogPost.likes - 1}
    )
    db.commit()
    db.refresh(post)
    return {"likes": post.likes, "liked": False}


def _serialize_comment(c) -> dict:
    d = {col.name: getattr(c, col.name) for col in c.__table__.columns}
    if d.get("created_at"):
        d["created_at"] = d["created_at"].isoformat() + "Z"
    return d


@router.get("/posts/{slug}/comments")
def list_comments(slug: str, page: int = 1, limit: int = 50, db: Session = Depends(get_db)):
    post = db.query(BlogPost).filter(BlogPost.slug == slug).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    offset = (page - 1) * limit
    total = db.query(func.count(BlogComment.id)).filter(BlogComment.post_id == post.id).scalar()
    comments = (
        db.query(BlogComment)
        .filter(BlogComment.post_id == post.id)
        .order_by(BlogComment.created_at)
        .offset(offset)
        .limit(limit)
        .all()
    )
    return {
        "comments": [_serialize_comment(c) for c in comments],
        "total": total,
        "page": page,
        "limit": limit,
        "has_next": offset + limit < total,
    }


def _notify_comment(post_title: str, post_slug: str, user_name: str, content: str):
    smtp_host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_password = os.environ.get("SMTP_PASSWORD", "")
    to_email = os.environ.get("REPORT_EMAIL", smtp_user)
    if not smtp_user or not smtp_password:
        return
    try:
        post_url = f"https://cosmic-hustle.ai.kr/{post_slug}"
        body_text = f"포스트: {post_title}\n작성자: {user_name}\n\n{content}\n\n→ {post_url}"
        msg = MIMEText(body_text, "plain", "utf-8")
        msg["Subject"] = f"[코스믹허슬] 새 댓글 — {post_title}"
        msg["From"] = smtp_user
        msg["To"] = to_email
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.sendmail(smtp_user, to_email, msg.as_string())
    except Exception:
        logging.getLogger(__name__).warning("댓글 알림 이메일 발송 실패", exc_info=True)


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
    # Vercel 프록시 통과 시 X-Forwarded-For에 실제 클라이언트 IP가 담김
    forwarded_for = request.headers.get("x-forwarded-for")
    ip = forwarded_for.split(",")[0].strip() if forwarded_for else request.client.host
    if raw_name:
        user_name, anon_avatar, ip_hash = raw_name, None, None
    else:
        user_name, anon_avatar = _anon_identity(ip, post.id, db)
        ip_hash = hashlib.sha256(f"{ip}{post.id}{_ANON_SALT}".encode()).hexdigest()[:16]

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
    _notify_comment(post.title, post.slug, user_name, content)
    return _serialize_comment(comment)


@router.patch("/comments/{comment_id}")
def update_comment(comment_id: str, body: dict, db: Session = Depends(get_db)):
    comment = db.query(BlogComment).filter(BlogComment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if "content" in body:
        comment.content = body["content"]
    db.commit()
    db.refresh(comment)
    return comment


@router.delete("/comments/{comment_id}")
def delete_comment(comment_id: str, db: Session = Depends(get_db)):
    comment = db.query(BlogComment).filter(BlogComment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    db.delete(comment)
    db.commit()
    return {"deleted": comment_id}


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
