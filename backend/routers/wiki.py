import re
from datetime import date
from pathlib import Path
from fastapi import APIRouter
from pydantic import BaseModel
import numpy as np
import networkx as nx
from db.wiki_store import semantic_search, upsert_wiki_entry, sync_concepts_dir
from db.connection import SessionLocal
from db.models import WikiEntry

router = APIRouter(prefix="/api/wiki")

WIKI_DIR = Path(__file__).parent.parent.parent / "wiki-llm"


def _list_wiki_files() -> list[Path]:
    if not WIKI_DIR.exists():
        return []
    return sorted(WIKI_DIR.glob("*.md"))


def _to_kebab(name: str) -> str:
    stem = Path(name).stem
    # 언더스코어 → 하이픈, 나머지 비알파벳 → 하이픈
    slug = re.sub(r"[_\s]+", "-", stem)
    slug = re.sub(r"[^\w가-힣-]+", "", slug).strip("-")
    return slug


def _extract_tags(content: str, filename: str) -> list[str]:
    """파일명 + 첫 줄 # 제목 + 자주 나오는 영단어로 태그 추출."""
    tags: list[str] = []
    stem = Path(filename).stem.lower().replace("_", "-")
    tags.append(stem.split("-")[0])
    for line in content.splitlines():
        line = line.strip()
        if line.startswith("# "):
            words = re.findall(r"[a-zA-Z가-힣]{3,}", line[2:])
            tags.extend(w.lower() for w in words[:3])
            break
    return list(dict.fromkeys(t for t in tags if t))[:5]


def _build_concept_md(title: str, tags: list[str], content: str) -> str:
    today = date.today().isoformat()
    frontmatter = f"---\ntags: [{', '.join(tags)}]\ndate: {today}\nsource_count: 1\n---\n\n"
    # 원본이 이미 마크다운이면 그대로 사용, 아니면 제목 + 내용
    if content.lstrip().startswith("#"):
        return frontmatter + content.strip()
    return frontmatter + f"# {title}\n\n{content.strip()}"


def _build_source_md(title: str, tags: list[str], original_filename: str, content: str) -> str:
    today = date.today().isoformat()
    frontmatter = (
        f"---\ntags: [{', '.join(tags)}]\ndate: {today}\n"
        f"source_file: {original_filename}\n---\n\n"
    )
    preview = content.strip()[:1200]
    return frontmatter + f"# {title} — 소스 요약\n\n{preview}"


class IngestRequest(BaseModel):
    filename: str
    content: str


class IngestLocalRequest(BaseModel):
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


@router.post("/ingest-local")
def ingest_local(body: IngestLocalRequest):
    """원본 .md/.txt를 받아 concept + source 마크다운을 반환. DB·파일 저장 없음."""
    slug = _to_kebab(body.filename)
    stem = Path(body.filename).stem
    # 언더스코어·하이픈을 공백으로 변환해 가독성 있는 제목 생성
    title = re.sub(r"[-_]+", " ", stem).strip()
    tags = _extract_tags(body.content, body.filename)

    concept_filename = f"{slug}.md"
    source_filename = f"sources/{slug}-source.md"

    concept_content = _build_concept_md(title, tags, body.content)
    source_content = _build_source_md(title, tags, body.filename, body.content)

    return {
        "concept": {"filename": concept_filename, "content": concept_content},
        "source": {"filename": source_filename, "content": source_content},
    }


