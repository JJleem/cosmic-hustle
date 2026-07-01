import importlib.util
import asyncio
from datetime import date
from pathlib import Path


def _load_module():
    path = Path(__file__).parents[1] / "ga_monthly.py"
    spec = importlib.util.spec_from_file_location("ga_monthly_under_test", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_default_month_range_uses_kst_calendar_day():
    ga_monthly = _load_module()

    start, end = ga_monthly._default_month_range(date(2026, 7, 1))

    assert (start, end) == ("2026-06-01", "2026-06-30")


def test_has_ga_metrics_treats_empty_response_as_unusable():
    ga_monthly = _load_module()

    assert ga_monthly._has_ga_metrics({}, [], [], []) is False
    assert ga_monthly._has_ga_metrics({"sessions": 0, "page_views": 0}, [], [], []) is True
    assert ga_monthly._has_ga_metrics({}, [{"path": "/x"}], [], []) is True


def test_trim_complete_lines_does_not_cut_mid_line():
    ga_monthly = _load_module()
    text = "첫 줄\n두 번째 줄은 유지\n세 번째 줄은 너무 길어서 통째로 빠져야 합니다"

    trimmed = ga_monthly._trim_complete_lines(text, limit=18)

    assert trimmed == "첫 줄\n두 번째 줄은 유지\n... (이하 생략)"
    assert "세 번째 줄은" not in trimmed


def test_run_monthly_skips_ai_memory_when_ga_has_no_rows(monkeypatch):
    ga_monthly = _load_module()
    calls = {"analyze": 0, "memory": 0, "email": None}

    import ga_client

    monkeypatch.setattr(ga_client, "fetch_site_overview", lambda start, end: {})
    monkeypatch.setattr(ga_client, "fetch_page_metrics", lambda start, end, limit=20: [])
    monkeypatch.setattr(ga_client, "fetch_channel_metrics", lambda start, end: [])
    monkeypatch.setattr(ga_client, "fetch_device_metrics", lambda start, end: [])

    async def _fake_analyze(*args, **kwargs):
        calls["analyze"] += 1
        return "should not run"

    async def _fake_memory(*args, **kwargs):
        calls["memory"] += 1

    def _fake_email(*args, **kwargs):
        calls["email"] = kwargs

    monkeypatch.setattr(ga_monthly, "_analyze_with_ka", _fake_analyze)
    monkeypatch.setattr(ga_monthly, "_update_agent_memories", _fake_memory)
    monkeypatch.setattr(ga_monthly, "_send_email", _fake_email)

    result = asyncio.run(ga_monthly.run_monthly_ga_report("2026-06-01", "2026-06-30"))

    assert result["ok"] is True
    assert result["memory_updated"] is False
    assert calls["analyze"] == 0
    assert calls["memory"] == 0
    assert calls["email"] == {"memory_updated": False}
