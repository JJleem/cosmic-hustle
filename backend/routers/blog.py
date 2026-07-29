import asyncio
import hashlib
import json
import logging
import os
import re
import smtplib
import uuid
from collections import Counter
from datetime import date, datetime, time, timedelta, timezone
from email.mime.text import MIMEText
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import desc, func
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address
from zoneinfo import ZoneInfo
from db.connection import get_db
from db.models import BlogPost, BlogComment, BlogDailyVisit, BlogPostLike, DebateVote, BlogViewLog, QuizResultLog, PushSubscription
from blog_generator import (
    attach_embedding, record_post_costs,
    generate_blog_post, generate_draft_post, generate_comments,
    generate_scene_prompt_from_content,
    generate_intro_post, generate_intro_comments,
    generate_debate_post, generate_debate_comments,
    generate_discovery_post,
    generate_quiz_post, _generate_thumbnail,
    notify_search_engines_bg, revalidate_frontend_bg,
    AGENT_PERSONAS, DAY_SCHEDULE,
)

limiter = Limiter(key_func=get_remote_address)

_ADMIN_KEY = os.environ.get("ADMIN_KEY", "")

def _require_admin(request: Request):
    # 헤더만 허용 — 서버 TLS 미적용이라 쿼리스트링 키는 nginx 로그·브라우저 히스토리에 평문 노출됨
    key = request.headers.get("X-Admin-Key")
    if not _ADMIN_KEY or key != _ADMIN_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")

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


def _client_ip(request: Request) -> str:
    """클라이언트 IP를 단일 규칙으로 추출.

    Vercel은 x-real-ip를 실제 클라이언트 IP로 '덮어쓰며' 클라이언트가 보낸 위조 값을 무시한다
    (프로덕션 실측 확인). 반면 x-forwarded-for / x-vercel-forwarded-for는 클라이언트 값을 그대로
    흘리는 경우가 있어 위조 가능. 따라서 x-real-ip를 우선 신뢰하고, 없을 때만 XFF→직결 IP로 폴백한다.
    (백엔드 :8000을 Vercel 우회로 직접 때리면 모든 헤더 위조 가능 — 그건 방화벽 영역으로 별개)
    """
    real = request.headers.get("x-real-ip")
    if real and real.strip():
        return real.strip()
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        parts = [p.strip() for p in forwarded.split(",") if p.strip()]
        if parts:
            return parts[0]
    return request.client.host if request.client else "unknown"


def _get_ip_hash(request: Request, post_id: str) -> str:
    ip = _client_ip(request)
    return hashlib.sha256(f"{ip}{post_id}{_ANON_SALT}".encode()).hexdigest()[:16]


def _comment_counts(db: Session, post_ids: list) -> dict:
    if not post_ids:
        return {}
    total_rows = (
        db.query(BlogComment.post_id, func.count(BlogComment.id))
        .filter(BlogComment.post_id.in_(post_ids))
        .group_by(BlogComment.post_id)
        .all()
    )
    human_rows = (
        db.query(BlogComment.post_id, func.count(BlogComment.id))
        .filter(
            BlogComment.post_id.in_(post_ids),
            BlogComment.agent_id.is_(None),
        )
        .group_by(BlogComment.post_id)
        .all()
    )
    total = {post_id: int(count) for post_id, count in total_rows}
    human = {post_id: int(count) for post_id, count in human_rows}
    return {
        post_id: {
            "comment_count": count,
            "human_comment_count": human.get(post_id, 0),
            "agent_comment_count": count - human.get(post_id, 0),
        }
        for post_id, count in total.items()
    }


_MD_IMG_RE = re.compile(r"!\[[^\]]*\]\([^)]*\)")   # ![alt](url) 이미지
_MD_LINK_RE = re.compile(r"\[([^\]]*)\]\([^)]*\)")  # [text](url) → text
_TAG_RE = re.compile(r"<[^>]+>")                    # HTML 태그
_WS_RE = re.compile(r"\s+")


def _clean_preview(text: str, limit: int = 120) -> str:
    """마크다운/HTML을 평문 한 줄로 정리하고 limit자로 자른다(말줄임표는 프론트가 처리)."""
    if not text:
        return ""
    t = _MD_IMG_RE.sub("", text)
    t = _MD_LINK_RE.sub(r"\1", t)
    t = _TAG_RE.sub("", t)
    t = t.translate({ord(c): None for c in "*_`~#"})  # 인라인 마크다운 마커 제거
    t = _WS_RE.sub(" ", t).strip()
    return t[:limit]


