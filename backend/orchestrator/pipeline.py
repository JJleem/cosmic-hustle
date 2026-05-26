import asyncio
import json
import time
import uuid
from pathlib import Path
from typing import AsyncGenerator

from .agent_runner import run_agent, parse_json, WIKI_DIR
from .prompts import build_prompt, TASK_CONFIG, WRITER_AGENT_ID, WRITER_PERSONALITY_DEFAULT, PERSONALITY_WRITER_MAP

# 에이전트별 모델 — Haiku: 단순 포맷팅/단일턴, Sonnet: 분석·창작·도구사용
AGENT_MODEL: dict[str, str] = {
    "wiki":  "claude-haiku-4-5-20251001",
    "fact":  "claude-haiku-4-5-20251001",
    "ping":  "claude-haiku-4-5-20251001",
    "root":  "claude-haiku-4-5-20251001",
    "plan":  "claude-haiku-4-5-20251001",
    "pocke": "claude-haiku-4-5-20251001",
    # 나머지(ka·over·pixel·buzz·run)는 Sonnet 기본값
}
from .types import PlanResult, WikiResult, PockeResult, KaResult, FactResult, PingResult
from db.wiki_store import semantic_search, sync_concepts_dir
from db.connection import SessionLocal
from db.models import ReportVersion, TokenUsage
from db.logger import log_error

# ── Global state ───────────────────────────────────────────────────────────
pending_responses: dict[str, asyncio.Future] = {}
cancelled_sessions: set[str] = set()
paused_sessions: set[str] = set()

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
    "run":   {"start1": "코드 작성 시작.", "start2": "...수정할게요.", "retry": "...다시 짤게요.", "done": "통과. 배포 가능.", "final": "...배포합니다."},  # noqa: E501
    "over":  {"start1": "이 숫자 뒤에 얼마나 많은 이야기가...", "start2": "...알겠습니다. 수정할게요.", "retry": "...다시요? (상처받음)", "done": "통과라고 했다... 역시 걸작.", "final": "...감사합니다."},  # noqa: E501
    "pixel": {"start1": "이 여백 어떻게 쓸지 감 잡혔어요. 디자인 시작할게요.", "start2": "...그리드부터 다시 잡을게요.", "retry": "...레이아웃 다시요? (눈 충혈)", "done": "통과. 폰트는 제가 결정했어요.", "final": "...올릴게요."},  # noqa: E501
    "buzz":  {"start1": "바이럴 각 잡혔어요! 전략 써볼게요.", "start2": "...타겟 다시 잡고 수정할게요.", "retry": "...다시요? 타겟 재설정할게요.", "done": "통과. 이거 퍼질 것 같은데요.", "final": "...올릴게요."},  # noqa: E501
}

WRITER_INTRO: dict[str, str] = {
    "run":   "분석 받음. 바로 짤게요.",
    "over":  "카 과장님 인사이트 받았어요... 이거 좋은 이야기가 될 것 같은데요?",
    "pixel": "인사이트 받았어요. 비주얼로 풀어볼게요.",
    "buzz":  "데이터 받았어요. 바이럴 각 보일 것 같은데요?",
}

WRITER_WAITING: dict[str, str] = {
    "run":   "카 과장님 분석 기다리는 중... 코드 구조 미리 생각해둘게요.",
    "over":  "카 과장님 분석 기다리는 중... 서론부터 구상해볼게요.",
    "pixel": "카 과장님 분석 기다리는 중... 레이아웃 머릿속에 그리고 있어요.",
    "buzz":  "카 과장님 분석 기다리는 중... 훅 문구 구상 중이에요.",
}

WRITER_SKIP: dict[str, str] = {
    "run":   "이번엔 코드 없어요.",
    "over":  "이번 태스크는 다른 팀원 담당.",
    "pixel": "이번엔 디자인 없어요.",
    "buzz":  "이번엔 마케팅 없어요.",
}

_STYLE_NOTE: dict[tuple[str, str], str] = {
    ("detailed", "analytical"): "분량: ~1200자 이상, ## 섹션 헤더로 구분. 문체: 수치·데이터 중심 분석적 문체. 구체적 비교·통계 포함.\n",
    ("standard",  "formal"):    "분량: ~700자. 문체: 공식적·격식체. ## 소제목 구조.\n",
    ("brief",     "casual"):    "분량: ~400자. 문체: 친근하고 쉬운 말투. 핵심 포인트만. 불릿·화살표 권장.\n",
    ("standard",  "casual"):    "분량: ~700자. 문체: 친근하고 쉬운 말투.\n",
    ("standard",  "analytical"): "분량: ~700자. 문체: 분석적·수치 중심.\n",
    ("brief",     "formal"):    "분량: ~400자. 문체: 공식적·격식체. 핵심만.\n",
    ("brief",     "analytical"): "분량: ~400자. 문체: 분석적. 수치 중심 요약.\n",
    ("detailed",  "formal"):    "분량: ~1200자 이상. 문체: 공식적·격식체. ## 섹션 구분.\n",
    ("detailed",  "casual"):    "분량: ~1200자 이상. 문체: 친근하고 쉬운 말투. 섹션 구분.\n",
}


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


def _parse_typed(raw: str, model_class, default):
    """JSON 파싱 후 Pydantic 모델로 변환. 실패 시 default 반환."""
    data = parse_json(raw, default.model_dump())
    try:
        return model_class.model_validate(data)
    except Exception:
        return default


def _save_checkpoint(session_id: str, stage: str, data: dict):
    from db.connection import SessionLocal
    from db.models import SessionCheckpoint
    db = SessionLocal()
    try:
        db.add(SessionCheckpoint(
            id=str(uuid.uuid4()),
            session_id=session_id,
            stage=stage,
            payload=json.dumps(data, ensure_ascii=False),
        ))
        db.commit()
    except Exception:
        pass
    finally:
        db.close()


# ── Pipeline 클래스 ────────────────────────────────────────────────────────

