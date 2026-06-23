import importlib.util
from pathlib import Path
from types import SimpleNamespace


def _load_module():
    path = Path(__file__).parents[1] / "blog_daily_report.py"
    spec = importlib.util.spec_from_file_location("blog_daily_report_under_test", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_daily_ranking_uses_daily_human_activity_not_cumulative_totals():
    report = _load_module()
    old_debate = SimpleNamespace(
        id="old",
        title="오래된 AI 토론",
        slug="old-debate",
        agent_id="buzz",
        tags='["AI토론"]',
        view_count=10000,
        likes=500,
    )
    fresh_post = SimpleNamespace(
        id="fresh",
        title="오늘 읽힌 새 글",
        slug="fresh-post",
        agent_id="over",
        tags='["감성에세이"]',
        view_count=10,
        likes=0,
    )

    ranked = report._rank_daily_posts(
        [old_debate, fresh_post],
        daily_views={"old": 1, "fresh": 8},
        human_comments={"old": 0, "fresh": 1},
        human_likes={"old": 0, "fresh": 1},
    )

    assert [post["slug"] for post in ranked] == ["fresh-post", "old-debate"]
    assert ranked[0]["views"] == 8
    assert ranked[0]["comments"] == 1
    assert ranked[0]["likes"] == 1
    assert ranked[1]["score"] == 1


def test_memory_excerpt_omits_whole_lines_instead_of_cutting_mid_sentence():
    report = _load_module()
    memory = "\n".join([
        "# 학습 메모리",
        "- 첫 번째 핵심 규칙",
        "- 두 번째 핵심 규칙은 남은 글자 수보다 길어서 통째로 생략되어야 합니다",
    ])

    excerpt = report._memory_excerpt(memory, limit=28)

    assert excerpt == "# 학습 메모리\n- 첫 번째 핵심 규칙\n… (이하 생략)"
    assert "두 번째 핵심 규칙은 남은" not in excerpt


def test_memory_excerpt_limits_lines_and_hides_internal_markers():
    report = _load_module()
    memory = "\n".join([
        report.GROWTH_MEMORY_START,
        "[Blog Growth Signals]",
        "- 조회 신호",
        "- GA 신호",
        "- 유입 신호",
        report.GROWTH_MEMORY_END,
    ])

    excerpt = report._memory_excerpt(memory, limit=200, max_lines=3)

    assert excerpt == "[Blog Growth Signals]\n- 조회 신호\n- GA 신호\n… (이하 생략)"
    assert "blog-growth-memory" not in excerpt
