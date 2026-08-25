"""2026-08-25 품질 게이트로 비공개된 일일 글을 한 번만 정상 발행한다."""
import asyncio

from blog_generator import (
    AGENT_PERSONAS,
    _generate_thumbnail,
    generate_comments,
    generate_scene_prompt_from_content,
    notify_search_engines_bg,
    record_post_costs,
    revalidate_frontend_bg,
)
from db.database import SessionLocal
from db.models import BlogComment, BlogPost
from web_push import broadcast_new_post


SLUG = "discovery-2026-08-25"


async def main() -> None:
    db = SessionLocal()
    try:
        post = db.query(BlogPost).filter(BlogPost.slug == SLUG).first()
        if not post:
            raise RuntimeError(f"복구 대상 없음: {SLUG}")
        if post.published and post.thumbnail_url:
            print(f"이미 복구 완료: {SLUG}")
            return

        costs: list[dict] = []
        if not post.thumbnail_url:
            scene = await generate_scene_prompt_from_content(
                post.agent_id, post.title, post.content or "", sink=costs
            )
            for _ in range(3):
                post.thumbnail_url = await _generate_thumbnail(post.agent_id, scene, sink=costs)
                if post.thumbnail_url:
                    break
            if not post.thumbnail_url:
                raise RuntimeError("썸네일 3회 생성 실패 — 공개하지 않음")

        has_comments = db.query(BlogComment.id).filter(BlogComment.post_id == post.id).first()
        if not has_comments:
            comments = await generate_comments(
                post.id, post.agent_id, post.title, (post.content or "")[:300]
            )
            for comment in comments:
                db.add(BlogComment(**comment))

        record_post_costs(db, post.id, post.agent_id, costs)
        post.published = True
        db.commit()

        url = f"https://cosmic-hustle.ai.kr/{post.slug}"
        notify_search_engines_bg(url)
        revalidate_frontend_bg([post.slug])
        agent_name = AGENT_PERSONAS.get(post.agent_id, {}).get("name", post.agent_id)
        await broadcast_new_post(
            db,
            title=post.title,
            url=url,
            agent_name=agent_name,
            thumbnail_url=post.thumbnail_url,
        )
        print(f"복구 완료: {url}")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())
