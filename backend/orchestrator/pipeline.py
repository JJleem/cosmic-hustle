import asyncio
import json
import time
import uuid
from typing import AsyncGenerator

from .agent_runner import run_agent, parse_json, WIKI_DIR
from .prompts import build_prompt, TASK_CONFIG, WRITER_AGENT_ID
from db.wiki_store import semantic_search, sync_concepts_dir

# ── Global state ───────────────────────────────────────────────────────────
pending_responses: dict[str, asyncio.Future] = {}
cancelled_sessions: set[str] = set()

MURMURS: dict[str, list[str]] = {
    "pocke": ["슉슉... 어디다 쑤셔넣지?", "오 이거 건질 수 있겠다!", "볼따구가 빵빵해지는 중...", "검색 하나만 더!", "이것도 챙겨야지."],
    "ka":    ["흠... 이 패턴.", "데이터 하나만 더 보고.", "커피 한 모금.", "연결고리가 보일 듯 말 듯...", "이 수치... 뭔가 말하고 있어."],
    "over":  ["이 문장... 너무 좋다.", "서론 세 번 고쳐 씀.", "독자가 이 부분에서 멈출 것 같아.", "흑... 이 데이터 뒤에 이야기가.", "마침표 하나가 세계를 바꾼다."],
    "run":   ["이미 반쯤 짰어요.", "빌드 통과.", "타입 에러 하나 있는데 무시.", "로직은 맞는 것 같은데...", "커밋 예정."],
    "pixel": ["여백 조정 중.", "이 폰트... 2pt 줄여야겠어.", "레퍼런스랑 비교 중.", "그리드 정렬 중.", "컬러 팔레트 확정됐어요."],
    "buzz":  ["훅 문장 세 번 바꿨어요.", "이거 트위터에 올리면 터질 것 같은데.", "타겟 다시 생각 중.", "CTA가 핵심이야.", "바이럴 각 잡혔어요."],
    "fact":  ["빨간펜 들고 있어요.", "...", "출처 재확인.", ".", "논리 흐름 추적 중."],
}

WRITER_MESSAGES: dict[str, dict[str, str]] = {
    "run":   {"start1": "코드 작성 시작.", "start2": "...수정할게요.", "retry": "...다시 짤게요.", "done": "통과. 배포 가능.", "final": "...배포합니다."},
    "over":  {"start1": "이 숫자 뒤에 얼마나 많은 이야기가...", "start2": "...알겠습니다. 수정할게요.", "retry": "...다시요? (상처받음)", "done": "통과라고 했다... 역시 걸작.", "final": "...감사합니다."},
    "pixel": {"start1": "이 여백 어떻게 쓸지 감 잡혔어요. 디자인 시작할게요.", "start2": "...그리드부터 다시 잡을게요.", "retry": "...레이아웃 다시요? (눈 충혈)", "done": "통과. 폰트는 제가 결정했어요.", "final": "...올릴게요."},
    "buzz":  {"start1": "바이럴 각 잡혔어요! 전략 써볼게요.", "start2": "...타겟 다시 잡고 수정할게요.", "retry": "...다시요? 타겟 재설정할게요.", "done": "통과. 이거 퍼질 것 같은데요.", "final": "...올릴게요."},
}

WRITER_INTRO: dict[str, str] = {
    "run":   "분석 받음. 바로 짤게요.",
    "over":  "카 과장님 인사이트 받았어요... 이거 좋은 이야기가 될 것 같은데요?",
    "pixel": "인사이트 받았어요. 비주얼로 풀어볼게요.",
    "buzz":  "데이터 받았어요. 바이럴 각 보일 것 같은데요?",
}

WRITER_SKIP: dict[str, str] = {
    "run":   "이번엔 코드 없어요.",
    "over":  "이번 태스크는 다른 팀원 담당.",
    "pixel": "이번엔 디자인 없어요.",
    "buzz":  "이번엔 마케팅 없어요.",
}


def _is_cancelled(session_id: str) -> bool:
    return session_id in cancelled_sessions


def _start_murmurs(agent_id: str, lines: list[str], send, interval_sec: float = 9.0):
    """백그라운드에서 murmur 메시지 전송. 반환된 stop()으로 중단."""
    cancelled = {"v": False}

    async def _run():
        for line in lines:
            await asyncio.sleep(interval_sec)
            if cancelled["v"]:
                break
            send({"type": "agent_message", "agentId": agent_id, "message": line})

    task = asyncio.ensure_future(_run())

    def stop():
        cancelled["v"] = True
        task.cancel()

    return stop


