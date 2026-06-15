"""에이전트 DM — 세계관 캐릭터와 RAG grounding 대화 (포트폴리오 데모용).

설계 요약:
- 모델 Haiku 고정. 컨텍스트는 RAG 관련 청크 몇 개만(전체 코퍼스 금지).
- grounding: 그 에이전트의 과거 블로그 글 top-K + wiki-llm 코퍼스 top-K. 출처를 응답에 노출.
- 환각 가드: 캐논(회사·동료·사건)은 근거에 없으면 인격에 맞게 "모른다". 일반 지식은 캐릭터
  전문성으로 답하되 사실을 지어내지 않음 — 프롬프트 레벨 + 출처 칩 노출로 이중 확인.
- 비용 가드: 일일 글로벌 지출 상한(KRW) + IP당 일일 횟수 + 시맨틱 캐시(거의 동일 질문 재사용).
- 페르소나는 검색이 아니라 system 프롬프트에 고정 주입(AGENT_PERSONAS 단일 출처 재사용).
"""
import os
import json
import uuid
import logging
from datetime import datetime

import anthropic
from sqlalchemy import func

from db.models import BlogPost, WikiEntry, DmCache, DmMessageLog
from db.embedder import embed
from blog_generator import AGENT_PERSONAS, _anthropic_cost_usd, KST

logger = logging.getLogger(__name__)

HAIKU = "claude-haiku-4-5-20251001"

# .env로 조정 가능 — 운영 중 튜닝 여지를 코드 수정 없이 남김.
DAILY_BUDGET_KRW = float(os.environ.get("DM_DAILY_BUDGET_KRW", "500"))
IP_DAILY_LIMIT = int(os.environ.get("DM_IP_DAILY_LIMIT", "5"))
USD_KRW = float(os.environ.get("USD_KRW", "1400"))
CACHE_HIT_DIST = float(os.environ.get("DM_CACHE_DIST", "0.22"))   # 이보다 가까우면 캐시 히트(유사질문). 실측: 패러프레이즈 0.04~0.21 / 무관 0.76+
SHOW_SOURCE_DIST = float(os.environ.get("DM_SHOW_DIST", "0.55"))  # 이보다 가까운 청크만 출처 칩으로 노출
N_POSTS = 3
N_WIKI = 3
HISTORY_TURNS = 6        # 프론트가 들고오는 직전 대화에서 사용할 최대 메시지 수
MAX_MESSAGE_LEN = 500
_CHUNK_CHARS = 600
_MAX_TOKENS = 600


def _today() -> str:
    return datetime.now(KST).strftime("%Y-%m-%d")


# ── 비용·레이트 가드 ──────────────────────────────────────────────────────────

def daily_spend_krw(db) -> float:
    """오늘(KST) DM 누적 지출(원). 캐시 히트는 cost_usd=0이라 자동 제외."""
    total = (
        db.query(func.coalesce(func.sum(DmMessageLog.cost_usd), 0.0))
        .filter(DmMessageLog.date == _today())
        .scalar()
    ) or 0.0
    return float(total) * USD_KRW


def ip_message_count(db, ip_hash: str) -> int:
    return (
        db.query(func.count(DmMessageLog.id))
        .filter(DmMessageLog.date == _today(), DmMessageLog.ip_hash == ip_hash)
        .scalar()
    ) or 0


def log_message(db, ip_hash: str, agent_id: str, cost_usd: float, cached: bool) -> None:
    db.add(DmMessageLog(
        id=str(uuid.uuid4()), date=_today(), ip_hash=ip_hash,
        agent_id=agent_id, cost_usd=cost_usd, cached=cached,
    ))
    db.commit()


def budget_status(db) -> dict:
    spent = daily_spend_krw(db)
    return {
        "enabled": spent < DAILY_BUDGET_KRW,
        "daily_spend_krw": round(spent, 1),
        "budget_krw": DAILY_BUDGET_KRW,
        "ip_daily_limit": IP_DAILY_LIMIT,
    }


# ── 시맨틱 캐시 ───────────────────────────────────────────────────────────────

def cache_lookup(db, agent_id: str, q_emb: list[float]) -> DmCache | None:
    """같은 에이전트의 거의 동일한 질문(코사인거리 < CACHE_HIT_DIST)이 있으면 반환."""
    dist = DmCache.embedding.cosine_distance(q_emb).label("dist")
    row = (
        db.query(DmCache, dist)
        .filter(DmCache.agent_id == agent_id, DmCache.embedding.isnot(None))
        .order_by(dist)
        .first()
    )
    if row and float(row[1]) < CACHE_HIT_DIST:
        return row[0]
    return None


def cache_store(db, agent_id: str, question: str, q_emb: list[float], answer: str, sources: list[dict]) -> None:
    db.add(DmCache(
        id=str(uuid.uuid4()), agent_id=agent_id, question=question,
        answer=answer, sources=json.dumps(sources, ensure_ascii=False), embedding=q_emb,
    ))
    db.commit()