def _preview_comments(db: Session, post_ids: list) -> dict:
    """글당 에이전트 최상위 댓글 상위 3개(created_at 오름차순)를 한 번의 윈도우 쿼리로 반환.

    {post_id: [{"agent_id", "content"(≤120자 평문)}, ...]} (N+1 없음).
    """
    if not post_ids:
        return {}
    rn = func.row_number().over(
        partition_by=BlogComment.post_id,
        order_by=BlogComment.created_at.asc(),
    ).label("rn")
    sub = (
        db.query(
            BlogComment.post_id.label("post_id"),
            BlogComment.agent_id.label("agent_id"),
            BlogComment.content.label("content"),
            rn,
        )
        .filter(
            BlogComment.post_id.in_(post_ids),
            BlogComment.agent_id.isnot(None),   # 에이전트 댓글만 (사람/익명 제외)
            BlogComment.parent_id.is_(None),    # 최상위 댓글만
        )
        .subquery()
    )
    rows = (
        db.query(sub.c.post_id, sub.c.agent_id, sub.c.content)
        .filter(sub.c.rn <= 3)
        .order_by(sub.c.post_id, sub.c.rn)
        .all()
    )
    result: dict = {}
    for post_id, agent_id, content in rows:
        result.setdefault(post_id, []).append(
            {"agent_id": agent_id, "content": _clean_preview(content)}
        )
    return result


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


def _activity_times(db: Session, post_ids: list) -> dict:
    """각 post별 최신 활동 시간 (댓글/투표/좋아요)."""
    if not post_ids:
        return {post_id: {"last_comment_at": None, "last_vote_at": None, "last_like_at": None} for post_id in post_ids}
    
    # 최신 댓글 시간
    comment_rows = (
        db.query(BlogComment.post_id, func.max(BlogComment.created_at).label('last_comment_at'))
        .filter(BlogComment.post_id.in_(post_ids))
        .group_by(BlogComment.post_id)
        .all()
    )
    
    # 최신 투표 시간
    vote_rows = (
        db.query(DebateVote.post_id, func.max(DebateVote.created_at).label('last_vote_at'))
        .filter(DebateVote.post_id.in_(post_ids))
        .group_by(DebateVote.post_id)
        .all()
    )
    
    # 최신 좋아요 시간
    like_rows = (
        db.query(BlogPostLike.post_id, func.max(BlogPostLike.created_at).label('last_like_at'))
        .filter(BlogPostLike.post_id.in_(post_ids))
        .group_by(BlogPostLike.post_id)
        .all()
    )
    
    result = {post_id: {"last_comment_at": None, "last_vote_at": None, "last_like_at": None} for post_id in post_ids}
    
    for post_id, ts in comment_rows:
        if post_id in result and ts:
            result[post_id]['last_comment_at'] = ts.isoformat()
    
    for post_id, ts in vote_rows:
        if post_id in result and ts:
            result[post_id]['last_vote_at'] = ts.isoformat()
    
    for post_id, ts in like_rows:
        if post_id in result and ts:
            result[post_id]['last_like_at'] = ts.isoformat()
    
    return result


