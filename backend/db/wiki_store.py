"""Wiki semantic search and upsert helpers."""
import uuid
from pathlib import Path
from .connection import SessionLocal
from .models import WikiEntry
from .embedder import embed

WIKI_CONCEPTS_DIR = Path(__file__).parent.parent.parent / "wiki-llm" / "wiki" / "concepts"


def semantic_search(query: str, top_k: int = 3) -> list[dict]:
    """Return top_k wiki entries most semantically similar to query, with cosine distance score."""
    db = SessionLocal()
    try:
        q_emb = embed(query)
        dist_col = WikiEntry.embedding.cosine_distance(q_emb).label("dist")
        rows = (
            db.query(WikiEntry, dist_col)
            .filter(WikiEntry.embedding.isnot(None))
            .order_by(dist_col)
            .limit(top_k)
            .all()
        )
        return [
            {"filename": r.filename, "title": r.title, "content": r.content, "dist": float(d)}
            for r, d in rows
        ]
    finally:
        db.close()


def upsert_wiki_entry(filename: str, title: str, content: str) -> None:
    """Store or update a wiki entry with embedding."""
    db = SessionLocal()
    try:
        emb = embed(content)
        entry = db.query(WikiEntry).filter(WikiEntry.filename == filename).first()
        if entry:
            entry.content = content  # type: ignore[assignment]
            entry.title = title  # type: ignore[assignment]
            entry.embedding = emb  # type: ignore[assignment]
        else:
            db.add(WikiEntry(
                id=str(uuid.uuid4()),
                filename=filename,
                title=title,
                content=content,
                embedding=emb,
            ))
        db.commit()
    finally:
        db.close()


def sync_concepts_dir() -> int:
    """Embed and upsert all .md files in wiki-llm/concepts/ into DB. Returns count synced."""
    if not WIKI_CONCEPTS_DIR.exists():
        return 0
    count = 0
    for path in WIKI_CONCEPTS_DIR.glob("*.md"):
        content = path.read_text(encoding="utf-8", errors="replace")
        if content.strip():
            upsert_wiki_entry(path.name, path.stem, content)
            count += 1
    return count
