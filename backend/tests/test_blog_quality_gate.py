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
