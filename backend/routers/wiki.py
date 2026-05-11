import os
from pathlib import Path
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/wiki")

WIKI_DIR = Path(__file__).parent.parent.parent / "wiki-llm"


def _list_wiki_files() -> list[Path]:
    if not WIKI_DIR.exists():
        return []
    return sorted(WIKI_DIR.glob("*.md"))


class IngestRequest(BaseModel):
    filename: str
    content: str


@router.get("/search")
def search_wiki(q: str = ""):
    results = []
    for path in _list_wiki_files():
        text = path.read_text(encoding="utf-8", errors="replace")
        if not q or q.lower() in text.lower() or q.lower() in path.stem.lower():
            results.append({
                "filename": path.name,
                "title": path.stem,
                "preview": text[:300],
            })
    return results


@router.post("/ingest")
def ingest_wiki(body: IngestRequest):
    WIKI_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = Path(body.filename).name  # 경로 traversal 방지
    if not safe_name.endswith(".md"):
        safe_name += ".md"
    target = WIKI_DIR / safe_name
    target.write_text(body.content, encoding="utf-8")
    return {"ok": True, "filename": safe_name}