async def _stream_chunked(agent_id: str, text: str, send):
    """텍스트를 55자 단위로 쪼개 18ms 간격으로 전송 — 타이핑 효과."""
    if not text.strip():
        return
    CHUNK = 55
    for i in range(0, len(text), CHUNK):
        send({"type": "agent_stream", "agentId": agent_id, "chunk": text[i : i + CHUNK]})
        await asyncio.sleep(0.018)


_STYLE_NOTE: dict[tuple[str, str], str] = {
    ("detailed", "analytical"): "분량: ~1200자 이상, ## 섹션 헤더로 구분. 문체: 수치·데이터 중심 분석적 문체. 구체적 비교·통계 포함.\n",
    ("standard",  "formal"):    "분량: ~700자. 문체: 공식적·격식체. ## 소제목 구조.\n",
    ("brief",     "casual"):    "분량: ~400자. 문체: 친근하고 쉬운 말투. 핵심 포인트만. 불릿·화살표 권장.\n",
    ("standard",  "casual"):    "분량: ~700자. 문체: 친근하고 쉬운 말투.\n",
    ("standard",  "analytical"):"분량: ~700자. 문체: 분석적·수치 중심.\n",
    ("brief",     "formal"):    "분량: ~400자. 문체: 공식적·격식체. 핵심만.\n",
    ("brief",     "analytical"):"분량: ~400자. 문체: 분석적. 수치 중심 요약.\n",
    ("detailed",  "formal"):    "분량: ~1200자 이상. 문체: 공식적·격식체. ## 섹션 구분.\n",
    ("detailed",  "casual"):    "분량: ~1200자 이상. 문체: 친근하고 쉬운 말투. 섹션 구분.\n",
}