@router.get("/graph")
def get_wiki_graph():
    """모든 WikiEntry 임베딩으로 코사인 유사도 그래프 + Leiden 커뮤니티 반환."""
    db = SessionLocal()
    try:
        entries = db.query(WikiEntry).filter(WikiEntry.embedding.isnot(None)).all()
        if not entries:
            return {"nodes": [], "links": []}

        n = len(entries)
        embs = np.array([e.embedding for e in entries], dtype=np.float32)
        norms = np.linalg.norm(embs, axis=1, keepdims=True)
        norms[norms == 0] = 1
        sim = (embs / norms) @ (embs / norms).T  # cosine similarity matrix

        G = nx.Graph()
        G.add_nodes_from(range(n))
        for i in range(n):
            for j in range(i + 1, n):
                if float(sim[i, j]) > 0.5:
                    G.add_edge(i, j, weight=float(sim[i, j]))

        try:
            communities = list(nx.algorithms.community.greedy_modularity_communities(G))
        except Exception:
            communities = [{i} for i in range(n)]

        node_to_cluster = {}
        for cid, community in enumerate(communities):
            for idx in community:
                node_to_cluster[idx] = cid

        # 서버 사이드 3D 레이아웃 — 클라이언트 물리 시뮬 불필요
        scale = 280
        pos3d = nx.spring_layout(G, dim=3, k=3.0, iterations=300, seed=42)
        slug_to_pos: dict[str, tuple[float, float, float]] = {}

        def _parse_frontmatter(content: str):
            tags, source_count = [], 1
            if content.startswith("---"):
                for line in content.split("\n")[1:]:
                    if line.strip() == "---":
                        break
                    if line.startswith("tags:"):
                        tags = re.findall(r"[a-zA-Z가-힣\-_]{2,}", line[5:])[:5]
                    elif line.startswith("source_count:"):
                        try:
                            source_count = int(line.split(":")[1].strip())
                        except Exception:
                            pass
            return tags, source_count

        slugs = [e.filename.replace(".md", "") for e in entries]
        slug_set = set(slugs)
        filename_to_cluster: dict[str, int] = {}

        nodes = []
        for i, e in enumerate(entries):
            slug = slugs[i]
            tags, source_count = _parse_frontmatter(e.content)
            cluster = node_to_cluster.get(i, 0)
            filename_to_cluster[slug] = cluster
            p = pos3d.get(i, np.zeros(3))
            px, py, pz = float(p[0] * scale), float(p[1] * scale), float(p[2] * scale)
            slug_to_pos[slug] = (px, py, pz)
            nodes.append({
                "id": slug,
                "type": "concept",
                "size": max(source_count, 1),
                "cluster": cluster,
                "tags": tags,
                "preview": e.content,
                "title": e.title,
                "x": round(px, 2),
                "y": round(py, 2),
                "z": round(pz, 2),
                "createdAt": e.created_at.date().isoformat() if e.created_at else None,
            })

        links = []
        for i in range(n):
            for j in range(i + 1, n):
                w = float(sim[i, j])
                if w > 0.5:
                    links.append({"source": slugs[i], "target": slugs[j], "weight": round(w, 3)})

        # source 노드 — 파일시스템에서 읽기
        rng = np.random.RandomState(42)
        sources_dir = WIKI_DIR / "wiki" / "sources"
        if sources_dir.exists():
            for src_file in sorted(sources_dir.glob("*.md")):
                stem = src_file.stem
                parent_id = stem[:-7] if stem.endswith("-source") else stem
                preview = ""
                try:
                    preview = src_file.read_text(encoding="utf-8", errors="replace")[:3000]
                except Exception:
                    pass
                ppx, ppy, ppz = slug_to_pos.get(parent_id, (0.0, 0.0, 0.0))
                offset = rng.randn(3) * 18.0
                nodes.append({
                    "id": stem,
                    "type": "source",
                    "parentId": parent_id,
                    "size": 1,
                    "cluster": filename_to_cluster.get(parent_id, 0),
                    "tags": [],
                    "preview": preview,
                    "title": stem,
                    "x": round(ppx + float(offset[0]), 2),
                    "y": round(ppy + float(offset[1]), 2),
                    "z": round(ppz + float(offset[2]), 2),
                })
                if parent_id in slug_set:
                    links.append({"source": parent_id, "target": stem, "weight": 0.8})

        return {"nodes": nodes, "links": links}
    finally:
        db.close()


@router.post("/sync")
def sync_wiki():
    """wiki-llm/wiki/concepts/의 모든 .md 파일을 DB에 벡터 저장."""
    try:
        count = sync_concepts_dir()
        return {"ok": True, "synced": count}
    except Exception as e:
        return {"ok": False, "error": str(e)}
