"""
기존 fal.media 이미지 URL → 로컬 static/blog/ 다운로드 + DB 업데이트.
실행: cd backend && .venv/bin/python scripts/migrate_images.py
"""
import os
import re
import asyncio
import httpx
import uuid
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

STATIC_DIR = Path(__file__).parent.parent / "static" / "blog"
BACKEND_URL = os.environ.get("BACKEND_URL", "http://3.36.239.214:8000")
FAL_PATTERN = re.compile(r"https://[a-z0-9.]+\.fal\.media/[^\s)\"']+")


async def download(session: httpx.AsyncClient, fal_url: str) -> str | None:
    try:
        ext = fal_url.split(".")[-1].split("?")[0]
        if ext not in ("jpg", "jpeg", "png", "webp"):
            ext = "jpg"
        filename = f"{uuid.uuid4().hex}.{ext}"
        resp = await session.get(fal_url, timeout=60)
        resp.raise_for_status()
        (STATIC_DIR / filename).write_bytes(resp.content)
        return f"{BACKEND_URL}/static/blog/{filename}"
    except Exception as e:
        print(f"  ✗ 다운로드 실패: {fal_url[:60]}... ({e})")
        return None


async def main():
    STATIC_DIR.mkdir(parents=True, exist_ok=True)

    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent))
    from db.connection import SessionLocal
    from db.models import BlogPost

    db = SessionLocal()
    posts = db.query(BlogPost).all()
    print(f"포스트 {len(posts)}개 처리 시작\n")

    async with httpx.AsyncClient() as session:
        for post in posts:
            print(f"[{post.slug}]")
            changed = False

            # 썸네일
            if post.thumbnail_url and "fal.media" in post.thumbnail_url:
                local = await download(session, post.thumbnail_url)
                if local:
                    print(f"  썸네일: {post.thumbnail_url[:50]}... → {local}")
                    post.thumbnail_url = local
                    changed = True

            # 본문 이미지
            if post.content:
                matches = FAL_PATTERN.findall(post.content)
                for fal_url in matches:
                    local = await download(session, fal_url)
                    if local:
                        print(f"  본문: {fal_url[:50]}... → {local}")
                        post.content = post.content.replace(fal_url, local)
                        changed = True

            if changed:
                db.add(post)

    db.commit()
    db.close()

    total = len(list(STATIC_DIR.glob("*.jpg"))) + len(list(STATIC_DIR.glob("*.png")))
    print(f"\n완료: {total}개 이미지 저장됨 → {STATIC_DIR}")


if __name__ == "__main__":
    asyncio.run(main())