def _with_comment_count(post, counts: dict | None = None, has_agent_reply: bool = False, include_content: bool = True, activity: dict | None = None) -> dict:
    # embedding(768벡터)은 응답에서 제외 — deferred라 접근하지 않으면 로드도 안 됨
    # include_content=False일 때 content도 제외 (리스트 API 최적화용)
    exclude_cols = {"embedding"}
    if not include_content:
        exclude_cols.add("content")
    d = {c.name: getattr(post, c.name) for c in post.__table__.columns if c.name not in exclude_cols}
    d.update(counts or {
        "comment_count": 0,
        "human_comment_count": 0,
        "agent_comment_count": 0,
    })
    d["has_agent_reply"] = has_agent_reply
    if activity:
        d.update(activity)

    # When content is not included in list responses, provide a small excerpt and reading time
    def _get_excerpt_from_post(p, length: int = 300) -> str:
        try:
            content = getattr(p, "content", None)
        except Exception:
            content = None
        if not content:
            return ""
        text = _MD_IMG_RE.sub("", content)
        text = _MD_LINK_RE.sub(r"\1", text)
        text = _TAG_RE.sub("", text)
        text = _WS_RE.sub(" ", text).strip()
        if len(text) > length:
            return text[:length].rstrip() + "..."
        return text

    def _reading_time_from_post(p) -> int:
        try:
            content = getattr(p, "content", None)
        except Exception:
            content = None
        if not content:
            return 0
        words = len(_WS_RE.split(content))
        return max(1, words // 200)

    if not include_content:
        d["excerpt"] = _get_excerpt_from_post(post)
        d["reading_time_minutes"] = _reading_time_from_post(post)

    return d


def _popularity_score(unique_views: int, human_likes: int, human_comments: int) -> int:
    return int(unique_views) + int(human_likes) * 5 + int(human_comments) * 3


def _kst_day_bounds_utc(day: date) -> tuple[datetime, datetime]:
    start_kst = datetime.combine(day, time.min, tzinfo=ZoneInfo("Asia/Seoul"))
    end_kst = start_kst + timedelta(days=1)
    return (
        start_kst.astimezone(timezone.utc).replace(tzinfo=None),
        end_kst.astimezone(timezone.utc).replace(tzinfo=None),
    )


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
    previews = _preview_comments(db, post_ids)
    activities = _activity_times(db, post_ids)
    return {
        "posts": [
            {
                **_with_comment_count(p, counts.get(p.id), p.id in agent_replied, include_content=False, activity=activities.get(p.id)),
                "preview_comments": previews.get(p.id, []),
            }
            for p in posts
        ],
        "total": total,
        "page": page,
        "limit": limit,
        "has_next": (page * limit) < total,
    }


@router.get("/posts/popular")
def list_popular_posts(days: int = 7, limit: int = 3, db: Session = Depends(get_db)):
    """최근 사람 반응 기반 인기글. 에이전트 댓글/투표와 누적 조회수는 점수에서 제외."""
    days = max(1, min(days, 30))
    limit = max(1, min(limit, 20))
    end_day = datetime.now(ZoneInfo("Asia/Seoul")).date()
    start_day = end_day - timedelta(days=days - 1)
    start_utc, _ = _kst_day_bounds_utc(start_day)
    _, end_utc = _kst_day_bounds_utc(end_day)

    view_rows = (
        db.query(BlogViewLog.post_id, func.count(BlogViewLog.ip_hash))
        .filter(BlogViewLog.date >= start_day.isoformat(), BlogViewLog.date <= end_day.isoformat())
        .group_by(BlogViewLog.post_id)
        .all()
    )
    like_rows = (
        db.query(BlogPostLike.post_id, func.count(BlogPostLike.ip_hash))
        .filter(BlogPostLike.created_at >= start_utc, BlogPostLike.created_at < end_utc)
        .group_by(BlogPostLike.post_id)
        .all()
    )
    comment_rows = (
        db.query(BlogComment.post_id, func.count(BlogComment.id))
        .filter(
            BlogComment.agent_id.is_(None),
            BlogComment.created_at >= start_utc,
            BlogComment.created_at < end_utc,
        )
        .group_by(BlogComment.post_id)
        .all()
    )
    views = {post_id: int(count) for post_id, count in view_rows}
    likes = {post_id: int(count) for post_id, count in like_rows}
    comments = {post_id: int(count) for post_id, count in comment_rows}
    post_ids = set(views) | set(likes) | set(comments)
    posts = (
        db.query(BlogPost)
        .filter(BlogPost.id.in_(post_ids), BlogPost.published == True)
        .all()
        if post_ids else []
    )
    all_comment_counts = _comment_counts(db, [post.id for post in posts])
    agent_replied = _agent_reply_set(db, [post.id for post in posts])
    all_activities = _activity_times(db, [post.id for post in posts])
    ranked = []
    for post in posts:
        recent_views = views.get(post.id, 0)
        recent_likes = likes.get(post.id, 0)
        recent_comments = comments.get(post.id, 0)
        ranked.append({
            **_with_comment_count(post, all_comment_counts.get(post.id), post.id in agent_replied, include_content=False, activity=all_activities.get(post.id)),
            "recent_unique_views": recent_views,
            "recent_human_likes": recent_likes,
            "recent_human_comments": recent_comments,
            "popularity_score": _popularity_score(recent_views, recent_likes, recent_comments),
        })
    ranked.sort(
        key=lambda item: (
            item["popularity_score"],
            item["recent_unique_views"],
            item["recent_human_comments"],
            item["recent_human_likes"],
        ),
        reverse=True,
    )
    return {
        "days": days,
        "start_date": start_day.isoformat(),
        "end_date": end_day.isoformat(),
        "posts": ranked[:limit],
    }


@router.get("/compact/sidebar")
def get_sidebar_data(db: Session = Depends(get_db)):
    """홈/사이드바용 컴팩트 데이터: 인기 태그 + 최근 인기글. content 제외."""
    # 1. 최근 90일 글의 태그 분포 (top 10)
    cutoff = datetime.now() - timedelta(days=90)
    tag_rows = (
        db.query(BlogPost.tags)
        .filter(BlogPost.published == True, BlogPost.published_at >= cutoff)
        .all()
    )
    tag_counter: Counter = Counter()
    for (tags_raw,) in tag_rows:
        if tags_raw:
            try:
                for t in json.loads(tags_raw):
                    tag_counter[t] += 1
            except Exception:
                pass
    popular_tags = [{"tag": tag, "count": count} for tag, count in tag_counter.most_common(10)]

    # 2. 최근 인기글 (최근 7일 기준)
    popular = list_popular_posts(days=7, limit=5, db=db)
    
    return {
        "popular_tags": popular_tags,
        "popular_posts": popular.get("posts", []),
    }


def _split_vote_rows(rows: list, my_voter_key: str | None = None) -> dict:
    vote_a, vote_b = 0, 0
    human_vote_a, human_vote_b = 0, 0
    agent_vote_a, agent_vote_b = 0, 0
    voters_a, voters_b = [], []
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
            if is_agent:
                agent_vote_a += 1
            else:
                human_vote_a += 1
            voters_a.append(entry)
        else:
            vote_b += 1
            if is_agent:
                agent_vote_b += 1
            else:
                human_vote_b += 1
            voters_b.append(entry)
        if my_voter_key and v.voter_key == my_voter_key:
            my_vote = v.side
    return {
        "vote_a": vote_a,
        "vote_b": vote_b,
        "human_vote_a": human_vote_a,
        "human_vote_b": human_vote_b,
        "human_vote_count": human_vote_a + human_vote_b,
        "agent_vote_a": agent_vote_a,
        "agent_vote_b": agent_vote_b,
        "agent_vote_count": agent_vote_a + agent_vote_b,
        "voters_a": voters_a,
        "voters_b": voters_b,
        "my_vote": my_vote,
    }


def _vote_result(db: Session, post_id: str, my_voter_key: str | None = None) -> dict:
    rows = db.query(DebateVote).filter(DebateVote.post_id == post_id).all()
    return _split_vote_rows(rows, my_voter_key)


@router.get("/posts/{slug}")
def get_post(slug: str, request: Request, db: Session = Depends(get_db)):
    post = db.query(BlogPost).filter(BlogPost.slug == slug).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    counts = _comment_counts(db, [post.id]).get(post.id)
    has_agent_reply = db.query(BlogComment).filter(
        BlogComment.post_id == post.id,
        BlogComment.agent_id.isnot(None),
        BlogComment.parent_id.isnot(None),
    ).first() is not None
    activities = _activity_times(db, [post.id]).get(post.id)
    result = _with_comment_count(post, counts, has_agent_reply, activity=activities)

    ip_hash = _get_ip_hash(request, post.id)
    result["liked"] = db.query(BlogPostLike).filter(
        BlogPostLike.post_id == post.id,
        BlogPostLike.ip_hash == ip_hash,
    ).first() is not None

    if "+" in (post.agent_id or ""):
        result.update(_vote_result(db, post.id, my_voter_key=ip_hash))

    return result


@router.get("/posts/{slug}/my-identity")
def get_my_identity(slug: str, request: Request, db: Session = Depends(get_db)):
    """IP 기반 익명 정체성 미리 조회 — 댓글을 달지 않아도 내 이름/아바타를 알 수 있음."""
    post = db.query(BlogPost).filter(BlogPost.slug == slug).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    ip = _client_ip(request)
    name, avatar = _anon_identity(ip, post.id, db)
    return {"user_name": name, "anon_avatar": avatar}


@router.get("/posts/{slug}/vote")
def get_vote_status(slug: str, request: Request, db: Session = Depends(get_db)):
    """현재 유저의 투표 상태 조회."""
    post = db.query(BlogPost).filter(BlogPost.slug == slug).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    ip = _client_ip(request)
    ip_hash = hashlib.sha256(f"{ip}{post.id}{_ANON_SALT}".encode()).hexdigest()[:16]
    return _vote_result(db, post.id, my_voter_key=ip_hash)


@router.post("/posts/{slug}/vote")
@limiter.limit("30/minute", key_func=_client_ip)
def vote_debate(slug: str, side: str, request: Request, db: Session = Depends(get_db)):
    """배틀 포스트 투표. side=a or b. 같은 side 재투표 시 취소, 다른 side면 변경."""
    if side not in ("a", "b"):
        raise HTTPException(status_code=400, detail="side는 'a' 또는 'b'여야 합니다")

    post = db.query(BlogPost).filter(BlogPost.slug == slug).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if "+" not in (post.agent_id or ""):
        raise HTTPException(status_code=400, detail="배틀 포스트가 아닙니다")

    ip = _client_ip(request)
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


def _recent_post_context(db: Session, agent_id: str | None = None) -> tuple[list[str], list[str], list[dict], list[str]]:
    """최근 90일 포스트 제목 목록 + 자주 쓴 태그 top10 + 슬러그 목록 + 같은 에이전트 최근 태그 반환."""
    cutoff = datetime.now() - timedelta(days=90)
    recent_rows = (
        db.query(BlogPost.title, BlogPost.trending_topic, BlogPost.tags, BlogPost.slug)
        .filter(BlogPost.published_at >= cutoff)
        .order_by(desc(BlogPost.published_at))
        .limit(60).all()
    )
    recent_titles = [
        f"{title} (핵심 아이디어: {topic})" if topic else title
        for title, topic, _, _ in recent_rows
    ]
    tag_counter: Counter = Counter()
    for _, _, tags_raw, _ in recent_rows:
        if tags_raw:
            try:
                for t in json.loads(tags_raw):
                    tag_counter[t] += 1
            except Exception:
                pass
    # 의미 기반 내부 링크 후보: 최근 90일 전체(≤60)를 topic과 함께 넘기고, 랭킹은 생성 측에서 수행
    recent_posts = [
        {"title": title, "slug": slug, "topic": topic or ""}
        for title, topic, _, slug in recent_rows
    ]

    # 같은 에이전트의 최근 4주 태그 (중복 제거, 순서 유지)
    agent_tags: list[str] = []
    if agent_id:
        agent_cutoff = datetime.now() - timedelta(days=28)
        agent_rows = (
            db.query(BlogPost.tags)
            .filter(BlogPost.agent_id == agent_id, BlogPost.published_at >= agent_cutoff)
            .order_by(desc(BlogPost.published_at))
            .limit(8).all()
        )
        seen: set[str] = set()
        for (tags_raw,) in agent_rows:
            if tags_raw:
                try:
                    for t in json.loads(tags_raw):
                        if t not in seen:
                            seen.add(t)
                            agent_tags.append(t)
                except Exception:
                    pass

    return recent_titles, [tag for tag, _ in tag_counter.most_common(10)], recent_posts, agent_tags


def _agent_past_titles(db: Session, agent_id: str, limit: int = 60) -> list[str]:
    """해당 에이전트가 지금까지 발행한 글 제목(최신순). 90일 창을 쓰는 recent_titles와 달리
    기간 제한이 없다 — 오래된 글 주제가 그대로 재활용되는 것을 막기 위함."""
    rows = (
        db.query(BlogPost.title, BlogPost.trending_topic)
        .filter(BlogPost.agent_id == agent_id, BlogPost.published == True)
        .order_by(desc(BlogPost.published_at))
        .limit(limit).all()
    )
    return [f"{title} (핵심 아이디어: {topic})" if topic else title for title, topic in rows]


@router.post("/generate")
async def trigger_generate(request: Request, agent_id: str | None = None, theme: str | None = None, thumbnail_style: str | None = None, published: bool = True, force: bool = False, seo: bool = False, db: Session = Depends(get_db), _=Depends(_require_admin)):
    """수동으로 블로그 포스트 + 댓글 생성 (테스트·관리용). force=true 시 slug suffix 붙여서 중복 우회.
    seo=True(4B-2 파일럿)면 SEO 마커 프롬프트 적용 + summary/seo_title/seo_description/content_type 저장. 기본 False."""
    from blog_generator import get_today_agent as _get_today_agent
    _effective_agent = agent_id or _get_today_agent()[0]
    recent_titles, frequent_tags, recent_posts, agent_recent_tags = _recent_post_context(db, agent_id=_effective_agent)
    # 수동 경로는 CEO가 결과를 직접 확인하므로 재작성 루프(main.py)는 태우지 않고 프롬프트 가드만 건다.
    data = await generate_blog_post(agent_id, recent_titles=recent_titles, frequent_tags=frequent_tags, theme=theme, thumbnail_style=thumbnail_style, published=published, recent_posts=recent_posts, agent_recent_tags=agent_recent_tags, seo_markers=seo, agent_past_titles=_agent_past_titles(db, _effective_agent))

    existing = db.query(BlogPost).filter(BlogPost.slug == data["slug"]).first()
    if existing:
        if not force:
            raise HTTPException(status_code=409, detail=f"이미 존재: {data['slug']}")
        n = 2
        base_slug = data["slug"]
        while db.query(BlogPost).filter(BlogPost.slug == f"{base_slug}-{n}").first():
            n += 1
        data["slug"] = f"{base_slug}-{n}"

    costs = data.pop("costs", [])
    post = BlogPost(**attach_embedding(data))
    db.add(post)
    db.flush()  # post.id 확보
    record_post_costs(db, post.id, post.agent_id, costs)

    # AI 댓글 생성
    summary = data["content"][:300]
    comments = await generate_comments(post.id, post.agent_id, post.title, summary)
    for c in comments:
        db.add(BlogComment(**c))

    db.commit()
    db.refresh(post)

    if post.published:
        post_url = f"https://cosmic-hustle.ai.kr/{post.slug}"
        notify_search_engines_bg(post_url)
        revalidate_frontend_bg([post.slug])

    return post


class _DraftPostBody(BaseModel):
    content: str
    agent_id: str = "buzz"
    theme: str | None = None
    thumbnail_style: str | None = None
    published: bool = True
    force: bool = False
    content_type: str | None = None  # CONTENT_TYPES 중 하나(검증은 생성기에서). 잘못되면 null 저장


@router.post("/generate-draft")
async def trigger_generate_draft(request: Request, body: _DraftPostBody, db: Session = Depends(get_db), _=Depends(_require_admin)):
    """CEO가 직접 작성한 완성 원고를 기존 파이프라인으로 발행.
    본문 이미지({{IMAGE}})·썸네일({{THUMBNAIL}})·태그({{TAGS}})·임베딩·댓글·검색엔진 통보까지 /generate와 동일."""
    data = await generate_draft_post(
        body.agent_id, body.content,
        theme=body.theme, thumbnail_style=body.thumbnail_style, published=body.published,
        content_type=body.content_type,
    )

    existing = db.query(BlogPost).filter(BlogPost.slug == data["slug"]).first()
    if existing:
        if not body.force:
            raise HTTPException(status_code=409, detail=f"이미 존재: {data['slug']}")
        n = 2
        base_slug = data["slug"]
        while db.query(BlogPost).filter(BlogPost.slug == f"{base_slug}-{n}").first():
            n += 1
        data["slug"] = f"{base_slug}-{n}"

    costs = data.pop("costs", [])
    post = BlogPost(**attach_embedding(data))
    db.add(post)
    db.flush()
    record_post_costs(db, post.id, post.agent_id, costs)

    summary  = data["content"][:300]
    comments = await generate_comments(post.id, post.agent_id, post.title, summary)
    for c in comments:
        db.add(BlogComment(**c))

    db.commit()
    db.refresh(post)

    if post.published:
        notify_search_engines_bg(f"https://cosmic-hustle.ai.kr/{post.slug}")
        revalidate_frontend_bg([post.slug])

    return post


@router.post("/generate-intro")
async def trigger_generate_intro(request: Request, db: Session = Depends(get_db), _=Depends(_require_admin)):
    """버즈+핑 콜라보 Cosmic Hustle 자기소개 포스트 생성."""
    data = await generate_intro_post()

    existing = db.query(BlogPost).filter(BlogPost.slug == data["slug"]).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"이미 존재: {data['slug']}. 삭제 후 재시도하거나 날짜가 바뀌면 다시 생성하세요.")

    costs = data.pop("costs", [])
    post = BlogPost(**attach_embedding(data))
    db.add(post)
    db.flush()
    record_post_costs(db, post.id, post.agent_id, costs)

    summary  = data["content"][:300]
    comments = await generate_intro_comments(post.id, post.title, summary)
    for c in comments:
        db.add(BlogComment(**c))

    db.commit()
    db.refresh(post)
    if post.published:
        notify_search_engines_bg(f"https://cosmic-hustle.ai.kr/{post.slug}")
        revalidate_frontend_bg([post.slug])
    return {"post_id": post.id, "slug": post.slug, "title": post.title, "thumbnail_url": post.thumbnail_url}


