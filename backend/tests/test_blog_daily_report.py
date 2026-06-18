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