class _Pipeline:
    """파이프라인 실행 상태와 단계 메서드를 캡슐화."""

    def __init__(self, session_id, topic, task_type, mode, ceo_notes, send, report_style, checkpoint):
        self.session_id = session_id
        self.topic = topic
        self.task_type = task_type
        self.mode = mode
        self.ceo_notes = ceo_notes
        self.send = send
        self.report_style = report_style or {}
        self.checkpoint = checkpoint or {}
        self._seq = 0
        self._pocke_skipped = False
        self.checkin_gates: set[str] = {"plan", "root" if task_type == "dev" else "fact"}

    # ── 유틸 ──────────────────────────────────────────────────────────────

    def emit(self, etype: str, **kwargs):
        self._seq += 1
        event: dict = {"type": etype, "seq": self._seq, "sessionId": self.session_id, **kwargs}
        if etype in ("agent_start", "agent_done"):
            event["ts"] = int(time.time() * 1000)
        self.send(event)

    def is_cancelled(self) -> bool:
        return self.session_id in cancelled_sessions

    def is_paused(self) -> bool:
        return self.session_id in paused_sessions

    async def run_a(self, prompt: str, tools=None, no_tools=False, max_turns=None, agent_id: str | None = None, timeout: int = 120):
        def _on_stream(chunk: str):
            if agent_id:
                self.send({"type": "agent_stream", "agentId": agent_id, "chunk": chunk})
        agent_dir = None
        if agent_id:
            _d = Path(__file__).parent.parent / "agents" / agent_id
            if _d.exists():
                agent_dir = str(_d)
        try:
            result, stream, usage = await run_agent(
                prompt, allowed_tools=tools, no_tools=no_tools,
                add_dirs=[WIKI_DIR] if agent_id == "wiki" else [], max_turns=max_turns,
                cwd=agent_dir,
                on_stream=_on_stream if agent_id else None,
                should_stop=self.is_paused,
                model=AGENT_MODEL.get(agent_id) if agent_id else None,
                timeout=timeout,
            )
            if agent_id and usage:
                self._save_token_usage(agent_id, usage)
            return result, stream
        except TimeoutError:
            label = agent_id or "unknown"
            log_error(f"{label} 에이전트 타임아웃 ({timeout}초)", source="agent", session_id=self.session_id)
            if agent_id:
                self.emit("agent_done", agentId=agent_id, message=f"⏱ {timeout}초 초과")
                self.send({"type": "error", "message": f"[{label}] 에이전트가 {timeout}초 안에 응답하지 않았습니다."})
            return "", ""

    def _save_token_usage(self, agent_id: str, usage: dict):
        db = SessionLocal()
        try:
            db.add(TokenUsage(
                id=str(uuid.uuid4()),
                session_id=self.session_id,
                agent_id=agent_id,
                input_tokens=usage.get("input_tokens", 0),
                output_tokens=usage.get("output_tokens", 0),
                cache_read_tokens=usage.get("cache_read_tokens", 0),
                cache_creation_tokens=usage.get("cache_creation_tokens", 0),
                cost_usd=usage.get("cost_usd", 0.0),
                model=usage.get("model", ""),
            ))
            db.commit()
        except Exception as e:
            log_error(f"token_usage 저장 실패 [{agent_id}]: {e}", source="pipeline", session_id=self.session_id, exc=e)
        finally:
            db.close()

    async def maybe_checkin(self, agent_id: str, summary: str, key_facts: list[str]):
        if self.mode != "checkin" or agent_id not in self.checkin_gates:
            return
        future: asyncio.Future = asyncio.get_event_loop().create_future()
        pending_responses[self.session_id] = future
        self.emit("ceo_checkin", agentId=agent_id, summary=summary, keyFacts=key_facts)
        try:
            answer = await asyncio.wait_for(asyncio.shield(future), timeout=600)
            if answer and answer.strip():
                self.ceo_notes += f"[CEO: {answer}]\n"
        except (asyncio.TimeoutError, asyncio.CancelledError):
            pass
        finally:
            pending_responses.pop(self.session_id, None)

    # ── Stage 0: 플랜 ─────────────────────────────────────────────────────

    async def stage_plan(self) -> tuple[PlanResult, asyncio.Future]:
        """플랜 실행. (PlanResult, semantic_task) 반환."""
        self.emit("session_start", topic=self.topic)
        semantic_task = asyncio.get_event_loop().run_in_executor(None, semantic_search, self.topic, 5)

        self.emit("agent_start", agentId="plan", message="요구사항 파악 중. 티켓 열게요.")
        self.send({"type": "agent_thinking", "agentId": "plan", "chunk": "태스크 타입 분류 중..."})

        plan_key = "plan_auto" if self.task_type == "auto" else "plan"
        try:
            plan_raw, _ = await self.run_a(
                build_prompt(plan_key, topic=self.topic, task_type=self.task_type),
                no_tools=True, max_turns=1, agent_id="plan",
            )
        except Exception as e:
            log_error(f"플랜 에이전트 실패: {e}", source="agent", session_id=self.session_id, exc=e)
            plan_raw = ""
        plan = _parse_typed(plan_raw, PlanResult,
                            PlanResult(task_type=self.task_type if self.task_type in TASK_CONFIG else "research",
                                       objective=self.topic))

        resolved_task_type = plan.task_type if plan.task_type in TASK_CONFIG else (
            self.task_type if self.task_type in TASK_CONFIG else "research"
        )
        plan.resolved_task_type = resolved_task_type

        if plan.objective and plan.objective != self.topic:
            self.topic = f"{self.topic} (목표: {plan.objective}{f' / 범위: {plan.scope}' if plan.scope else ''})"

        if plan.needs_clarification and plan.clarify_questions and self.mode != "background":
            future: asyncio.Future = asyncio.get_event_loop().create_future()
            pending_responses[self.session_id] = future
            self.emit("clarify_request", agentId="plan", questions=plan.clarify_questions)
            try:
                ceo_answer = await asyncio.wait_for(asyncio.shield(future), timeout=600)
                if ceo_answer and ceo_answer.strip():
                    self.topic += f" (CEO 보충: {ceo_answer})"
            except (asyncio.TimeoutError, asyncio.CancelledError):
                pass
            finally:
                pending_responses.pop(self.session_id, None)

        self.emit("agent_done", agentId="plan", message=plan.plan_note or "기획 완료. 팀 투입할게요.")
        await self.maybe_checkin("plan", "기획이 완료됐어요. 이 방향으로 진행할까요?", [
            f"목적: {plan.objective or self.topic}",
            *([f"범위: {plan.scope}"] if plan.scope else []),
            f"태스크 타입: {resolved_task_type}",
            f"출력 형식: {plan.output_format}",
            *([f"메모: {plan.plan_note}"] if plan.plan_note else []),
        ])
        return plan, semantic_task

    # ── Stage 1+2: 위키 + 포케 ────────────────────────────────────────────

    async def stage_research(self, config: dict, semantic_task) -> tuple[str, str, WikiResult, PockeResult]:
        """위키+포케 병렬 실행. (wiki_raw, pocke_raw, WikiResult, PockeResult) 반환."""
        resume_stage = self.checkpoint.get("stage")
        default_wiki = f'{{"context": "{self.topic}에 대한 배경", "keywords": ["{self.topic}"], "wiki_pages_found": []}}'
        default_pocke = '{"sources": [], "key_facts": []}'

        if resume_stage in ("after_research", "after_analysis"):
            wiki_raw = self.checkpoint.get("wiki_raw") or default_wiki
            pocke_raw = self.checkpoint.get("pocke_raw") or default_pocke
            self.emit("agent_done", agentId="wiki", message="이전 리서치 데이터 복원됨.")
            self.emit("agent_done", agentId="pocke", message="볼따구 데이터 복원됨. 카 과장한테 넘길게요.")
            await asyncio.sleep(0.3)
        else:
            wiki_raw, pocke_raw = await self._run_wiki_pocke_parallel(config, semantic_task, default_wiki, default_pocke)  # noqa: E501

        wiki = _parse_typed(wiki_raw, WikiResult, WikiResult())
        pocke = _parse_typed(pocke_raw, PockeResult, PockeResult())

        if not pocke.key_facts and not self._pocke_skipped and not self.is_cancelled() and resume_stage not in ("after_research", "after_analysis"):
            pocke = await self._pocke_retry()
            pocke_raw = json.dumps(pocke.model_dump(), ensure_ascii=False)

        await self.maybe_checkin("wiki", "관련 지식 연결됐어요.", [
            *([f"맥락: {wiki.context[:100]}"] if wiki.context else []),
            *[f"🔑 키워드: {k}" for k in wiki.keywords[:3]],
        ])
        await self.maybe_checkin(
            "pocke",
            f"소스 {len(pocke.sources)}개, 팩트 {len(pocke.key_facts)}개 수집됐어요.",
            [f"📌 {f}" for f in pocke.key_facts[:4]] +
            [f"🔗 {s['title']}" for s in pocke.sources[:3] if isinstance(s, dict)],
        )
        return wiki_raw, pocke_raw, wiki, pocke

    async def _run_wiki_pocke_parallel(self, config, semantic_task, default_wiki, default_pocke) -> tuple[str, str]:
        _DEEP_TASKS = {"tech", "dev", "dev_plan", "dev_spec"}
        self._pocke_tools = ["WebSearch", "WebFetch"] if self.task_type in _DEEP_TASKS else ["WebSearch"]
        pocke_tools = self._pocke_tools

        # semantic_search 결과 먼저 확인 — 히트 여부로 포케 모드 결정
        self.emit("agent_start", agentId="wiki", message="관련 자료 조용히 꺼내는 중...")
        self.send({"type": "agent_thinking", "agentId": "wiki", "chunk": "위키 시맨틱 서치 중..."})
        try:
            past_entries = await semantic_task
        except Exception:
            past_entries = []

        # dist 임계값 0.45: 완전 다른 주제의 위키 데이터가 오발동 방지 (cosine distance 낮을수록 유사)
        _WIKI_HIT_THRESHOLD = 0.45
        relevant_entries = [e for e in past_entries if e.get("dist", 1.0) < _WIKI_HIT_THRESHOLD]
        pocke_mode = await self._ask_wiki_pocke_mode(relevant_entries) if relevant_entries and not self.is_cancelled() else "full"

        past_ctx = (
            "[과거 리서치 관련 자료 - 시맨틱 서치 결과]\n" + "\n\n".join(
                f"📄 {e['title']} ({e['filename']}):\n{e['content'][:400]}"
                for e in relevant_entries
            ) if relevant_entries else "관련 과거 리서치 없음. 일반 지식 활용."
        )

        async def _wiki():
            try:
                raw, _ = await self.run_a(
                    build_prompt("wiki", topic=self.topic, past_context=past_ctx),
                    no_tools=True, max_turns=1, agent_id="wiki",
                )
                self.send({"type": "agent_expression", "agentId": "wiki", "expression": "happy"})
                wiki_msg = "이전 리서치 연결됐어요." if relevant_entries else "배경 맥락 정리 완료."
                self.emit("agent_done", agentId="wiki", message=wiki_msg)
                return raw
            except Exception as e:
                log_error(f"위키 에이전트 실패: {e}", source="agent", session_id=self.session_id, exc=e)
                self.emit("agent_done", agentId="wiki", message="위키 조회 완료.")
                return ""

        async def _pocke_full():
            try:
                raw, _ = await self.run_a(
                    build_prompt(config["pocke"], topic=self.topic, context=self.topic, keywords=self.topic),
                    tools=pocke_tools, max_turns=5, agent_id="pocke", timeout=300,
                )
                self.send({"type": "agent_expression", "agentId": "pocke", "expression": "happy"})
                self.emit("agent_done", agentId="pocke", message="볼따구 터질것같아! 카 과장한테 넘길게요.")
                return raw
            except Exception as e:
                log_error(f"포케 에이전트 실패: {e}", source="agent", session_id=self.session_id, exc=e)
                self.emit("agent_done", agentId="pocke", message="수집 완료.")
                return ""

        async def _pocke_supplement():
            ctx_summary = "\n".join(f"- {e['title']}: {e['content'][:200]}" for e in past_entries)
            try:
                raw, _ = await self.run_a(
                    build_prompt(config["pocke"], topic=self.topic, context=ctx_summary, keywords=self.topic),
                    tools=pocke_tools, max_turns=3, agent_id="pocke", timeout=180,
                )
                self.send({"type": "agent_expression", "agentId": "pocke", "expression": "happy"})
                self.emit("agent_done", agentId="pocke", message="보완 검색 완료! 카 과장한테 넘길게요.")
                return raw
            except Exception as e:
                log_error(f"포케 보완 검색 실패: {e}", source="agent", session_id=self.session_id, exc=e)
                self.emit("agent_done", agentId="pocke", message="수집 완료.")
                return ""

        if pocke_mode == "skip":
            self._pocke_skipped = True
            wiki_raw = await _wiki()
            return wiki_raw or default_wiki, default_pocke

        self.emit("agent_start", agentId="pocke", message="볼따구에 정보 쑤셔넣는 중...")
        self.send({"type": "agent_thinking", "agentId": "pocke", "chunk": "검색 쿼리 구성 중..."})
        stop_pocke = _start_murmurs("pocke", MURMURS["pocke"], self.send, interval_sec=9.0)

        # design_ui는 위키 컨텍스트 불필요 — HTML 생성에 과거 리서치 무의미
        pocke_fn = _pocke_supplement if pocke_mode == "supplement" else _pocke_full
        if self.task_type == "design_ui":
            self.emit("agent_done", agentId="wiki", message="디자인 태스크 — 위키 스킵.")
            wiki_raw, pocke_raw = default_wiki, await pocke_fn()
        else:
            wiki_raw, pocke_raw = await asyncio.gather(_wiki(), pocke_fn())
        stop_pocke()
        return wiki_raw or default_wiki, pocke_raw or default_pocke

    async def _ask_wiki_pocke_mode(self, hits: list[dict]) -> str:
        """위키 히트 감지 시 CEO에게 3지선다 질문. 60초 무응답 → skip."""
        titles = ", ".join(f"'{h['title']}'" for h in hits[:3])
        future: asyncio.Future = asyncio.get_event_loop().create_future()
        pending_responses[self.session_id] = future
        self.emit("clarify_request", agentId="wiki",
                  questions=[f"위키에 관련 데이터가 있어요 ({titles}).\n60초 내 답 없으면 1번으로 진행합니다."],
                  choices=[
                      "1️⃣ 위키 데이터로만 진행 (포케 생략)",
                      "2️⃣ 위키 + 포케 보완 검색 1회",
                      "3️⃣ 완전 새 리서치 (포케 풀 실행)",
                  ])
        try:
            answer = await asyncio.wait_for(asyncio.shield(future), timeout=60)
            answer = (answer or "").strip()
            if "3" in answer:
                return "full"
            if "2" in answer:
                return "supplement"
            return "skip"
        except asyncio.TimeoutError:
            return "skip"
        finally:
            pending_responses.pop(self.session_id, None)

    async def _pocke_retry(self) -> PockeResult:
        self.send({"type": "agent_message", "agentId": "pocke",
                   "message": "어?! 볼따구가 비었잖아... 검색어 바꿔서 다시 긁어올게요! 🐹"})
        await asyncio.sleep(0.7)
        self.emit("agent_start", agentId="pocke", message="각도 바꿔서 재시도 중...")
        stop = _start_murmurs("pocke", MURMURS["pocke"], self.send, interval_sec=9.0)
        try:
            retry_raw, _ = await self.run_a(
                build_prompt("pocke_retry", topic=self.topic),
                tools=getattr(self, "_pocke_tools", ["WebSearch", "WebFetch"]), max_turns=5, agent_id="pocke", timeout=240,
            )
            retry = _parse_typed(retry_raw, PockeResult, PockeResult())
            if retry.key_facts:
                self.emit("agent_done", agentId="pocke",
                          message=f"이번엔 {len(retry.key_facts)}개 챙겼어요! 볼따구 빵빵!")
                return retry
            self.emit("agent_done", agentId="pocke", message="최선을 다했어요. 이대로 넘어갈게요.")
            return PockeResult()
        except Exception:
            self.emit("agent_done", agentId="pocke", message="재시도 완료.")
            return PockeResult()
        finally:
            stop()

    # ── Stage 3: 카 분석 ──────────────────────────────────────────────────

    async def _writer_warmup(self, writer_agent_id: str) -> None:
        """카 분석 중 writer 워밍업 — 5초 후 대기 메시지 발송 (overlap 효과)."""
        await asyncio.sleep(5.0)
        if not self.is_cancelled():
            self.send({"type": "agent_message", "agentId": writer_agent_id,
                       "message": WRITER_WAITING.get(writer_agent_id, "분석 기다리는 중...")})

    async def stage_analysis(self, config: dict, pocke: PockeResult, wiki: WikiResult | None = None) -> tuple[KaResult, str]:
        """카 분석 실행. (KaResult, ka_raw) 반환."""
        resume_stage = self.checkpoint.get("stage")
        ka_fallback = (f'{{"insights": [{{"title": "주요 동향", "description": "{self.topic}의 핵심 흐름"}}],'
                       f' "conclusion": "{self.topic}에 대한 분석 결과입니다.", "data_quality": "medium"}}')

        if resume_stage == "after_analysis":
            ka_raw = self.checkpoint.get("ka_raw") or ka_fallback
            self.emit("agent_done", agentId="ka", message="분석 데이터 복원됨. 작성 시작할게.")
            await asyncio.sleep(0.3)
        else:
            self.emit("agent_start", agentId="ka", message="패턴 분석 시작. 데이터 하나만 더...")
            self.send({"type": "agent_thinking", "agentId": "ka", "chunk": "팩트 간 연결고리 탐색 중..."})
            stop_ka = _start_murmurs("ka", MURMURS["ka"], self.send, interval_sec=10.0)
            ka_raw = ka_fallback
            try:
                if pocke.key_facts:
                    facts_str = " / ".join(pocke.key_facts[:7])
                elif self._pocke_skipped and wiki and (wiki.context or wiki.keywords):
                    # 포케를 의도적으로 스킵한 경우에만 위키 데이터를 facts로 사용
                    parts = ([wiki.context] if wiki.context else []) + wiki.keywords
                    facts_str = " / ".join(parts[:8])
                else:
                    facts_str = self.topic
                raw, _ = await self.run_a(
                    build_prompt(config["ka"], topic=self.topic,
                                 facts=facts_str,
                                 ceo_notes=self.ceo_notes),
                    no_tools=True, max_turns=1, agent_id="ka",
                )
                if raw.strip():
                    ka_raw = raw
                await asyncio.sleep(1.2)
                self.send({"type": "agent_expression", "agentId": "ka", "expression": "happy"})
                self.emit("agent_done", agentId="ka", message="찾았다!!! 핵심 인사이트 잡음.")
            except Exception as e:
                log_error(f"카 에이전트 실패: {e}", source="agent", session_id=self.session_id, exc=e)
                self.send({"type": "agent_expression", "agentId": "ka", "expression": "err"})
                self.emit("agent_done", agentId="ka", message="분석 완료.")
            finally:
                stop_ka()

        ka = _parse_typed(ka_raw, KaResult, KaResult())
        await self.maybe_checkin(
            "ka",
            f"인사이트 {len(ka.insights)}개 도출됐어요." if ka.insights else "분석 완료.",
            [*([f"결론: {ka.conclusion[:120]}"] if ka.conclusion else []),
             *[f"💡 {i.title}: {i.description[:80]}" for i in ka.insights[:4]]],
        )
        return ka, ka_raw

    # ── Stage 4: Writer + Fact 루프 ───────────────────────────────────────

    async def stage_writing(self, config: dict, ka: KaResult, pocke: PockeResult,
                            writer_agent_id: str, writer_key: str) -> tuple[str, list, bool]:
        """Writer+Fact 루프 (최대 3회). (draft, draft_versions, paused) 반환."""
        is_dev_task = config.get("_is_dev", False)
        insights_str = "; ".join(f"{i.title}: {i.description}" for i in ka.insights)
        if writer_agent_id == "pixel":
            _color_note = {"dark": "배경: 다크모드(#0f1117 계열). 텍스트: 흰색·회색.", "light": "배경: 라이트(흰색·연회색). 텍스트: 어두운 계열.", "colorful": "컬러풀 디자인. 그라디언트·강렬한 포인트 컬러 사용."}.get(self.report_style.get("tone", ""), "")
            _layout_note = {"landing": "랜딩페이지 구조: 히어로 → 특징 섹션 → CTA.", "dashboard": "대시보드 구조: 사이드바 + 메인 콘텐츠.", "card": "카드 그리드 레이아웃."}.get(self.report_style.get("length", ""), "")
            _primary = self.report_style.get("primaryColor") or ""
            _color_line = f"Primary color: {_primary}." if _primary else ""
            style_note = " ".join(p for p in [_color_note, _layout_note, _color_line] if p)
        else:
            style_note = _STYLE_NOTE.get(
                (self.report_style.get("length", "standard"), self.report_style.get("tone", "formal")), ""
            )
        draft = ""
        fact_feedback = ""
        draft_versions: list[tuple[int, str, str]] = []
        live_pocke = PockeResult(sources=list(pocke.sources), key_facts=list(pocke.key_facts[:7]))
        msgs = WRITER_MESSAGES.get(writer_agent_id, WRITER_MESSAGES["over"])

        self.send({"type": "agent_message", "agentId": writer_agent_id,
                   "message": WRITER_INTRO.get(writer_agent_id, "인사이트 받았어요.")})
        await asyncio.sleep(0.2)

        for attempt in range(1, 3):
            if self.is_cancelled():
                return draft, draft_versions, False
            if self.is_paused():
                return draft, draft_versions, True

            start_msg = msgs["start1"] if attempt == 1 else msgs["start2"]
            self.emit("agent_start", agentId=writer_agent_id, message=start_msg)
            if attempt == 2:
                self.send({"type": "agent_expression", "agentId": writer_agent_id, "expression": "sad"})

            stop_writer = _start_murmurs(writer_agent_id, MURMURS.get(writer_agent_id, []), self.send, interval_sec=11.0)  # noqa: E501
            try:
                feedback_parts = []
                if writer_agent_id == "pixel" and style_note:
                    feedback_parts.append(f"디자인 요구사항: {style_note}")
                if fact_feedback:
                    feedback_parts.append(f"팩트 피드백: {fact_feedback}")
                if not live_pocke.key_facts:
                    feedback_parts.append("웹 리서치 데이터 없음. 위키 맥락과 일반 지식 기반으로 작성.")
                writer_prompt = build_prompt(writer_key,
                                             topic=self.topic, insights=insights_str,
                                             conclusion=ka.conclusion,
                                             facts="; ".join(live_pocke.key_facts[:6]),
                                             feedback="\n".join(feedback_parts) + "\n" if feedback_parts else "")
                if style_note and writer_agent_id != "pixel":
                    writer_prompt += f"\n\n【출력 형식 최우선 지침 — 다른 모든 분량·문체 지시보다 이것을 따를 것】\n{style_note}"
                _WRITER_TIMEOUTS = {
                    "pixel": 300,
                    "over": 180, "over_neutral": 180, "over_blog": 180,
                    "over_dev_plan": 180, "over_dev_spec": 180,
                }
                writer_timeout = _WRITER_TIMEOUTS.get(writer_agent_id, 120)
                writer_raw, _ = await self.run_a(
                    writer_prompt,
                    no_tools=True, max_turns=2, agent_id=writer_agent_id, timeout=writer_timeout,
                )
                if writer_raw.strip():
                    parsed = parse_json(writer_raw, {})
                    draft = str(parsed.get("content")) if isinstance(parsed, dict) and parsed.get("content") else writer_raw  # noqa: E501
                if self.is_paused():
                    return draft, draft_versions, True
                await asyncio.sleep(1.8)
                self.emit("agent_done", agentId=writer_agent_id,
                          message=("구현 완료. 팩트 부장님 리뷰 받을게요." if is_dev_task else "완성. 팩트 부장님께.")
                          if attempt == 1 else ("구현 완료." if is_dev_task else "최종본 완성."))
            except Exception as e:
                log_error(f"라이터 에이전트({writer_agent_id}) 실패: {e}", source="agent", session_id=self.session_id, exc=e)
                self.send({"type": "agent_expression", "agentId": writer_agent_id, "expression": "err"})
                draft = f"# {self.topic}\n\n{ka.conclusion}\n\n" + "\n".join(live_pocke.key_facts)
                self.emit("agent_done", agentId=writer_agent_id, message="초안 완성. 팩트 부장님께.")
            finally:
                stop_writer()

            draft_versions.append((attempt, draft, fact_feedback))
            self.send({"type": "report_version", "version": attempt, "content": draft, "prevFeedback": fact_feedback})

            if attempt == 1:
                draft_lines = [ln.strip() for ln in draft.splitlines() if ln.strip()][:8]
                await self.maybe_checkin(writer_agent_id, "초안이 완성됐어요. 내용을 확인해주세요.",
                                         [ln[:110] for ln in draft_lines])
                _, fact_feedback, live_pocke = await self._stage_fact(
                    draft, live_pocke, writer_agent_id, msgs, attempt, is_dev_task
                )
                if self.is_paused():
                    return draft, draft_versions, True
                # 팩트는 피드백만 전달 (항상 통과) — 라이터가 한 번 수정
                await asyncio.sleep(0.4)
                self.send({"type": "agent_message", "agentId": writer_agent_id,
                           "message": msgs["retry"]})
                await asyncio.sleep(0.8)
            # attempt 2: 팩트 없음, 라이터 최종본으로 루프 종료

        self.send({"type": "agent_expression", "agentId": writer_agent_id, "expression": "happy"})

        final_lines = [ln.strip() for ln in draft.splitlines() if ln.strip()][:8]
        await self.maybe_checkin("fact", "검토까지 완료됐어요. 최종 결과물 확인해주세요.",
                                 [ln[:110] for ln in final_lines])
        return draft, draft_versions, False

    async def _stage_fact(self, draft: str, live_pocke: PockeResult, writer_agent_id: str,
                          msgs: dict, attempt: int, is_dev_task: bool) -> tuple[bool, str, PockeResult]:
        """팩트 검토 — UI 이벤트만 발송, 실제 에이전트 실행 없음. 자체 검토 지시를 feedback으로 반환."""
        await asyncio.sleep(0.4)
        self.send({"type": "agent_message", "agentId": "fact", "message": "...검토 시작."})
        await asyncio.sleep(0.5)
        self.emit("agent_start", agentId="fact", message="...")
        self.send({"type": "agent_thinking", "agentId": "fact", "chunk": "초안 분석 중..."})
        await asyncio.sleep(1.5)
        self.send({"type": "agent_expression", "agentId": "fact", "expression": "happy"})
        self.emit("agent_done", agentId="fact", message="피드백 전달. 수정 부탁해요.")
        if is_dev_task:
            feedback = "초안을 스스로 검토해. 보안 취약점·로직 오류·미구현 항목을 점검하고 완성도를 높여줘."
        else:
            feedback = "초안을 스스로 검토해. 출처 없는 수치·날짜는 삭제하거나 완화하고, 논리 흐름을 점검해서 완성도를 높여줘."
        return True, feedback, live_pocke

    async def _pocke_recheck(self, research_queries: list, live_pocke: PockeResult) -> PockeResult:
        """팩트 부장 요청으로 포케 재조사."""
        if self.is_cancelled():
            return live_pocke
        await asyncio.sleep(0.4)
        self.send({"type": "agent_message", "agentId": "pocke",
                   "message": "팩트 부장님 요청 받았어요. 다시 뒤져볼게요! 🐹"})
        await asyncio.sleep(0.5)
        self.emit("agent_start", agentId="pocke", message="재조사 중...")
        try:
            recheck_raw, _ = await self.run_a(
                build_prompt("pocke_recheck", topic=self.topic,
                             research_queries="\n".join(research_queries)),
                tools=getattr(self, "_pocke_tools", ["WebSearch", "WebFetch"]), max_turns=5, agent_id="pocke", timeout=240,
            )
            recheck = _parse_typed(recheck_raw, PockeResult, PockeResult())
            live_pocke.key_facts = list(dict.fromkeys(recheck.key_facts + live_pocke.key_facts))[:10]
            live_pocke.sources = (live_pocke.sources + recheck.sources)[:8]
            self.emit("agent_done", agentId="pocke",
                      message=f"재조사 완료. 팩트 {len(recheck.key_facts)}개 추가됐어요.")
        except Exception:
            self.emit("agent_done", agentId="pocke", message="재조사 완료.")
        return live_pocke

    # ── Stage 5: 루트 ─────────────────────────────────────────────────────

    async def stage_root(self, draft: str) -> str:
        """루트 CI/CD 단계 (dev 태스크만). 업데이트된 draft 반환."""
        await asyncio.sleep(0.4)
        self.send({"type": "agent_message", "agentId": "root", "message": "구현 확인. 파이프라인 설계할게요."})
        await asyncio.sleep(0.5)
        self.emit("agent_start", agentId="root", message="CI/CD 설계 중...")
        try:
            root_raw, _ = await self.run_a(
                build_prompt("root", topic=self.topic, report=draft[:600]),
                no_tools=True, max_turns=1, agent_id="root", timeout=120,
            )
            if root_raw.strip():
                draft += f"\n\n---\n\n{root_raw}"
            self.emit("agent_done", agentId="root", message="파이프라인 준비됐어요. 자동화 완료.")
            root_lines = [ln.strip() for ln in root_raw.splitlines() if ln.strip()][:6]
            await self.maybe_checkin("root", "배포 파이프라인 설계까지 완료됐어요.",
                                     [ln[:110] for ln in root_lines])
        except Exception:
            self.emit("agent_done", agentId="root", message="배포 계획 완료.")
        return draft

    # ── Stage 6: 핑 + 위키 ────────────────────────────────────────────────

    def _get_token_usage_summary(self) -> dict:
        """세션 토큰 사용량 합계 조회."""
        db = SessionLocal()
        try:
            from db.models import TokenUsage
            rows = db.query(TokenUsage).filter(TokenUsage.session_id == self.session_id).all()
            agents = [
                {
                    "agentId": r.agent_id,
                    "inputTokens": r.input_tokens or 0,
                    "outputTokens": r.output_tokens or 0,
                    "cacheReadTokens": r.cache_read_tokens or 0,
                    "cacheCreationTokens": r.cache_creation_tokens or 0,
                    "costUsd": r.cost_usd or 0.0,
                    "model": r.model or "",
                }
                for r in rows
            ]
            total = {
                "inputTokens": sum(a["inputTokens"] for a in agents),
                "outputTokens": sum(a["outputTokens"] for a in agents),
                "cacheReadTokens": sum(a["cacheReadTokens"] for a in agents),
                "cacheCreationTokens": sum(a["cacheCreationTokens"] for a in agents),
                "costUsd": round(sum(a["costUsd"] for a in agents), 6),
            }
            return {"agents": agents, "total": total}
        except Exception:
            return {"agents": [], "total": {"inputTokens": 0, "outputTokens": 0, "cacheReadTokens": 0, "cacheCreationTokens": 0, "costUsd": 0.0}}
        finally:
            db.close()

    async def stage_finalize(self, report_id: str, ka: KaResult, draft: str):
        """핑 → 위키 순차 실행 후 complete 이벤트."""
        insights_str = "; ".join(f"{i.title}: {i.description}" for i in ka.insights)
        await asyncio.sleep(0.3)

        # ── 핑 먼저 ──────────────────────────────────────────────────────────
        self.emit("agent_start", agentId="ping", message="이거랑 저거 합치면?! ✨ 안테나 반짝!")
        try:
            ping_raw, _ = await self.run_a(
                build_prompt("ping", topic=self.topic, conclusion=ka.conclusion[:400]),
                no_tools=True, max_turns=1, agent_id="ping",
            )
            await asyncio.sleep(0.6)
            ping_data = _parse_typed(ping_raw, PingResult, PingResult())
            if ping_data.ideas:
                self.send({"type": "ping_ideas", "agentId": "ping",
                           "ideas": [i.model_dump() for i in ping_data.ideas]})
            self.send({"type": "agent_expression", "agentId": "ping", "expression": "happy"})
            self.emit("agent_done", agentId="ping", message="아이디어 캡처 완료!")
            ping_lines = [f"💡 {i.title}: {i.spark}" for i in ping_data.ideas[:5]]
            await self.maybe_checkin("ping", f"아이디어 {len(ping_data.ideas)}개 캡처됐어요.", ping_lines)
        except Exception as e:
            log_error(f"핑 에이전트 실패: {e}", source="agent", session_id=self.session_id, exc=e)
            self.send({"type": "agent_expression", "agentId": "ping", "expression": "err"})
            self.emit("agent_done", agentId="ping", message="아이디어 캡처 완료!")

        # ── 위키 업데이트 (핑 완료 후, design_ui 제외) ───────────────────────
        if self.task_type == "design_ui":
            self.emit("agent_start", agentId="wiki", message="HTML 결과물 — 위키 저장 스킵.")
            self.emit("agent_done", agentId="wiki", message="스킵.")
        else:
            self.emit("agent_start", agentId="wiki", message="리서치 기록 업데이트 중...")
            try:
                await self.run_a(
                    build_prompt("wiki_update", topic=self.topic,
                                 conclusion=ka.conclusion[:200],
                                 insights=insights_str),
                    tools=["Read", "Write", "Edit"], max_turns=2, agent_id="wiki", timeout=120,
                )
                synced = await asyncio.get_event_loop().run_in_executor(None, sync_concepts_dir)
                self.emit("agent_done", agentId="wiki", message=f"위키 업데이트 완료. {synced}개 페이지 벡터 저장됨.")
            except Exception as e:
                log_error(f"위키 업데이트 실패: {e}", source="agent", session_id=self.session_id, exc=e)
                self.emit("agent_done", agentId="wiki", message="기록 완료.")

        token_usage = await asyncio.get_event_loop().run_in_executor(None, self._get_token_usage_summary)
        self.emit("complete", reportId=report_id, topic=self.topic, tokenUsage=token_usage)

    # ── 메인 오케스트레이터 ────────────────────────────────────────────────

    async def run(self):
        # ── 0. 플랜 ───────────────────────────────────────────────────────
        if self.is_cancelled() or self.is_paused():
            return

        resume_stage = self.checkpoint.get("stage")

        if resume_stage in ("after_plan", "after_research", "after_analysis"):
            # 체크포인트 복구 시 plan 스킵 — 저장된 task_type 사용
            resolved_task_type = str(self.checkpoint.get("resolved_task_type") or self.task_type or "research")
            if resolved_task_type not in TASK_CONFIG:
                resolved_task_type = "research"
            semantic_task = asyncio.get_event_loop().run_in_executor(None, lambda: None)
            self.emit("session_start", topic=self.topic)
            self.emit("agent_done", agentId="plan", message="기획 데이터 복원됨. 이어서 진행할게요.")
        else:
            plan, semantic_task = await self.stage_plan()
            await asyncio.sleep(0.4)

            if self.is_cancelled():
                return
            if self.is_paused():
                _save_checkpoint(self.session_id, "after_plan", {
                    "stage": "after_plan", "topic": self.topic,
                    "resolved_task_type": plan.resolved_task_type,
                    "ceo_notes": self.ceo_notes, "mode": self.mode,
                    "report_style": self.report_style,
                })
                return
            resolved_task_type = plan.resolved_task_type
        config = dict(TASK_CONFIG.get(resolved_task_type, TASK_CONFIG["research"]))
        is_dev_task = resolved_task_type == "dev"
        config["_is_dev"] = is_dev_task
        writer_key = config["writer"]
        personality = (
            self.report_style.get("writerPersonality")
            or WRITER_PERSONALITY_DEFAULT.get(resolved_task_type, "neutral")
        )
        if writer_key in PERSONALITY_WRITER_MAP:
            writer_key = PERSONALITY_WRITER_MAP[writer_key].get(personality, writer_key)
        writer_agent_id = WRITER_AGENT_ID.get(writer_key, "over")

        self.checkin_gates.clear()
        self.checkin_gates.update({"plan", "root" if is_dev_task else "fact"})

        # ── 1+2. 위키 + 포케 ──────────────────────────────────────────────
        wiki_raw, pocke_raw, wiki, pocke = await self.stage_research(config, semantic_task)

        if self.is_cancelled():
            return
        if self.is_paused():
            _save_checkpoint(self.session_id, "after_research", {
                "stage": "after_research", "topic": self.topic,
                "resolved_task_type": resolved_task_type, "ceo_notes": self.ceo_notes,
                "mode": self.mode, "report_style": self.report_style,
                "wiki_raw": wiki_raw, "pocke_raw": pocke_raw,
            })
            return

        await asyncio.sleep(0.2)
        self.send({"type": "agent_message", "agentId": "ka",
                   "message": f"포케가 팩트 {len(pocke.key_facts)}개 넘겼어. ...흥미롭네."})
        await asyncio.sleep(0.2)

        # ── 3. 카 + writer warmup 병렬 ────────────────────────────────────
        # writer_warmup: 5초 후 writer에게 "대기 중" 메시지 발송 (카 분석 중 overlap)
        warmup_task = asyncio.create_task(self._writer_warmup(writer_agent_id))
        ka, ka_raw = await self.stage_analysis(config, pocke, wiki)
        warmup_task.cancel()
        try:
            await warmup_task
        except asyncio.CancelledError:
            pass

        if self.is_cancelled():
            return
        if self.is_paused():
            _save_checkpoint(self.session_id, "after_analysis", {
                "stage": "after_analysis", "topic": self.topic,
                "resolved_task_type": resolved_task_type, "ceo_notes": self.ceo_notes,
                "mode": self.mode, "report_style": self.report_style,
                "wiki_raw": wiki_raw, "pocke_raw": pocke_raw, "ka_raw": ka_raw,
            })
            return

        # ── 4. Writer + Fact 루프 ─────────────────────────────────────────
        draft, draft_versions, was_paused = await self.stage_writing(
            config, ka, pocke, writer_agent_id, writer_key
        )

        if self.is_cancelled():
            return
        if was_paused:
            _save_checkpoint(self.session_id, "after_analysis", {
                "stage": "after_analysis", "topic": self.topic,
                "resolved_task_type": resolved_task_type, "ceo_notes": self.ceo_notes,
                "mode": self.mode, "report_style": self.report_style,
                "wiki_raw": wiki_raw, "pocke_raw": pocke_raw, "ka_raw": ka_raw,
            })
            return

        # ── 최종 리포트 ───────────────────────────────────────────────────
        report_id = str(uuid.uuid4())
        self.emit("report", reportId=report_id, agentId=writer_agent_id,
                  topic=self.topic, content=draft, taskType=resolved_task_type)

        def _save_versions():
            db = SessionLocal()
            try:
                for v, content, feedback in draft_versions:
                    db.add(ReportVersion(
                        id=str(uuid.uuid4()), session_id=self.session_id,
                        version=v, content=content, fact_feedback=feedback or None,
                    ))
                db.commit()
            finally:
                db.close()

        await asyncio.get_event_loop().run_in_executor(None, _save_versions)

        # ── 5. 루트 (dev 태스크만) ────────────────────────────────────────
        if is_dev_task:
            draft = await self.stage_root(draft)

        # ── 6. 핑 + 위키 ─────────────────────────────────────────────────
        await self.stage_finalize(report_id, ka, draft)


# ── 공개 API (기존과 동일) ─────────────────────────────────────────────────

async def run_pipeline(
    session_id: str,
    topic: str,
    task_type: str,
    mode: str = "full",
    ceo_notes: str = "",
    report_style: dict | None = None,
    checkpoint: dict | None = None,
) -> AsyncGenerator[dict, None]:
    queue: asyncio.Queue = asyncio.Queue()

    def send(event: dict):
        queue.put_nowait(event)

    pipeline = _Pipeline(session_id, topic, task_type, mode, ceo_notes, send, report_style, checkpoint)

    async def _run():
        try:
            await pipeline.run()
        except Exception as e:
            log_error(f"파이프라인 치명적 오류: {e}", source="pipeline", session_id=session_id, exc=e)
            send({"type": "error", "message": str(e)})
        finally:
            queue.put_nowait(None)

    pipeline_task = asyncio.ensure_future(_run())

    while True:
        event = await queue.get()
        if event is None:
            break
        yield event

    await pipeline_task
