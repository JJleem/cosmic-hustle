import asyncio
import json
import uuid
from typing import AsyncGenerator

from .agent_runner import run_agent, parse_json, WIKI_DIR
from .prompts import build_prompt, TASK_CONFIG, WRITER_AGENT_ID

# CEO 체크인 대기용 — session_id → asyncio.Future
pending_responses: dict[str, asyncio.Future] = {}
cancelled_sessions: set[str] = set()


def _is_cancelled(session_id: str) -> bool:
    return session_id in cancelled_sessions


async def run_pipeline(
    session_id: str,
    topic: str,
    task_type: str,
    mode: str = "full",
    ceo_notes: str = "",
) -> AsyncGenerator[dict, None]:

    seq = 0

    def make_event(etype: str, **kwargs) -> dict:
        nonlocal seq
        seq += 1
        return {"type": etype, "seq": seq, "sessionId": session_id, **kwargs}

    async def agent_run(agent_id: str, prompt: str, tools=None, no_tools=False, max_turns=None):
        result = await run_agent(
            prompt,
            allowed_tools=tools,
            no_tools=no_tools,
            add_dirs=[WIKI_DIR],
            max_turns=max_turns,
        )
        return result, ""

    # ── session_start ──────────────────────────────────────────────────
    yield make_event("session_start", topic=topic)

    # ── 1. 플랜 차장 ──────────────────────────────────────────────────
    if _is_cancelled(session_id):
        return

    yield make_event("agent_start", agentId="plan", message="요구사항 분석 중...")

    plan_key = "plan_auto" if task_type == "auto" else "plan"
    plan_prompt = build_prompt(plan_key, topic=topic, task_type=task_type)

    plan_raw, plan_stream = await agent_run("plan", plan_prompt, no_tools=True, max_turns=1)
    plan = parse_json(plan_raw, {
        "task_type": task_type, "objective": topic,
        "needs_clarification": False, "clarify_questions": [],
        "plan_note": "", "scope": ""
    })

    resolved_task_type = plan.get("task_type", task_type)

    yield make_event("agent_message", agentId="plan", message=plan.get("plan_note", "계획 수립 완료"))
    yield make_event("agent_done", agentId="plan", result=plan)

    # 명확화 질문이 있으면 CEO에게 물어봄 (checkin 모드)
    if plan.get("needs_clarification") and mode == "checkin" and plan.get("clarify_questions"):
        questions = plan["clarify_questions"]
        future = asyncio.get_event_loop().create_future()
        pending_responses[session_id] = future
        yield make_event("clarify_request", agentId="plan", questions=questions)
        try:
            ceo_answer = await asyncio.wait_for(future, timeout=600)
            ceo_notes = f"CEO 추가 정보: {ceo_answer}\n"
        except (asyncio.TimeoutError, asyncio.CancelledError):
            pass
        finally:
            pending_responses.pop(session_id, None)

    if _is_cancelled(session_id):
        return

    # ── 2. 위키 + 포케 병렬 실행 ────────────────────────────────────
    yield make_event("agent_start", agentId="wiki", message="과거 지식 탐색 중...")
    yield make_event("agent_start", agentId="pocke", message="웹 리서치 시작...")

    config = TASK_CONFIG.get(resolved_task_type, TASK_CONFIG["research"])
    wiki_prompt = build_prompt("wiki", topic=topic)
    pocke_prompt = build_prompt(
        config["pocke"], topic=topic,
        context="조사 중", keywords=plan.get("scope", ""),
    )

    (wiki_raw, _), (pocke_raw, pocke_stream) = await asyncio.gather(
        agent_run("wiki", wiki_prompt, tools=["Read", "Glob"], max_turns=2),
        agent_run("pocke", pocke_prompt, tools=["WebSearch", "WebFetch"], max_turns=3),
    )

    wiki = parse_json(wiki_raw, {"context": "", "keywords": [], "wiki_pages_found": []})
    pocke = parse_json(pocke_raw, {"sources": [], "key_facts": [], "unverified_count": 0})

    yield make_event("agent_message", agentId="wiki", message=f"지식 {len(wiki.get('wiki_pages_found', []))}개 페이지 참조")
    yield make_event("agent_done", agentId="wiki", result=wiki)

    if pocke_stream:
        yield make_event("agent_stream", agentId="pocke", text=pocke_stream[:500])
    yield make_event("agent_message", agentId="pocke", message=f"팩트 {len(pocke.get('key_facts', []))}개 수집")
    yield make_event("agent_done", agentId="pocke", result=pocke)

    if _is_cancelled(session_id):
        return

    # CEO 체크인 (checkin 모드)
    if mode == "checkin":
        future = asyncio.get_event_loop().create_future()
        pending_responses[session_id] = future
        yield make_event("ceo_checkin", stage="post_research",
                         message="리서치 결과를 확인해주세요. 계속 진행할까요?",
                         pocke=pocke, wiki=wiki)
        try:
            ceo_answer = await asyncio.wait_for(future, timeout=600)
            if ceo_answer:
                ceo_notes += f"\nCEO 피드백: {ceo_answer}"
        except (asyncio.TimeoutError, asyncio.CancelledError):
            pass
        finally:
            pending_responses.pop(session_id, None)

    if _is_cancelled(session_id):
        return

    # ── 3. 카 과장 (분석) ─────────────────────────────────────────────
    yield make_event("agent_start", agentId="ka", message="분석 중...")

    facts_str = json.dumps(pocke.get("key_facts", []), ensure_ascii=False)
    ka_prompt = build_prompt(
        config["ka"], topic=topic,
        facts=facts_str, ceo_notes=f"{ceo_notes}\n" if ceo_notes else "",
    )
    ka_raw, _ = await agent_run("ka", ka_prompt, no_tools=True, max_turns=1)
    ka = parse_json(ka_raw, {"insights": [], "conclusion": "", "data_quality": "medium"})

    yield make_event("agent_message", agentId="ka", message=ka.get("conclusion", "분석 완료"))
    yield make_event("agent_done", agentId="ka", result=ka)

    if _is_cancelled(session_id):
        return

    # ── 4. 라이터 + 팩트 피드백 루프 (최대 3회) ──────────────────────
    writer_key = config["writer"]
    writer_agent_id = WRITER_AGENT_ID.get(writer_key, "over")
    fact_key = "fact_dev" if resolved_task_type == "dev" else "fact"

    insights_str = json.dumps(ka.get("insights", []), ensure_ascii=False)
    sources_str = json.dumps(pocke.get("sources", []), ensure_ascii=False)
    draft = ""
    feedback_str = ""

    for attempt in range(3):
        if _is_cancelled(session_id):
            return

        yield make_event("agent_start", agentId=writer_agent_id,
                         message="작성 중..." if attempt == 0 else f"수정 중... ({attempt + 1}회차)")

        writer_prompt = build_prompt(
            writer_key, topic=topic,
            insights=insights_str, conclusion=ka.get("conclusion", ""),
            facts=facts_str, feedback=f"이전 피드백 반영:\n{feedback_str}\n\n" if feedback_str else "",
        )
        draft, draft_stream = await agent_run(writer_agent_id, writer_prompt, no_tools=True, max_turns=1)

        if draft_stream:
            yield make_event("agent_stream", agentId=writer_agent_id, text=draft_stream[:300])
        yield make_event("draft_report", agentId=writer_agent_id, content=draft)
        yield make_event("agent_done", agentId=writer_agent_id)

        # 팩트 부장 검토
        yield make_event("agent_start", agentId="fact", message="검토 중...")

        fact_prompt = build_prompt(fact_key, report=draft, sources=sources_str)
        fact_raw, _ = await agent_run("fact", fact_prompt, no_tools=True, max_turns=1)
        fact = parse_json(fact_raw, {"passed": True, "issues": [], "feedback": "",
                                     "needs_research": False, "research_queries": []})

        yield make_event("agent_message", agentId="fact",
                         message="통과" if fact.get("passed") else f"수정 필요: {len(fact.get('issues', []))}개 이슈")
        yield make_event("agent_done", agentId="fact", result=fact)

        if fact.get("passed"):
            break

        feedback_str = fact.get("feedback", "")

        # 팩트 재조사 필요한 경우
        if fact.get("needs_research") and fact.get("research_queries"):
            if _is_cancelled(session_id):
                return
            yield make_event("agent_start", agentId="pocke", message="추가 조사 중...")
            recheck_prompt = build_prompt(
                "pocke_recheck", topic=topic,
                research_queries="\n".join(fact["research_queries"]),
            )
            recheck_raw, _ = await agent_run("pocke", recheck_prompt, tools=["WebSearch", "WebFetch"], max_turns=2)
            recheck = parse_json(recheck_raw, {"sources": [], "key_facts": []})

            pocke["key_facts"] = list(set(pocke.get("key_facts", []) + recheck.get("key_facts", [])))
            pocke["sources"] = pocke.get("sources", []) + recheck.get("sources", [])
            facts_str = json.dumps(pocke["key_facts"], ensure_ascii=False)
            sources_str = json.dumps(pocke["sources"], ensure_ascii=False)

            yield make_event("agent_done", agentId="pocke", message="추가 조사 완료")

    if _is_cancelled(session_id):
        return

    # ── 5. 최종 리포트 저장 ───────────────────────────────────────────
    report_id = str(uuid.uuid4())
    yield make_event("report", reportId=report_id, agentId=writer_agent_id,
                     topic=topic, content=draft)

    # ── 6. 핑 + 위키 업데이트 병렬 ───────────────────────────────────
    yield make_event("agent_start", agentId="ping", message="아이디어 포착 중...")
    yield make_event("agent_start", agentId="wiki", message="지식 업데이트 중...")

    ping_prompt = build_prompt("ping", topic=topic, conclusion=ka.get("conclusion", ""))
    wiki_update_prompt = build_prompt(
        "wiki_update", topic=topic,
        conclusion=ka.get("conclusion", ""),
        insights=insights_str,
    )

    (ping_raw, _), _ = await asyncio.gather(
        agent_run("ping", ping_prompt, no_tools=True, max_turns=1),
        agent_run("wiki", wiki_update_prompt, tools=["Read", "Write", "Glob"], max_turns=2),
    )

    ping = parse_json(ping_raw, {"ideas": []})
    yield make_event("ping_ideas", agentId="ping", ideas=ping.get("ideas", []))
    yield make_event("agent_done", agentId="ping")
    yield make_event("agent_done", agentId="wiki", message="지식 저장 완료")

    yield make_event("complete", reportId=report_id, topic=topic)
