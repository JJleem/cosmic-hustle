"""orchestrator/prompts.py — build_prompt 및 설정 단위 테스트."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
from orchestrator.prompts import build_prompt, TASK_CONFIG, WRITER_AGENT_ID, PROMPTS


# ── build_prompt ──────────────────────────────────────────────────────────

class TestBuildPrompt:
    def test_replaces_topic(self):
        result = build_prompt("wiki", topic="AI 에이전트", past_context="없음")
        assert "AI 에이전트" in result
        assert "{topic}" not in result

    def test_replaces_multiple_kwargs(self):
        result = build_prompt("plan", topic="테스트 주제", task_type="research")
        assert "테스트 주제" in result
        assert "research" in result
        assert "{topic}" not in result
        assert "{task_type}" not in result

    def test_unknown_key_returns_empty(self):
        result = build_prompt("nonexistent_key", topic="X")
        assert result == ""

    def test_plan_auto_no_task_type_placeholder(self):
        result = build_prompt("plan_auto", topic="자동 감지 테스트")
        assert "자동 감지 테스트" in result
        assert "{topic}" not in result

    def test_fact_uses_report_and_sources(self):
        result = build_prompt("fact", report="리포트 내용", sources="[]")
        assert "리포트 내용" in result
        assert "{report}" not in result
        assert "{sources}" not in result

    def test_ka_with_ceo_notes(self):
        result = build_prompt("ka", topic="주제", facts="팩트1 / 팩트2", ceo_notes="CEO 메모\n")
        assert "CEO 메모" in result
        assert "{facts}" not in result
        assert "{ceo_notes}" not in result

    def test_over_feedback_empty_string(self):
        """feedback이 빈 문자열일 때 {feedback} 자리만 사라져야 함."""
        result = build_prompt("over", topic="T", insights="I", conclusion="C", facts="F", feedback="")
        assert "{feedback}" not in result

    def test_ping_prompt_format(self):
        result = build_prompt("ping", topic="우주탐사", conclusion="탐사가 중요하다")
        assert "우주탐사" in result
        assert "탐사가 중요하다" in result


# ── TASK_CONFIG ───────────────────────────────────────────────────────────

REQUIRED_TASK_TYPES = [
    "research", "blog", "tech", "marketing",
    "design_ux", "design_ui", "dev", "dev_plan", "dev_spec",
]

class TestTaskConfig:
    def test_all_task_types_present(self):
        for tt in REQUIRED_TASK_TYPES:
            assert tt in TASK_CONFIG, f"TASK_CONFIG에 '{tt}' 없음"

    def test_each_config_has_required_keys(self):
        for tt, cfg in TASK_CONFIG.items():
            assert "pocke" in cfg, f"{tt}: 'pocke' 키 없음"
            assert "ka" in cfg, f"{tt}: 'ka' 키 없음"
            assert "writer" in cfg, f"{tt}: 'writer' 키 없음"

    def test_writer_keys_exist_in_prompts(self):
        """TASK_CONFIG의 writer 값이 PROMPTS에 실제로 존재해야 함."""
        for tt, cfg in TASK_CONFIG.items():
            writer_key = cfg["writer"]
            assert writer_key in PROMPTS, f"{tt}: writer '{writer_key}' PROMPTS에 없음"

    def test_pocke_keys_exist_in_prompts(self):
        for tt, cfg in TASK_CONFIG.items():
            pocke_key = cfg["pocke"]
            assert pocke_key in PROMPTS, f"{tt}: pocke '{pocke_key}' PROMPTS에 없음"

    def test_ka_keys_exist_in_prompts(self):
        for tt, cfg in TASK_CONFIG.items():
            ka_key = cfg["ka"]
            assert ka_key in PROMPTS, f"{tt}: ka '{ka_key}' PROMPTS에 없음"


# ── WRITER_AGENT_ID ───────────────────────────────────────────────────────

class TestWriterAgentId:
    def test_all_writer_keys_mapped(self):
        """TASK_CONFIG에서 사용하는 writer 키가 모두 WRITER_AGENT_ID에 매핑돼야 함."""
        for tt, cfg in TASK_CONFIG.items():
            writer_key = cfg["writer"]
            assert writer_key in WRITER_AGENT_ID, (
                f"{tt}: writer key '{writer_key}'가 WRITER_AGENT_ID에 없음"
            )

    def test_agent_ids_are_valid(self):
        valid_ids = {"over", "buzz", "pixel", "run"}
        for key, agent_id in WRITER_AGENT_ID.items():
            assert agent_id in valid_ids, f"'{key}' → '{agent_id}' 유효하지 않은 에이전트 ID"