@router.post("/generate-debate")
async def trigger_generate_debate(
    request: Request,
    topic: str,
    agent_a: str = "buzz",
    agent_b: str = "fact",
    thumbnail_url: str | None = None,
    db: Session = Depends(get_db),
    _=Depends(_require_admin),
):
    """두 에이전트 배틀 이벤트 포스트 생성. topic 필수, agent_a/b 선택(기본: buzz vs fact)."""
    if agent_a not in AGENT_PERSONAS or agent_b not in AGENT_PERSONAS:
        raise HTTPException(status_code=400, detail="유효하지 않은 agent_id")
    if agent_a == agent_b:
        raise HTTPException(status_code=400, detail="두 에이전트가 달라야 합니다")

    recent_debates = [
        row[0] for row in (
            db.query(BlogPost.title)
            .filter(BlogPost.trending_topic.like("AI 토론 시리즈:%"))
            .order_by(BlogPost.published_at.desc())
            .limit(6)
            .all()
        )
    ]

    data = await generate_debate_post(
        topic,
        agent_a,
        agent_b,
        preset_thumbnail=thumbnail_url,
        recent_debates=recent_debates,
    )

    existing = db.query(BlogPost).filter(BlogPost.slug == data["slug"]).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"이미 존재: {data['slug']}")

    costs = data.pop("costs", [])
    post = BlogPost(**attach_embedding(data))
    db.add(post)
    db.flush()
    record_post_costs(db, post.id, post.agent_id, costs)

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
    if post.published:
        notify_search_engines_bg(f"https://cosmic-hustle.ai.kr/{post.slug}")
        revalidate_frontend_bg([post.slug])
    return {"post_id": post.id, "slug": post.slug, "title": post.title, "thumbnail_url": post.thumbnail_url}


