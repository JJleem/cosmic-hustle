"""에이전트 DM API — RAG grounding 인격 대화 (SSE 스트리밍).

SSE 이벤트(data=JSON):
  {"type":"sources","sources":[{type,title,slug}]}   # 생성 시작 전 1회
  {"type":"delta","text":"..."}                       # 토큰 조각 0..N회
  {"type":"done","cached":bool,"daily_spend_krw":..,"budget_krw":..,"ip_remaining":..}
  {"type":"blocked","reason":"budget"|"rate_limit","message":"..."}
  {"type":"error","message":"..."}
"""
import os
import json
import hashlib
import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sse_starlette.sse import EventSourceResponse

from db.connection import get_db, SessionLocal
from db.embedder import embed
from db.logger import log_error
from blog_generator import AGENT_PERSONAS
from routers.blog import _client_ip, _ANON_SALT
import dm

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/dm", tags=["dm"])

_ADMIN_KEY = os.environ.get("ADMIN_KEY", "")


def _dm_ip_hash(request: Request) -> str:
    ip = _client_ip(request)
    return hashlib.sha256(f"{ip}dm{_ANON_SALT}".encode()).hexdigest()[:16]


def _is_admin(request: Request) -> bool:
    return bool(_ADMIN_KEY) and request.headers.get("X-Admin-Key") == _ADMIN_KEY


@router.get("/agents")
def list_agents():
    """DM 가능한 에이전트 목록(프론트 캐릭터 선택용)."""
    return [
        {"id": aid, "name": p.get("name"), "title": p.get("title"), "role": p.get("role")}
        for aid, p in AGENT_PERSONAS.items()
    ]


@router.get("/status")
def status(request: Request, db: Session = Depends(get_db)):
    """기능 on/off + 남은 예산 + 내 IP 남은 횟수(프론트 입력창 제어용)."""
    st = dm.budget_status(db)
    if _is_admin(request):
        st["ip_remaining"] = None  # 무제한
    else:
        used = dm.ip_message_count(db, _dm_ip_hash(request))
        st["ip_remaining"] = max(0, dm.IP_DAILY_LIMIT - used)
    return st


@router.post("")
async def send_message(request: Request, body: dict, db: Session = Depends(get_db)):
    agent_id = (body.get("agent_id") or "").strip()
    message = (body.get("message") or "").strip()
    history = body.get("history")

    if agent_id not in AGENT_PERSONAS:
        raise HTTPException(status_code=400, detail="유효하지 않은 agent_id")
    if not message:
        raise HTTPException(status_code=400, detail="message가 비어 있습니다")
    if len(message) > dm.MAX_MESSAGE_LEN:
        raise HTTPException(status_code=400, detail=f"메시지는 {dm.MAX_MESSAGE_LEN}자 이하로 작성해주세요")

    is_admin = _is_admin(request)
    ip_hash = _dm_ip_hash(request)

    # ── 가드 (스트림 시작 전, 동기 체크) ──────────────────────────────────────
    if dm.daily_spend_krw(db) >= dm.DAILY_BUDGET_KRW:
        async def blocked_budget():
            yield {"data": json.dumps({
                "type": "blocked", "reason": "budget",
                "message": "오늘 DM 예산이 모두 소진됐어요. 내일 다시 찾아와 주세요!",
            }, ensure_ascii=False)}
        return EventSourceResponse(blocked_budget())

    if not is_admin and dm.ip_message_count(db, ip_hash) >= dm.IP_DAILY_LIMIT:
        async def blocked_rate():
            yield {"data": json.dumps({
                "type": "blocked", "reason": "rate_limit",
                "message": f"오늘은 여기까지! (하루 {dm.IP_DAILY_LIMIT}통) 내일 또 얘기해요.",
            }, ensure_ascii=False)}
        return EventSourceResponse(blocked_rate())

    # 임베딩(CPU) — 이벤트 루프 블로킹 피하려 스레드로
    q_emb = await asyncio.to_thread(embed, message)

    # 시맨틱 캐시: 거의 동일 질문이면 LLM 스킵
    cached = dm.cache_lookup(db, agent_id, q_emb)
    if cached is not None:
        cached.hits = (cached.hits or 0) + 1
        cached_answer = cached.answer
        cached_sources = json.loads(cached.sources) if cached.sources else []
        db.commit()
        dm.log_message(db, ip_hash, agent_id, cost_usd=0.0, cached=True)

        async def cached_gen():
            yield {"data": json.dumps({"type": "sources", "sources": cached_sources}, ensure_ascii=False)}
            yield {"data": json.dumps({"type": "delta", "text": cached_answer}, ensure_ascii=False)}
            st = dm.budget_status(db)
            done = {"type": "done", "cached": True,
                    "daily_spend_krw": st["daily_spend_krw"], "budget_krw": st["budget_krw"]}
            if not is_admin:
                done["ip_remaining"] = max(0, dm.IP_DAILY_LIMIT - dm.ip_message_count(db, ip_hash))
            yield {"data": json.dumps(done, ensure_ascii=False)}
        return EventSourceResponse(cached_gen())

    # ── 생성 ──────────────────────────────────────────────────────────────────
    chunks = dm.retrieve(db, agent_id, q_emb)
    sources = dm.visible_sources(chunks)
    system = dm.build_system(agent_id, chunks)
    messages = dm.sanitize_history(history) + [{"role": "user", "content": message}]

    async def generator():
        # 쓰기는 스트림 수명 동안 안전하도록 별도 세션 사용
        wdb = SessionLocal()
        full_text = ""
        try:
            yield {"data": json.dumps({"type": "sources", "sources": sources}, ensure_ascii=False)}

            client = dm.make_client()
            usage = None
            async with client.messages.stream(
                model=dm.HAIKU, max_tokens=dm._MAX_TOKENS,
                system=system, messages=messages,
            ) as stream:
                async for delta in stream.text_stream:
                    full_text += delta
                    yield {"data": json.dumps({"type": "delta", "text": delta}, ensure_ascii=False)}
                final = await stream.get_final_message()
                usage = final.usage

            cost = dm.cost_of(usage) if usage else 0.0
            dm.log_message(wdb, ip_hash, agent_id, cost_usd=cost, cached=False)
            if full_text.strip():
                dm.cache_store(wdb, agent_id, message, q_emb, full_text.strip(), sources)

            st = dm.budget_status(wdb)
            done = {"type": "done", "cached": False,
                    "daily_spend_krw": st["daily_spend_krw"], "budget_krw": st["budget_krw"]}
            if not is_admin:
                done["ip_remaining"] = max(0, dm.IP_DAILY_LIMIT - dm.ip_message_count(wdb, ip_hash))
            yield {"data": json.dumps(done, ensure_ascii=False)}
        except Exception as e:
            logger.exception("DM 생성 실패")
            try:
                log_error(f"DM 생성 실패(agent={agent_id}): {e}", source="api", exc=e)
            except Exception:
                pass
            yield {"data": json.dumps({"type": "error", "message": "답변 생성 중 문제가 생겼어요."}, ensure_ascii=False)}
        finally:
            wdb.close()

    return EventSourceResponse(generator())
