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


def test_engaged_post_ids_include_comment_only_posts():
    report = _load_module()

    post_ids = report._merge_engaged_post_ids(
        daily_views={"viewed": 2},
        human_comments={"comment-only": 1, "viewed": 1},
        human_likes={"liked-only": 1},
    )

    assert post_ids == ["viewed", "comment-only", "liked-only"]


def test_render_report_hides_empty_gsc_section_and_limits_headlines():
    report = _load_module()
    snapshot = {
        "date": "2026-06-30",
        "generated_date": "2026-07-01",
        "today_visits": 12,
        "yesterday_visits": 13,
        "week_visits": 72,
        "total_visits": 1091,
        "unique_post_views_today": 12,
        "top_tags": [("discovery", 3)],
        "recent_trends": [("마케팅", 1)],
        "top_posts": [
            {"title": "눈을 버렸더니 세상이 보였다", "views": 3, "likes": 2, "comments": 1},
        ],
    }
    headlines = [
        {"query": "AI 트렌드", "title": "첫 번째"},
        {"query": "AI 트렌드", "title": "두 번째"},
        {"query": "AI 트렌드", "title": "세 번째"},
        {"query": "AI 트렌드", "title": "네 번째"},
    ]

    text = report.render_buzz_report(
        snapshot,
        headlines,
        ga={"ok": False, "error": "missing"},
        access_logs={"ok": True, "total_lines_today": 0, "bot_hits": 0, "bot_ratio": 0},
        bot_signals=[],
        judgement="추천 슬롯: trend_reaction\n이유: 짧게 봅니다",
        gsc={"ok": True, "title_fix_candidates": []},
    )

    assert "제목 보강 후보" not in text
    assert "네 번째" not in text


def test_truncate_complete_lines_never_cuts_title_mid_line():
    report = _load_module()
    text = "\n".join([
        "추천 슬롯: trend_reaction",
        "이유: 데이터는 아직 얇습니다",
        "제목 후보: 1. 눈을 버렸더니 세상이 보였다 2. 동굴 생물은 왜 눈을 포기했나 3. 진화는 손실일까 최적화일까",
    ])

    truncated = report._truncate_complete_lines(text, limit=45)

    assert truncated == "추천 슬롯: trend_reaction\n이유: 데이터는 아직 얇습니다\n… (이하 생략)"
    assert "제목 후보: 1. 눈을" not in truncated


def test_ai_debate_guard_requires_enough_human_comments_or_debate_post():
    report = _load_module()
    snapshot = {
        "top_posts": [
            {"title": "과학 글", "comments": 1, "content_type": "SCIENCE"},
        ],
    }

    guarded = report._guard_buzz_judgement("추천 슬롯: ai_debate\n이유: 토론", snapshot, ["GA 이탈률 100%"])

    assert "추천 슬롯: trend_reaction" in guarded
    assert "추천 슬롯: ai_debate" not in guarded
