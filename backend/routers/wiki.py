from pathlib import Path
from fastapi import APIRouter
from pydantic import BaseModel
from db.wiki_store import semantic_search, upsert_wiki_entry

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
    if not q:
        # 쿼리 없으면 파일 목록 반환
        results = []
        for path in _list_wiki_files():
            text = path.read_text(encoding="utf-8", errors="replace")
            results.append({
                "filename": path.name,
                "title": path.stem,
                "preview": text[:300],
            })
        return results

    # 쿼리 있으면 pgvector 시맨틱 서치
    try:
        entries = semantic_search(q, top_k=5)
        return [
            {
                "filename": e["filename"],
                "title": e["title"],
                "preview": e["content"][:300],
            }
            for e in entries
        ]
    except Exception:
        # fallback: 키워드 검색
        results = []
        for path in _list_wiki_files():
            text = path.read_text(encoding="utf-8", errors="replace")
            if q.lower() in text.lower() or q.lower() in path.stem.lower():
                results.append({
                    "filename": path.name,
                    "title": path.stem,
                    "preview": text[:300],
                })
        return results


@router.post("/ingest")
def ingest_wiki(body: IngestRequest):
    WIKI_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = Path(body.filename).name
    if not safe_name.endswith(".md"):
        safe_name += ".md"
    target = WIKI_DIR / safe_name
    target.write_text(body.content, encoding="utf-8")

    # pgvector DB에도 저장
    try:
        upsert_wiki_entry(safe_name, Path(safe_name).stem, body.content)
    except Exception:
        pass

    return {"ok": True, "filename": safe_name}
