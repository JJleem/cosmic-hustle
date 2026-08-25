import ast
from pathlib import Path

import blog_quality_gate


def _post(content: str, **extra):
    return {
        "title": "테스트 제목", "agent_id": "buzz", "content": content,
        "summary": "요약", "seo_title": "검색 제목", "seo_description": "검색 설명",
        "content_type": "MARKETING", **extra,
    }


def test_free_gate_rejects_leftover_generation_marker():
    result = blog_quality_gate.free_quality_checks(_post("## 하나\n본문 {{IMAGE: broken}}"))
    assert result["fatal_issues"]


def test_free_gate_only_warns_about_length_and_structure():
    result = blog_quality_gate.free_quality_checks(_post("## 하나\n짧은 글"))
    assert result["fatal_issues"] == []
    assert any("4,000" in warning for warning in result["warnings"])


def test_section_bounds_selects_only_requested_section():
    content = "도입\n## 첫째\n고칠 내용\n## 둘째\n남길 내용"
    start, end = blog_quality_gate._section_bounds(content, "첫째")
    assert content[start:end] == "## 첫째\n고칠 내용\n"


def test_scheduled_quality_gate_is_advisory_and_never_unpublishes_daily_post():
    """매일 발행은 핵심 운영 규칙이며 품질 게이트 장애보다 우선한다."""
    source = (Path(__file__).parents[1] / "main.py").read_text(encoding="utf-8")
    module = ast.parse(source)
    daily_job = next(
        node for node in module.body
        if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef))
        and node.name == "_daily_blog_job"
    )
    gate_branch = next(
        node for node in ast.walk(daily_job)
        if isinstance(node, ast.If)
        and "gate.get" in ast.unparse(node.test)
        and "publishable" in ast.unparse(node.test)
    )
    unpublished_assignments = [
        node for node in ast.walk(gate_branch)
        if isinstance(node, ast.Assign)
        and any(ast.unparse(target) == "data['published']" for target in node.targets)
        and isinstance(node.value, ast.Constant)
        and node.value.value is False
    ]
    assert unpublished_assignments == []
