from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from db.connection import get_db
from db.models import BlogPost, BlogComment
from blog_generator import (
    generate_blog_post, generate_comments,
    generate_scene_prompt_from_content,
    AGENT_PERSONAS, DAY_SCHEDULE,
)

router = APIRouter(prefix="/api/blog", tags=["blog"])


@router.get("/posts")
def list_posts(published_only: bool = True, db: Session = Depends(get_db)):
    q = db.query(BlogPost)
    if published_only:
        q = q.filter(BlogPost.published == True)
    return q.order_by(BlogPost.published_at.desc()).all()


@router.get("/posts/{slug}")
def get_post(slug: str, db: Session = Depends(get_db)):
    post = db.query(BlogPost).filter(BlogPost.slug == slug).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    return post


@router.post("/generate")
async def trigger_generate(agent_id: str | None = None, db: Session = Depends(get_db)):
    """수동으로 블로그 포스트 + 댓글 생성 (테스트·관리용)."""
    data = await generate_blog_post(agent_id)

    existing = db.query(BlogPost).filter(BlogPost.slug == data["slug"]).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"이미 존재: {data['slug']}")

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
    db.commit()
    return {"view_count": post.view_count}


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
    return comments


@router.post("/posts/{slug}/comments")
def add_user_comment(slug: str, body: dict, db: Session = Depends(get_db)):
    """실사용자 댓글 추가."""
    post = db.query(BlogPost).filter(BlogPost.slug == slug).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    user_name = (body.get("user_name") or "익명").strip()[:50]
    content = (body.get("content") or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="내용을 입력하세요")

    parent_id = body.get("parent_id")
    if parent_id:
        parent = db.query(BlogComment).filter(BlogComment.id == parent_id).first()
        if not parent or parent.post_id != post.id:
            raise HTTPException(status_code=400, detail="잘못된 parent_id")

    import uuid
    comment = BlogComment(
        id=str(uuid.uuid4()),
        post_id=post.id,
        parent_id=parent_id,
        agent_id=None,
        user_name=user_name,
        content=content,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


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