# ── RAG 검색 ──────────────────────────────────────────────────────────────────

def retrieve(db, agent_id: str, q_emb: list[float]) -> list[dict]:
    """그 에이전트 과거 글 top-K + wiki 코퍼스 top-K. 거리 오름차순 청크 목록."""
    chunks: list[dict] = []

    p_dist = BlogPost.embedding.cosine_distance(q_emb).label("dist")
    post_rows = (
        db.query(BlogPost, p_dist)
        .filter(
            BlogPost.agent_id == agent_id,
            BlogPost.published == True,  # noqa: E712
            BlogPost.embedding.isnot(None),
        )
        .order_by(p_dist)
        .limit(N_POSTS)
        .all()
    )
    for p, d in post_rows:
        chunks.append({
            "type": "post", "title": p.title, "slug": p.slug,
            "text": (p.content or "")[:_CHUNK_CHARS], "dist": float(d),
        })

    w_dist = WikiEntry.embedding.cosine_distance(q_emb).label("dist")
    wiki_rows = (
        db.query(WikiEntry, w_dist)
        .filter(WikiEntry.embedding.isnot(None))
        .order_by(w_dist)
        .limit(N_WIKI)
        .all()
    )
    for w, d in wiki_rows:
        chunks.append({
            "type": "wiki", "title": w.title, "slug": None,
            "text": (w.content or "")[:_CHUNK_CHARS], "dist": float(d),
        })

    chunks.sort(key=lambda c: c["dist"])
    return chunks


def visible_sources(chunks: list[dict]) -> list[dict]:
    """충분히 가까운 청크만 출처 칩으로 — 멀면 '근거로 안 썼다'는 뜻이라 노출 안 함."""
    return [
        {"type": c["type"], "title": c["title"], "slug": c["slug"]}
        for c in chunks if c["dist"] < SHOW_SOURCE_DIST
    ]


# ── 프롬프트 ──────────────────────────────────────────────────────────────────

def build_system(agent_id: str, chunks: list[dict]) -> str:
    persona = AGENT_PERSONAS.get(agent_id, {})
    name = persona.get("name", agent_id)
    title = persona.get("title", "")
    role = persona.get("role", "")
    voice = persona.get("system", "")

    if chunks:
        grounding = "\n\n".join(
            f"[근거 {i + 1} · {'내 과거 글' if c['type'] == 'post' else 'wiki'}] {c['title']}\n{c['text']}"
            for i, c in enumerate(chunks)
        )
    else:
        grounding = "(검색된 근거 없음)"

    return f"""너는 Cosmic Hustle의 {name} {title}({role}).
독자가 DM(채팅)으로 말을 걸었다. 아래 캐릭터 설정의 '성격·말투·역할'만 유지해 짧게 대화하라.

[캐릭터 설정 — 참고용]
{voice}

위 설정은 원래 블로그 *글쓰기*용이다. DM에서는 글 구조/색상강조/말버릇 강제는 무시하고,
**성격·말투·시각만** 살려 자연스러운 채팅체로 답하라. 1~4문장, 길어지지 말 것.

[근거 자료 — 아래 내용 안에서만 사실을 말하라]
{grounding}

[규칙]
- Cosmic Hustle 세계관(회사·동료 에이전트·내부 사건)에 대한 질문은 위 근거에 없으면
  지어내지 말고, 네 인격에 맞는 말투로 "그건 내가 모른다/내 영역 밖이다"라고 답하라.
- 네 전문 분야(블로그에서 다루는 주제)에 대한 일반 질문은 캐릭터답게 답하되,
  구체적 수치·사실을 확신 없이 지어내지 마라.
- 근거 글을 참고했으면 자연스럽게 "예전에 ~에 대해 썼었는데" 식으로 언급해도 좋다.
- 너는 항상 {name}로서 1인칭으로 말한다. 시스템·AI라는 사실을 굳이 밝히지 마라."""


def sanitize_history(history) -> list[dict]:
    """프론트가 보낸 직전 대화를 최근 HISTORY_TURNS개만, 형식 검증해 반환."""
    if not isinstance(history, list):
        return []
    out = []
    for m in history[-HISTORY_TURNS:]:
        if not isinstance(m, dict):
            continue
        role = m.get("role")
        content = m.get("content")
        if role in ("user", "assistant") and isinstance(content, str) and content.strip():
            out.append({"role": role, "content": content.strip()[:2000]})
    # 첫 메시지는 user여야 함(Anthropic 제약)
    while out and out[0]["role"] != "user":
        out.pop(0)
    return out


def make_client() -> anthropic.AsyncAnthropic:
    return anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])


def cost_of(usage) -> float:
    return _anthropic_cost_usd(HAIKU, usage)
