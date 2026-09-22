"""Wiki search and upsert helpers.

임베딩 스택 제거 이후 검색은 키워드(ILIKE) 매칭이다. wiki_entries.embedding 컬럼과
기존 21건의 벡터는 /api/wiki/graph 가 계속 쓰므로 건드리지 않는다 — 다만 이후
upsert 되는 항목은 벡터가 갱신되지 않아 그래프에서 점점 낡는다."""
import uuid
from pathlib import Path
from sqlalchemy import or_
from .connection import SessionLocal
from .models import WikiEntry

WIKI_CONCEPTS_DIR = Path(__file__).parent.parent.parent / "wiki-llm" / "wiki" / "concepts"


def semantic_search(query: str, top_k: int = 3) -> list[dict]:
    """query 키워드가 제목/본문에 들어간 wiki 항목 top_k. 이름은 호출부 호환을 위해 유지.
    의미기반 검색은 폐지됐고 dist 는 항상 0.0 을 반환한다."""
    db = SessionLocal()
    try:
        like = f"%{query.strip()}%"
        rows = (
            db.query(WikiEntry)
            .filter(or_(WikiEntry.title.ilike(like), WikiEntry.content.ilike(like)))
            .order_by(WikiEntry.title)
            .limit(top_k)
            .all()
        )
        return [
            {"filename": r.filename, "title": r.title, "content": r.content, "dist": 0.0}
            for r in rows
        ]
    finally:
        db.close()


def upsert_wiki_entry(filename: str, title: str, content: str) -> None:
    """Store or update a wiki entry. 임베딩은 더 이상 생성하지 않는다."""
    db = SessionLocal()
    try:
        entry = db.query(WikiEntry).filter(WikiEntry.filename == filename).first()
        if entry:
            entry.content = content  # type: ignore[assignment]
            entry.title = title  # type: ignore[assignment]
        else:
            db.add(WikiEntry(
                id=str(uuid.uuid4()),
                filename=filename,
                title=title,
                content=content,
            ))
        db.commit()
    finally:
        db.close()


def sync_concepts_dir() -> int:
    """Upsert all .md files in wiki-llm/concepts/ into DB. Returns count synced."""
    if not WIKI_CONCEPTS_DIR.exists():
        return 0
    count = 0
    for path in WIKI_CONCEPTS_DIR.glob("*.md"):
        content = path.read_text(encoding="utf-8", errors="replace")
        if content.strip():
            upsert_wiki_entry(path.name, path.stem, content)
            count += 1
    return count