@router.post("/generate-discovery")
async def trigger_generate_discovery(request: Request, topic: str | None = None, seo: bool = False, published: bool = True, db: Session = Depends(get_db), _=Depends(_require_admin)):
    """디스커버리 채널 포스트 생성. topic 없으면 자연/과학 RSS에서 자동 선정.
    seo=True(4B-1 파일럿)면 SEO 마커 프롬프트 적용 + summary/seo_title/seo_description/content_type 저장.
    기본 False — 기존 동작 유지."""
    recent_titles, _, _, _ = _recent_post_context(db)
    data = await generate_discovery_post(topic, recent_titles=recent_titles, seo_markers=seo, published=published)

    slug_base = data["slug"]
    if db.query(BlogPost).filter(BlogPost.slug == slug_base).first():
        n = 2
        while db.query(BlogPost).filter(BlogPost.slug == f"{slug_base}-{n}").first():
            n += 1
        data["slug"] = f"{slug_base}-{n}"

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
    db.refresh(post)
    if post.published:
        notify_search_engines_bg(f"https://cosmic-hustle.ai.kr/{post.slug}")
        revalidate_frontend_bg([post.slug])
    return {"post_id": post.id, "slug": post.slug, "title": post.title, "thumbnail_url": post.thumbnail_url, "agent_id": post.agent_id}


