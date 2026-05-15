"""orchestrator/types.py — Pydantic 모델 단위 테스트."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
from orchestrator.types import (
    PlanResult, WikiResult, PockeResult,
    Insight, KaResult,
    FactResult, PingIdea, PingResult,
)


# ── PlanResult ─────────────────────────────────────────────────────────────

class TestPlanResult:
    def test_defaults(self):
        p = PlanResult()
        assert p.task_type == "research"
        assert p.needs_clarification is False
        assert p.clarify_questions == []
        assert p.resolved_task_type == ""

    def test_validate_from_dict(self):
        p = PlanResult.model_validate({
            "task_type": "blog",
            "objective": "블로그 포스팅",
            "scope": "국내 독자",
            "needs_clarification": True,
            "clarify_questions": ["어떤 주제?"],
            "plan_note": "짧게 써요",
        })
        assert p.task_type == "blog"
        assert p.needs_clarification is True
        assert len(p.clarify_questions) == 1

    def test_resolved_task_type_mutable(self):
        p = PlanResult(task_type="research")
        p.resolved_task_type = "research"
        assert p.resolved_task_type == "research"

    def test_extra_fields_ignored(self):
        p = PlanResult.model_validate({"task_type": "tech", "unknown_field": "ignored"})
        assert p.task_type == "tech"


# ── WikiResult ─────────────────────────────────────────────────────────────

class TestWikiResult:
    def test_defaults(self):
        w = WikiResult()
        assert w.context == ""
        assert w.keywords == []
        assert w.wiki_pages_found == []

    def test_validate_from_dict(self):
        w = WikiResult.model_validate({
            "context": "배경 요약",
            "keywords": ["AI", "LLM"],
            "wiki_pages_found": ["ChatGPT"],
        })
        assert w.context == "배경 요약"
        assert len(w.keywords) == 2


# ── PockeResult ─────────────────────────────────────────────────────────────

class TestPockeResult:
    def test_defaults(self):
        p = PockeResult()
        assert p.sources == []
        assert p.key_facts == []

    def test_mutable_attributes(self):
        """live_pocke 패턴: 필드를 직접 수정 가능해야 함."""
        p = PockeResult(key_facts=["팩트1", "팩트2"])
        p.key_facts = ["팩트1", "팩트2", "팩트3"]
        assert len(p.key_facts) == 3

    def test_sources_are_dicts(self):
        p = PockeResult.model_validate({
            "sources": [{"title": "테스트", "summary": "요약", "url": "https://example.com"}],
            "key_facts": ["팩트A"],
        })
        assert isinstance(p.sources[0], dict)
        assert p.sources[0]["title"] == "테스트"


# ── KaResult ──────────────────────────────────────────────────────────────

class TestKaResult:
    def test_defaults(self):
        k = KaResult()
        assert k.insights == []
        assert k.conclusion == ""
        assert k.data_quality == "medium"

    def test_insights_are_insight_objects(self):
        k = KaResult.model_validate({
            "insights": [{"title": "주요 발견", "description": "설명"}],
            "conclusion": "결론 한 줄",
            "data_quality": "high",
        })
        assert len(k.insights) == 1
        assert isinstance(k.insights[0], Insight)
        assert k.insights[0].title == "주요 발견"

    def test_conclusion_is_string_not_dict(self):
        """Phase 3-A 버그 방지: ka.get('conclusion') 패턴 사용 불가."""
        k = KaResult(conclusion="결론입니다")
        assert isinstance(k.conclusion, str)
        assert not hasattr(k, "get"), "KaResult는 dict가 아니므로 .get() 없어야 함"

    def test_insight_defaults(self):
        i = Insight()
        assert i.title == ""
        assert i.description == ""


# ── FactResult ─────────────────────────────────────────────────────────────

class TestFactResult:
    def test_defaults_pass(self):
        f = FactResult()
        assert f.passed is True
        assert f.issues == []
        assert f.needs_research is False
        assert f.research_queries == []

    def test_failed_fact(self):
        f = FactResult.model_validate({
            "passed": False,
            "issues": ["수치 미검증"],
            "feedback": "재확인 필요",
            "needs_research": True,
            "research_queries": ["검색어1"],
        })
        assert f.passed is False
        assert f.needs_research is True
        assert f.research_queries == ["검색어1"]


# ── PingResult ─────────────────────────────────────────────────────────────

class TestPingResult:
    def test_defaults(self):
        p = PingResult()
        assert p.ideas == []

    def test_ideas_are_ping_idea_objects(self):
        p = PingResult.model_validate({
            "ideas": [
                {"title": "아이디어1", "spark": "한 줄 설명"},
                {"title": "아이디어2", "spark": "또 다른 설명"},
            ]
        })
        assert len(p.ideas) == 2
        assert isinstance(p.ideas[0], PingIdea)
        assert p.ideas[0].title == "아이디어1"

    def test_model_dump_for_sse(self):
        """SSE 전송 시 model_dump() 결과가 직렬화 가능해야 함."""
        p = PingResult.model_validate({"ideas": [{"title": "T", "spark": "S"}]})
        dumped = [i.model_dump() for i in p.ideas]
        assert dumped == [{"title": "T", "spark": "S"}]
