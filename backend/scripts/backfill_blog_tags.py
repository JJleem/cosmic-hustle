"""기존 blog_posts의 tags 컬럼을 Haiku로 백필하는 스크립트.

실행: backend/ 디렉토리에서
  .venv/bin/python scripts/backfill_blog_tags.py
"""
import asyncio
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import anthropic
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

from db.connection import SessionLocal
from db.models import BlogPost
from anthropic_text import text_of


async def generate_tags(title: str, content: str) -> list[str]:
    client = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    message = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=100,
        messages=[{
            "role": "user",
            "content": (
                f"블로그 제목: {title}\n"
                f"내용 일부: {content[:500]}\n\n"
                "이 글에 어울리는 한국어 태그 3~5개를 쉼표로 구분해서만 출력하세요. "
                "예시: AI, 트렌드, 마케팅\n"
                "설명 없이 태그만 출력."
            ),
        }],
    )
    raw = text_of(message)
    return [t.strip() for t in raw.split(",") if t.strip()]


async def main():
    db = SessionLocal()
    try:
        posts = db.query(BlogPost).filter(BlogPost.tags.is_(None)).all()
        print(f"태그 없는 포스트: {len(posts)}개")

        for post in posts:
            print(f"  처리 중: [{post.agent_id}] {post.title[:40]}...")
            tags = await generate_tags(post.title, post.content)
            post.tags = json.dumps(tags, ensure_ascii=False)
            print(f"    → {tags}")

        db.commit()
        print("완료.")
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())