@router.post("/generate-quiz")
async def trigger_generate_quiz(
    slug: str = "which-cosmic-hustle-ai-are-you",
    force: bool = False,
    db: Session = Depends(get_db),
    _=Depends(_require_admin),
):
    """퀴즈 포스트 콘텐츠 + 에이전트 댓글 + 썸네일 생성/갱신.
    force=true: 기존 에이전트 댓글 삭제 후 재생성."""
    post = db.query(BlogPost).filter(BlogPost.slug == slug).first()
    if not post:
        raise HTTPException(status_code=404, detail=f"포스트 없음: {slug}")

    data = await generate_quiz_post(post.title)
    costs = data.pop("costs", [])
    post.content        = data["content"]
    post.tags           = data["tags"]
    post.trending_topic = data["trending_topic"]
    post.agent_id       = "plan"
    post.published      = True

    # force=true면 기존 에이전트 댓글 삭제
    if force:
        db.query(BlogComment).filter(
            BlogComment.post_id == post.id,
            BlogComment.agent_id.isnot(None),
        ).delete()

    has_agent_comments = db.query(BlogComment).filter(
        BlogComment.post_id == post.id,
        BlogComment.agent_id.isnot(None),
    ).first() is not None
    if not has_agent_comments:
        comments = await generate_comments(post.id, "plan", post.title, data["content"][:300])
        for c in comments:
            db.add(BlogComment(**c))

    # 썸네일 생성 (기존 썸네일 없을 때만)
    if not post.thumbnail_url:
        scene_prompt = await generate_scene_prompt_from_content("plan", post.title, data["content"], sink=costs)
        thumbnail_url = await _generate_thumbnail("plan", scene_prompt, sink=costs)
        if thumbnail_url:
            post.thumbnail_url = thumbnail_url

    record_post_costs(db, post.id, "plan", costs)
    db.commit()
    db.refresh(post)
    if post.published:
        notify_search_engines_bg(f"https://cosmic-hustle.ai.kr/{post.slug}")
        revalidate_frontend_bg([post.slug])
    return {
        "slug": post.slug,
        "title": post.title,
        "tags": post.tags,
        "trending_topic": post.trending_topic,
        "published": post.published,
        "thumbnail_url": post.thumbnail_url,
    }