async def _pipeline_inner(
    session_id: str,
    topic: str,
    task_type: str,
    mode: str,
    ceo_notes_init: str,
    send,
    report_style: dict | None = None,
):
    seq = 0
    ceo_notes = ceo_notes_init
    # dev 태스크면 plan+root, 나머지는 plan+fact 두 곳에서만 CEO 체크인
    checkin_gates: set[str] = {"plan", "root" if task_type == "dev" else "fact"}

    def make_ts_event(etype: str, **kwargs) -> dict:
        nonlocal seq
        seq += 1
        event: dict = {"type": etype, "seq": seq, "sessionId": session_id, **kwargs}
        if etype in ("agent_start", "agent_done"):
            event["ts"] = int(time.time() * 1000)
        return event

    def emit(etype: str, **kwargs):
        send(make_ts_event(etype, **kwargs))

    async def run_a(prompt: str, tools=None, no_tools=False, max_turns=None):
        return await run_agent(prompt, allowed_tools=tools, no_tools=no_tools,
                               add_dirs=[WIKI_DIR], max_turns=max_turns)

    async def maybe_checkin(agent_id: str, summary: str, key_facts: list[str]):
        nonlocal ceo_notes
        if mode != "checkin":
            return
        if agent_id not in checkin_gates:
            return
        future: asyncio.Future = asyncio.get_event_loop().create_future()
        pending_responses[session_id] = future
        emit("ceo_checkin", agentId=agent_id, summary=summary, keyFacts=key_facts)
        try:
            answer = await asyncio.wait_for(asyncio.shield(future), timeout=600)
            if answer and answer.strip():
                ceo_notes += f"[CEO: {answer}]\n"
        except (asyncio.TimeoutError, asyncio.CancelledError):
            pass
        finally:
            pending_responses.pop(session_id, None)

    # ── session_start ──────────────────────────────────────────────────────
    emit("session_start", topic=topic)

    # 플랜 실행 중 시맨틱 서치 미리 백그라운드 시작 (플랜 ~30s 동안 완료됨)
    semantic_task = asyncio.get_event_loop().run_in_executor(None, semantic_search, topic, 3)

    # ── 0. 플랜 ───────────────────────────────────────────────────────────
    if _is_cancelled(session_id):
        return

    emit("agent_start", agentId="plan", message="요구사항 파악 중. 티켓 열게요.")
    send({"type": "agent_thinking", "agentId": "plan", "chunk": "태스크 타입 분류 중..."})
    plan_key = "plan_auto" if task_type == "auto" else "plan"
    plan_raw, plan_stream = await run_a(
        build_prompt(plan_key, topic=topic, task_type=task_type), no_tools=True, max_turns=1
    )

    if plan_stream.strip():
        send({"type": "agent_stream", "agentId": "plan", "chunk": plan_stream[:300]})
    elif plan_raw.strip():
        await _stream_chunked("plan", plan_raw, send)

    plan = parse_json(plan_raw, {
        "task_type": task_type, "objective": topic, "scope": "",
        "output_format": "리포트", "needs_clarification": False,
        "clarify_questions": [], "plan_note": "",
    })

    resolved_task_type = plan.get("task_type", task_type)
    if resolved_task_type not in TASK_CONFIG:
        resolved_task_type = task_type if task_type in TASK_CONFIG else "research"

    objective = plan.get("objective", "")
    scope = plan.get("scope", "")
    if objective and objective != topic:
        topic = f"{topic} (목표: {objective}{f' / 범위: {scope}' if scope else ''})"

    if plan.get("needs_clarification") and plan.get("clarify_questions") and mode != "background":
        future: asyncio.Future = asyncio.get_event_loop().create_future()
        pending_responses[session_id] = future
        emit("clarify_request", questions=plan["clarify_questions"])
        try:
            ceo_answer = await asyncio.wait_for(asyncio.shield(future), timeout=600)
            if ceo_answer and ceo_answer.strip():
                topic += f" (CEO 보충: {ceo_answer})"
        except (asyncio.TimeoutError, asyncio.CancelledError):
            pass
        finally:
            pending_responses.pop(session_id, None)

    emit("agent_done", agentId="plan", message=plan.get("plan_note") or "기획 완료. 팀 투입할게요.")
    await maybe_checkin("plan", "기획이 완료됐어요. 이 방향으로 진행할까요?", [
        f"목적: {plan.get('objective', topic)}",
        *([f"범위: {scope}"] if scope else []),
        f"태스크 타입: {resolved_task_type}",
        f"출력 형식: {plan.get('output_format', '리포트')}",
        *([f"메모: {plan.get('plan_note')}"] if plan.get("plan_note") else []),
    ])
    await asyncio.sleep(0.4)

    if _is_cancelled(session_id):
        return

    # ── 태스크 타입 + writer 결정 ──────────────────────────────────────────
    config = TASK_CONFIG.get(resolved_task_type, TASK_CONFIG["research"])
    writer_key = config["writer"]
    writer_agent_id = WRITER_AGENT_ID.get(writer_key, "over")
    is_dev_task = resolved_task_type == "dev"
    # 플랜이 task_type을 바꿀 수 있으므로 여기서 gates 확정
    checkin_gates.clear()
    checkin_gates.update({"plan", "root" if is_dev_task else "fact"})

    for wid, skip_msg in WRITER_SKIP.items():
        if wid != writer_agent_id:
            send({"type": "agent_done", "agentId": wid, "message": skip_msg,
                  "ts": int(time.time() * 1000)})

    # ── 1+2. 위키 + 포케 동시 실행 ────────────────────────────────────────
    wiki_context = f'{{"context": "{topic}에 대한 배경", "keywords": ["{topic}"], "wiki_pages_found": []}}'
    pocke_output = '{"sources": [], "key_facts": []}'

    emit("agent_start", agentId="wiki", message="관련 자료 조용히 꺼내는 중...")
    emit("agent_start", agentId="pocke", message="볼따구에 정보 쑤셔넣는 중...")
    send({"type": "agent_thinking", "agentId": "wiki", "chunk": "위키 시맨틱 서치 중..."})
    send({"type": "agent_thinking", "agentId": "pocke", "chunk": "검색 쿼리 구성 중..."})

    stop_pocke = _start_murmurs("pocke", MURMURS["pocke"], send, interval_sec=9.0)

    async def _wiki_task():
        try:
            past_entries = await semantic_task  # 플랜 실행 중 이미 완료됨
            if past_entries:
                past_ctx = "[과거 리서치 관련 자료 - 시맨틱 서치 결과]\n" + "\n\n".join(
                    f"📄 {e['title']} ({e['filename']}):\n{e['content'][:400]}"
                    for e in past_entries
                )
            else:
                past_ctx = "관련 과거 리서치 없음. 일반 지식 활용."
        except Exception:
            past_ctx = "관련 과거 리서치 없음. 일반 지식 활용."
        try:
            return await run_a(
                build_prompt("wiki", topic=topic, past_context=past_ctx),
                no_tools=True, max_turns=1,
            )
        except Exception:
            return "", ""

    async def _pocke_task():
        try:
            return await run_a(
                build_prompt(config["pocke"], topic=topic, context=topic, keywords=topic),
                tools=["WebSearch", "WebFetch"], max_turns=5,
            )
        except Exception:
            return "", ""

    wiki_result, pocke_result = await asyncio.gather(_wiki_task(), _pocke_task())
    stop_pocke()

    # 위키 결과 처리
    wiki_raw, wiki_stream = wiki_result
    if wiki_raw.strip():
        wiki_context = wiki_raw
    if wiki_stream.strip():
        send({"type": "agent_stream", "agentId": "wiki", "chunk": wiki_stream[:300]})
    elif wiki_raw.strip():
        await _stream_chunked("wiki", wiki_raw, send)
    emit("agent_done", agentId="wiki", message="이전 리서치 연결됐어요.")

    # 포케 결과 처리
    pocke_raw, pocke_stream = pocke_result
    if pocke_raw.strip():
        pocke_output = pocke_raw
    if pocke_stream.strip():
        send({"type": "agent_stream", "agentId": "pocke", "chunk": pocke_stream[:300]})
    elif pocke_raw.strip():
        await _stream_chunked("pocke", pocke_raw, send)
    emit("agent_done", agentId="pocke", message="볼따구 터질것같아! 카 과장한테 넘길게요.")

    wiki = parse_json(wiki_context, {"context": "", "keywords": [], "wiki_pages_found": []})
    pocke = parse_json(pocke_output, {"sources": [], "key_facts": []})
    pocke_has_data = bool(pocke.get("key_facts"))

    wiki_checkin_lines = [
        *([f"맥락: {wiki['context'][:100]}"] if wiki.get("context") else []),
        *[f"🔑 키워드: {k}" for k in wiki.get("keywords", [])[:3]],
    ]
    await maybe_checkin("wiki", "관련 지식 연결됐어요.", wiki_checkin_lines)

    pocke_summary = f"소스 {len(pocke.get('sources', []))}개, 팩트 {len(pocke.get('key_facts', []))}개 수집됐어요."
    pocke_fact_lines = [f"📌 {f}" for f in pocke.get("key_facts", [])[:4]]
    pocke_src_lines = [f"🔗 {s['title']}" for s in pocke.get("sources", [])[:3] if isinstance(s, dict)]
    await maybe_checkin("pocke", pocke_summary, pocke_fact_lines + pocke_src_lines)

    if _is_cancelled(session_id):
        return

    await asyncio.sleep(0.4)
    send({"type": "agent_message", "agentId": "ka",
          "message": f"포케가 팩트 {len(pocke.get('key_facts', []))}개 넘겼어. ...흥미롭네."})
    await asyncio.sleep(0.6)

    # ── 3. 카 ─────────────────────────────────────────────────────────────
    ka_output = (f'{{"insights": [{{"title": "주요 동향", "description": "{topic}의 핵심 흐름"}}],'
                 f' "conclusion": "{topic}에 대한 분석 결과입니다.", "data_quality": "medium"}}')
    emit("agent_start", agentId="ka", message="패턴 분석 시작. 데이터 하나만 더...")
    send({"type": "agent_thinking", "agentId": "ka", "chunk": "팩트 간 연결고리 탐색 중..."})
    try:
        stop_ka = _start_murmurs("ka", MURMURS["ka"], send, interval_sec=10.0)
        ka_raw, ka_stream = await run_a(
            build_prompt(config["ka"], topic=topic,
                         facts=" / ".join(pocke.get("key_facts", [])),
                         ceo_notes=ceo_notes),
            no_tools=True, max_turns=1,
        )
        stop_ka()
        if ka_raw.strip():
            ka_output = ka_raw
        if ka_stream.strip():
            send({"type": "agent_stream", "agentId": "ka", "chunk": ka_stream[:300]})
        elif ka_raw.strip():
            await _stream_chunked("ka", ka_raw, send)
        await asyncio.sleep(1.2)
        emit("agent_done", agentId="ka",
             message=f"찾았다!!! 핵심 인사이트 잡음. {writer_agent_id}한테 넘길게.")
    except Exception:
        emit("agent_done", agentId="ka", message="분석 완료.")

    ka = parse_json(ka_output, {"insights": [], "conclusion": "", "data_quality": "medium"})

    ka_is_list = isinstance(ka.get("insights"), list)
    ka_summary = (f"인사이트 {len(ka['insights'])}개 도출됐어요. 이 방향으로 작성할까요?"
                  if ka_is_list and ka["insights"] else "분석 완료. 이 방향으로 계속할까요?")
    ka_checkin_lines = [
        *([f"결론: {ka.get('conclusion', '')[:120]}"] if ka.get("conclusion") else []),
        *[f"💡 {i['title']}: {i.get('description', '')[:80]}"
          for i in (ka.get("insights") or [])[:4] if isinstance(i, dict)],
    ]
    await maybe_checkin("ka", ka_summary, ka_checkin_lines)

    if _is_cancelled(session_id):
        return

    await asyncio.sleep(0.4)
    send({"type": "agent_message", "agentId": writer_agent_id,
          "message": WRITER_INTRO.get(writer_agent_id, "인사이트 받았어요.")})
    await asyncio.sleep(0.6)

    # ── 4. Writer + Fact 루프 (최대 3회) ─────────────────────────────────
    insights_str = "; ".join(
        f"{i['title']}: {i.get('description', '')}"
        for i in (ka.get("insights") or [])
        if isinstance(i, dict)
    )
    # 리포트 스타일 노트 계산
    _rs = report_style or {}
    style_note = _STYLE_NOTE.get(
        (_rs.get("length", "standard"), _rs.get("tone", "formal")),
        ""
    )

    draft = ""
    fact_passed = False
    fact_feedback = ""
    live_pocke = {
        "sources": list(pocke.get("sources", [])),
        "key_facts": list(pocke.get("key_facts", [])),
    }
    msgs = WRITER_MESSAGES.get(writer_agent_id, WRITER_MESSAGES["over"])

    for attempt in range(1, 4):
        if _is_cancelled(session_id):
            return

        start_msg = msgs["start1"] if attempt == 1 else msgs["start2"]
        emit("agent_start", agentId=writer_agent_id, message=start_msg)
        if attempt == 2:
            send({"type": "agent_expression", "agentId": writer_agent_id, "expression": None})

        try:
            stop_writer = _start_murmurs(writer_agent_id, MURMURS.get(writer_agent_id, []), send, interval_sec=11.0)
            _feedback_parts = []
            if style_note:
                _feedback_parts.append(style_note)
            if fact_feedback:
                _feedback_parts.append(f"피드백: {fact_feedback}")
            if not live_pocke["key_facts"]:
                _feedback_parts.append("웹 리서치 데이터 없음. 위키 맥락과 일반 지식 기반으로 작성.")
            writer_raw, writer_stream = await run_a(
                build_prompt(writer_key,
                             topic=topic,
                             insights=insights_str,
                             conclusion=ka.get("conclusion", ""),
                             facts="; ".join(live_pocke["key_facts"][:6]),
                             feedback="\n".join(_feedback_parts) + "\n" if _feedback_parts else ""),
                no_tools=True, max_turns=2,
            )
            stop_writer()
            if writer_raw.strip():
                draft = writer_raw
            if writer_stream.strip():
                send({"type": "agent_stream", "agentId": writer_agent_id, "chunk": writer_stream[:300]})
            elif writer_raw.strip():
                await _stream_chunked(writer_agent_id, writer_raw, send)
            await asyncio.sleep(1.8)
            done_msg = "구현 완료. 팩트 부장님 리뷰 받을게요." if is_dev_task else "완성. 팩트 부장님께."
            emit("agent_done", agentId=writer_agent_id, message=done_msg)
        except Exception:
            draft = f"# {topic}\n\n{ka.get('conclusion', '')}\n\n" + "\n".join(live_pocke["key_facts"])
            emit("agent_done", agentId=writer_agent_id, message="초안 완성. 팩트 부장님께.")

        if attempt == 1:
            draft_lines = [l.strip() for l in draft.splitlines() if l.strip()][:8]
            await maybe_checkin(writer_agent_id, "초안이 완성됐어요. 내용을 확인해주세요.",
                                 [l[:110] for l in draft_lines])

        await asyncio.sleep(0.4)
        send({"type": "agent_message", "agentId": "fact", "message": "...검토 시작."})
        await asyncio.sleep(0.5)

        emit("agent_start", agentId="fact", message="...")
        send({"type": "agent_thinking", "agentId": "fact", "chunk": "초안 분석 중..."})
        try:
            stop_fact = _start_murmurs("fact", MURMURS["fact"], send, interval_sec=10.0)
            fact_prompt_key = "fact_dev" if is_dev_task else "fact"
            fact_raw, fact_stream = await run_a(
                build_prompt(fact_prompt_key,
                             report=draft[:3000],
                             sources=json.dumps(pocke.get("sources", [])[:5], ensure_ascii=False)),
                no_tools=True, max_turns=1,
            )
            stop_fact()
            if fact_stream.strip():
                send({"type": "agent_stream", "agentId": "fact", "chunk": fact_stream[:300]})
            elif fact_raw.strip():
                await _stream_chunked("fact", fact_raw, send)
            await asyncio.sleep(0.8)

            fact = parse_json(fact_raw, {
                "passed": True, "issues": [], "feedback": "",
                "needs_research": False, "research_queries": [],
            })
            fact_passed = bool(fact.get("passed", True))
            fact_feedback = fact.get("feedback", "")

            if not fact_passed:
                send({"type": "draft_report", "agentId": writer_agent_id, "topic": topic, "content": draft})
                send({"type": "agent_message", "agentId": "fact",
                      "message": f"오류 {len(fact.get('issues', []))}건. 수정 후 재검토."})
                send({"type": "agent_expression", "agentId": "fact", "expression": "err"})
                send({"type": "agent_expression", "agentId": writer_agent_id,
                      "expression": "sad" if writer_agent_id == "over" else "err"})
                emit("agent_done", agentId="fact", message="재조사 요청.")

                if fact.get("needs_research") and fact.get("research_queries") and attempt < 3:
                    if _is_cancelled(session_id):
                        return
                    await asyncio.sleep(0.4)
                    send({"type": "agent_message", "agentId": "pocke",
                          "message": "팩트 부장님 요청 받았어요. 다시 뒤져볼게요! 🐹"})
                    await asyncio.sleep(0.5)
                    emit("agent_start", agentId="pocke", message="재조사 중...")
                    try:
                        recheck_queries = fact["research_queries"]

                        recheck_raw, _ = await run_a(
                            build_prompt("pocke_recheck", topic=topic,
                                         research_queries="\n".join(recheck_queries)),
                            tools=["WebSearch", "WebFetch"], max_turns=3,
                        )
                        recheck = parse_json(recheck_raw, {"sources": [], "key_facts": []})
                        live_pocke["key_facts"] = list(dict.fromkeys(
                            recheck.get("key_facts", []) + live_pocke["key_facts"]
                        ))[:10]
                        live_pocke["sources"] = (live_pocke["sources"] + recheck.get("sources", []))[:8]
                        pocke_has_data = bool(live_pocke["key_facts"])
                        emit("agent_done", agentId="pocke",
                             message=f"재조사 완료. 팩트 {len(recheck.get('key_facts', []))}개 추가됐어요.")
                    except Exception:
                        emit("agent_done", agentId="pocke", message="재조사 완료.")

                await asyncio.sleep(0.4)
                send({"type": "agent_message", "agentId": writer_agent_id, "message": msgs["retry"]})
                await asyncio.sleep(0.8)
                send({"type": "agent_expression", "agentId": "fact", "expression": None})
            else:
                send({"type": "agent_expression", "agentId": "fact", "expression": None})
                emit("agent_done", agentId="fact", message="통과.")
                await asyncio.sleep(0.3)
                emit("agent_done", agentId=writer_agent_id, message=msgs["done"])
                break

        except Exception:
            fact_passed = True
            emit("agent_done", agentId="fact", message="검토 완료.")
            break

    if not fact_passed:
        send({"type": "agent_expression", "agentId": "fact", "expression": None})
        emit("agent_done", agentId="fact", message="통과 처리.")
        emit("agent_done", agentId=writer_agent_id, message=msgs["final"])

    final_lines = [l.strip() for l in draft.splitlines() if l.strip()][:8]
    await maybe_checkin("fact", "검토까지 완료됐어요. 최종 결과물 확인해주세요.",
                         [l[:110] for l in final_lines])

    if _is_cancelled(session_id):
        return

    # ── 5. 루트 (dev 태스크만) ────────────────────────────────────────────
    if is_dev_task:
        await asyncio.sleep(0.4)
        send({"type": "agent_message", "agentId": "root", "message": "구현 확인. 파이프라인 설계할게요."})
        await asyncio.sleep(0.5)
        emit("agent_start", agentId="root", message="CI/CD 설계 중...")
        try:
            root_raw, root_stream = await run_a(
                build_prompt("root", topic=topic, report=draft[:600]), no_tools=True, max_turns=1,
            )
            if root_stream.strip():
                send({"type": "agent_stream", "agentId": "root", "chunk": root_stream[:300]})
            elif root_raw.strip():
                await _stream_chunked("root", root_raw, send)
            if root_raw.strip():
                draft += f"\n\n---\n\n{root_raw}"
            emit("agent_done", agentId="root", message="파이프라인 준비됐어요. 자동화 완료.")
            root_lines = [l.strip() for l in root_raw.splitlines() if l.strip()][:6]
            await maybe_checkin("root", "배포 파이프라인 설계까지 완료됐어요. 확인해주세요.",
                                 [l[:110] for l in root_lines])
        except Exception:
            emit("agent_done", agentId="root", message="배포 계획 완료.")
    else:
        send({"type": "agent_done", "agentId": "root", "message": "이번엔 배포 없어요.",
              "ts": int(time.time() * 1000)})

    # ── 최종 리포트 ────────────────────────────────────────────────────────
    report_id = str(uuid.uuid4())
    emit("report", reportId=report_id, agentId=writer_agent_id, topic=topic, content=draft)

    # ── 6. 핑 + 위키 동시 ────────────────────────────────────────────────
    await asyncio.sleep(0.3)
    emit("agent_start", agentId="ping", message="이거랑 저거 합치면?! ✨ 안테나 반짝!")
    emit("agent_start", agentId="wiki", message="리서치 기록 업데이트 중...")

    async def _run_ping():
        try:
            ping_raw, _ = await run_a(
                build_prompt("ping", topic=topic, conclusion=ka.get("conclusion", "")[:400]),
                no_tools=True, max_turns=1,
            )
            await _stream_chunked("ping", ping_raw, send)
            await asyncio.sleep(0.6)
            ping_data = parse_json(ping_raw, {"ideas": []})
            if ping_data.get("ideas"):
                send({"type": "ping_ideas", "agentId": "ping", "ideas": ping_data["ideas"]})
            emit("agent_done", agentId="ping", message="아이디어 캡처 완료!")
            ping_lines = [
                f"💡 {i['title']}: {i.get('spark', '')}"
                for i in ping_data.get("ideas", [])[:5] if isinstance(i, dict)
            ]
            await maybe_checkin("ping", f"아이디어 {len(ping_data.get('ideas', []))}개 캡처됐어요.", ping_lines)
        except Exception:
            emit("agent_done", agentId="ping", message="아이디어 캡처 완료!")

    async def _run_wiki_update():
        try:
            await run_a(
                build_prompt("wiki_update", topic=topic,
                             conclusion=ka.get("conclusion", "")[:200],
                             insights=insights_str),
                tools=["Read", "Write", "Edit", "Glob", "Grep"], max_turns=4,
            )
            # 저장된 파일 → pgvector DB에 임베딩 동기화
            synced = await asyncio.get_event_loop().run_in_executor(None, sync_concepts_dir)
            emit("agent_done", agentId="wiki", message=f"위키 업데이트 완료. {synced}개 페이지 벡터 저장됨.")
        except Exception:
            emit("agent_done", agentId="wiki", message="기록 완료.")

    await asyncio.gather(_run_ping(), _run_wiki_update(), return_exceptions=True)

    emit("complete", reportId=report_id, topic=topic)


async def run_pipeline(
    session_id: str,
    topic: str,
    task_type: str,
    mode: str = "full",
    ceo_notes: str = "",
    report_style: dict | None = None,
) -> AsyncGenerator[dict, None]:
    """AsyncGenerator that yields SSE events from the pipeline via asyncio.Queue."""
    queue: asyncio.Queue = asyncio.Queue()

    def send(event: dict):
        queue.put_nowait(event)

    async def _run():
        try:
            await _pipeline_inner(session_id, topic, task_type, mode, ceo_notes, send, report_style)
        except Exception as e:
            send({"type": "error", "message": str(e)})
        finally:
            queue.put_nowait(None)  # sentinel

    pipeline_task = asyncio.ensure_future(_run())

    while True:
        event = await queue.get()
        if event is None:
            break
        yield event

    await pipeline_task
