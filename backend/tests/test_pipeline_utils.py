"""orchestrator/pipeline.py — _parse_typed 및 _Pipeline 유틸리티 단위 테스트."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
from orchestrator.pipeline import (
    _parse_typed, _Pipeline,
    cancelled_sessions, paused_sessions,
)
from orchestrator.types import PlanResult, WikiResult, PockeResult, KaResult, FactResult, PingResult


# ── _parse_typed ──────────────────────────────────────────────────────────

class TestParseTyped:
    def test_valid_json_block_returns_model(self):
        raw = '```json\n{"task_type": "blog", "objective": "테스트 목표"}\n```'
        result = _parse_typed(raw, PlanResult, PlanResult())
        assert isinstance(result, PlanResult)
        assert result.task_type == "blog"
        assert result.objective == "테스트 목표"

    def test_inline_json_returns_model(self):
        raw = '분석 완료. {"context": "AI 배경", "keywords": ["AI", "ML"], "wiki_pages_found": []}'
        result = _parse_typed(raw, WikiResult, WikiResult())
        assert isinstance(result, WikiResult)
        assert result.context == "AI 배경"
        assert "AI" in result.keywords

    def test_empty_string_returns_default(self):
        default = PockeResult()
        result = _parse_typed("", PockeResult, default)
        assert isinstance(result, PockeResult)
        assert result.key_facts == []

    def test_invalid_json_returns_default(self):
        default = KaResult(conclusion="기본 결론")
        result = _parse_typed("완전히 잘못된 텍스트 {broken json", KaResult, default)
        assert isinstance(result, KaResult)
        assert result.conclusion == "기본 결론"

    def test_valid_ka_result(self):
        raw = '```json\n{"insights": [{"title": "발견", "description": "설명"}], "conclusion": "결론", "data_quality": "high"}\n```'
        result = _parse_typed(raw, KaResult, KaResult())
        assert result.conclusion == "결론"
        assert result.data_quality == "high"
        assert len(result.insights) == 1

    def test_valid_fact_result_passed(self):
        raw = '{"passed": true, "issues": [], "feedback": "이상 없음", "needs_research": false, "research_queries": []}'
        result = _parse_typed(raw, FactResult, FactResult())
        assert result.passed is True
        assert result.feedback == "이상 없음"

    def test_valid_fact_result_failed(self):
        raw = '{"passed": false, "issues": ["수치 미검증"], "feedback": "재확인 필요", "needs_research": true, "research_queries": ["검색어"]}'
        result = _parse_typed(raw, FactResult, FactResult())
        assert result.passed is False
        assert result.needs_research is True
        assert "검색어" in result.research_queries

    def test_ping_result_ideas(self):
        raw = '{"ideas": [{"title": "아이디어1", "spark": "스파크"}, {"title": "아이디어2", "spark": "불꽃"}]}'
        result = _parse_typed(raw, PingResult, PingResult())
        assert len(result.ideas) == 2
        assert result.ideas[0].title == "아이디어1"

    def test_returns_correct_model_type(self):
        """반환값이 항상 지정한 model_class 인스턴스여야 함."""
        default = FactResult()
        result = _parse_typed("garbage", FactResult, default)
        assert type(result) is FactResult


# ── _Pipeline 유틸리티 메서드 ─────────────────────────────────────────────

class TestPipelineUtils:
    def _make_pipeline(self, session_id="test-session", mode="full"):
        events = []
        def send(event):
            events.append(event)
        p = _Pipeline(
            session_id=session_id,
            topic="테스트 주제",
            task_type="research",
            mode=mode,
            ceo_notes="",
            send=send,
            report_style={},
            checkpoint={},
        )
        return p, events

    def test_emit_adds_seq_and_session_id(self):
        p, events = self._make_pipeline()
        p.emit("agent_start", agentId="plan", message="시작")
        assert len(events) == 1
        e = events[0]
        assert e["type"] == "agent_start"
        assert e["sessionId"] == "test-session"
        assert e["seq"] == 1
        assert e["agentId"] == "plan"

    def test_emit_seq_increments(self):
        p, events = self._make_pipeline()
        p.emit("agent_start", agentId="plan", message="시작")
        p.emit("agent_done", agentId="plan", message="완료")
        assert events[0]["seq"] == 1
        assert events[1]["seq"] == 2

    def test_emit_agent_start_has_ts(self):
        p, events = self._make_pipeline()
        p.emit("agent_start", agentId="plan", message="시작")
        assert "ts" in events[0]

    def test_emit_agent_stream_no_ts(self):
        p, events = self._make_pipeline()
        p.emit("agent_stream", agentId="plan", chunk="텍스트")
        assert "ts" not in events[0]

    def test_is_cancelled_false_by_default(self):
        p, _ = self._make_pipeline(session_id="fresh-session-abc")
        cancelled_sessions.discard("fresh-session-abc")
        assert p.is_cancelled() is False

    def test_is_cancelled_true_when_in_set(self):
        p, _ = self._make_pipeline(session_id="cancelled-session-xyz")
        cancelled_sessions.add("cancelled-session-xyz")
        assert p.is_cancelled() is True
        cancelled_sessions.discard("cancelled-session-xyz")

    def test_is_paused_false_by_default(self):
        p, _ = self._make_pipeline(session_id="fresh-paused-abc")
        paused_sessions.discard("fresh-paused-abc")
        assert p.is_paused() is False

    def test_is_paused_true_when_in_set(self):
        p, _ = self._make_pipeline(session_id="paused-session-xyz")
        paused_sessions.add("paused-session-xyz")
        assert p.is_paused() is True
        paused_sessions.discard("paused-session-xyz")

    @pytest.mark.asyncio
    async def test_maybe_checkin_skips_non_checkin_mode(self):
        """mode != 'checkin'이면 maybe_checkin이 아무것도 안 해야 함."""
        p, events = self._make_pipeline(mode="full")
        await p.maybe_checkin("plan", "요약", ["팩트1"])
        # ceo_checkin 이벤트가 발생하지 않아야 함
        assert not any(e.get("type") == "ceo_checkin" for e in events)

    @pytest.mark.asyncio
    async def test_maybe_checkin_skips_non_gate_agent(self):
        """checkin 모드여도 checkin_gates에 없는 에이전트는 스킵."""
        p, events = self._make_pipeline(mode="checkin")
        p.checkin_gates = {"plan"}
        await p.maybe_checkin("wiki", "요약", ["팩트1"])
        assert not any(e.get("type") == "ceo_checkin" for e in events)