@router.post("/quiz/{slug}/record")
def record_quiz_result(slug: str, body: dict, request: Request, db: Session = Depends(get_db)):
    """퀴즈 결과 기록 (집계용). body: {agent_id: string}"""
    agent_id = (body.get("agent_id") or "").strip()
    if not agent_id:
        raise HTTPException(status_code=400, detail="agent_id 필요")
    db.add(QuizResultLog(id=str(uuid.uuid4()), slug=slug, agent_id=agent_id))
    db.commit()
    return {"ok": True}


@router.get("/quiz/{slug}/stats")
def get_quiz_stats(slug: str, db: Session = Depends(get_db)):
    """퀴즈 결과 집계 반환. {total, counts: {agent_id: count}}"""
    rows = db.query(QuizResultLog.agent_id, func.count().label("cnt")).filter(
        QuizResultLog.slug == slug
    ).group_by(QuizResultLog.agent_id).all()
    counts = {r.agent_id: r.cnt for r in rows}
    total  = sum(counts.values())
    return {"total": total, "counts": counts}


@router.patch("/posts/{post_id}")
def update_post(request: Request, post_id: str, body: dict, db: Session = Depends(get_db), _=Depends(_require_admin)):
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
def delete_post(request: Request, post_id: str, db: Session = Depends(get_db), _=Depends(_require_admin)):
    post = db.query(BlogPost).filter(BlogPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    db.query(BlogComment).filter(BlogComment.post_id == post_id).delete()
    db.delete(post)
    db.commit()
    return {"deleted": post_id}


@router.post("/posts/{slug}/regenerate-thumbnail")
async def regenerate_thumbnail(request: Request, slug: str, body: dict = None, db: Session = Depends(get_db), _=Depends(_require_admin)):
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
    if post.published:
        revalidate_frontend_bg([post.slug])
    return {"thumbnail_url": url, "scene_prompt": scene_prompt}


# ── 댓글 ──────────────────────────────────────────────────────────────────────

@router.post("/posts/{slug}/view")
def increment_view(slug: str, request: Request, db: Session = Depends(get_db)):
    post = db.query(BlogPost).filter(BlogPost.slug == slug).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    ip = _client_ip(request)
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


@router.get("/posts/{slug}/related")
def get_related_posts(slug: str, limit: int = 6, db: Session = Depends(get_db)):
    """이 글과 의미적으로 가까운 발행글 top-K (pgvector 코사인). 임베딩 없으면 빈 목록."""
    post = db.query(BlogPost).filter(BlogPost.slug == slug).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if post.embedding is None:
        return {"posts": []}
    limit = max(1, min(limit, 20))
    rows = (
        db.query(BlogPost)
        .filter(
            BlogPost.published == True,
            BlogPost.id != post.id,
            BlogPost.embedding.isnot(None),
        )
        .order_by(BlogPost.embedding.cosine_distance(post.embedding))
        .limit(limit)
        .all()
    )
    post_ids = [p.id for p in rows]
    counts = _comment_counts(db, post_ids)
    agent_replied = _agent_reply_set(db, post_ids)
    activities = _activity_times(db, post_ids)
    return {"posts": [_with_comment_count(p, counts.get(p.id), p.id in agent_replied, include_content=False, activity=activities.get(p.id)) for p in rows]}


@router.post("/_backfill-embeddings")
def backfill_embeddings(request: Request, db: Session = Depends(get_db), _=Depends(_require_admin)):
    """embedding이 비어있는 발행글을 일괄 임베딩(Option A 도입 시 기존글 백필용, 1회성)."""
    from db.embedder import embed
    posts = db.query(BlogPost).filter(BlogPost.embedding.is_(None)).all()
    done = 0
    for p in posts:
        text = "\n".join(str(t) for t in (p.title, p.trending_topic, p.content) if t)
        if not text:
            continue
        p.embedding = embed(text)
        done += 1
    db.commit()
    remaining = db.query(BlogPost).filter(BlogPost.embedding.is_(None)).count()
    return {"backfilled": done, "remaining_null": remaining}


@router.post("/posts/{slug}/like")
@limiter.limit("30/minute", key_func=_client_ip)
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
@limiter.limit("30/minute", key_func=_client_ip)
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

    # 이름 미입력 시 익명 정체성 자동 부여 (Vercel 프록시 통과 시 XFF에 실제 클라이언트 IP)
    ip = _client_ip(request)
    if raw_name:
        user_name, anon_avatar, ip_hash = raw_name, None, None
    else:
        user_name, anon_avatar = _anon_identity(ip, post.id, db)
        ip_hash = hashlib.sha256(f"{ip}{post.id}{_ANON_SALT}".encode()).hexdigest()[:16]

    client_id = (body.get("client_id") or "").strip()[:64] or None
    comment = BlogComment(
        id=str(uuid.uuid4()),
        post_id=post.id,
        parent_id=parent_id,
        agent_id=None,
        user_name=user_name,
        anon_avatar=anon_avatar,
        ip_hash=ip_hash,
        client_id=client_id,
        content=content,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    _notify_comment(post.title, post.slug, user_name, content)
    return _serialize_comment(comment)


@router.patch("/comments/{comment_id}")
def update_comment(request: Request, comment_id: str, body: dict, db: Session = Depends(get_db), _=Depends(_require_admin)):
    comment = db.query(BlogComment).filter(BlogComment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if "content" in body:
        comment.content = body["content"]
    db.commit()
    db.refresh(comment)
    return comment


@router.delete("/comments/{comment_id}")
def delete_comment(request: Request, comment_id: str, db: Session = Depends(get_db), _=Depends(_require_admin)):
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


# ── 웹푸시 구독 ──────────────────────────────────────────────────────────────

@router.get("/push/vapid-public-key")
def push_vapid_public_key():
    """프론트가 PushManager.subscribe에 쓸 VAPID 공개키. 미설정 시 빈 문자열."""
    return {"key": os.environ.get("VAPID_PUBLIC_KEY", "")}


@router.post("/push/subscribe")
@limiter.limit("10/minute")
def push_subscribe(request: Request, body: dict, db: Session = Depends(get_db)):
    """웹푸시 구독 등록(업서트). body: {subscription:{endpoint,keys:{p256dh,auth}}, client_id}."""
    sub = body.get("subscription") or {}
    endpoint = sub.get("endpoint")
    keys = sub.get("keys") or {}
    p256dh, auth = keys.get("p256dh"), keys.get("auth")
    if not (endpoint and p256dh and auth):
        raise HTTPException(status_code=400, detail="유효하지 않은 구독 정보")

    client_id = (body.get("client_id") or "").strip()[:64] or None
    row = db.query(PushSubscription).filter(PushSubscription.endpoint == endpoint).first()
    if row:
        row.p256dh, row.auth, row.client_id = p256dh, auth, client_id
    else:
        db.add(PushSubscription(
            id=str(uuid.uuid4()), endpoint=endpoint,
            p256dh=p256dh, auth=auth, client_id=client_id,
        ))
    db.commit()
    return {"ok": True}


@router.post("/push/unsubscribe")
def push_unsubscribe(body: dict, db: Session = Depends(get_db)):
    """구독 해지 — endpoint 기준 삭제."""
    endpoint = body.get("endpoint")
    if not endpoint:
        raise HTTPException(status_code=400, detail="endpoint 필요")
    db.query(PushSubscription).filter(PushSubscription.endpoint == endpoint).delete()
    db.commit()
    return {"ok": True}
