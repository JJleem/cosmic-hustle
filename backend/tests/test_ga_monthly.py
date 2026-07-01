import importlib.util
import asyncio
from datetime import date
from email import message_from_string
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
        return {"ok": True}

    monkeypatch.setattr(ga_monthly, "_analyze_with_ka", _fake_analyze)
    monkeypatch.setattr(ga_monthly, "_update_agent_memories", _fake_memory)
    monkeypatch.setattr(ga_monthly, "_send_email", _fake_email)

    result = asyncio.run(ga_monthly.run_monthly_ga_report("2026-06-01", "2026-06-30"))

    assert result["ok"] is True
    assert result["memory_updated"] is False
    assert result["email"] == {"ok": True}
    assert calls["analyze"] == 0
    assert calls["memory"] == 0
    assert calls["email"] == {"pages": [], "channels": [], "devices": [], "memory_updated": False}


def test_run_monthly_can_send_without_updating_memory(monkeypatch):
    ga_monthly = _load_module()
    calls = {"memory": 0, "email": None}

    import ga_client

    monkeypatch.setattr(ga_client, "fetch_site_overview", lambda start, end: {"sessions": 10, "total_users": 8, "new_users": 7, "bounce_rate": 25.0, "avg_session_sec": 120, "page_views": 30})
    monkeypatch.setattr(ga_client, "fetch_page_metrics", lambda start, end, limit=20: [{"path": "/a", "sessions": 5, "bounce_rate": 20.0, "avg_session_sec": 60, "page_views": 9}])
    monkeypatch.setattr(ga_client, "fetch_channel_metrics", lambda start, end: [{"channel": "Referral", "sessions": 10, "bounce_rate": 10.0}])
    monkeypatch.setattr(ga_client, "fetch_device_metrics", lambda start, end: [{"device": "mobile", "sessions": 10, "bounce_rate": 20.0, "avg_session_sec": 90}])

    async def _fake_memory(*args, **kwargs):
        calls["memory"] += 1

    def _fake_email(*args, **kwargs):
        calls["email"] = kwargs
        return {"ok": True}

    monkeypatch.setattr(ga_monthly, "_update_agent_memories", _fake_memory)
    monkeypatch.setattr(ga_monthly, "_send_email", _fake_email)

    result = asyncio.run(ga_monthly.run_monthly_ga_report("2026-06-01", "2026-06-30", update_memory=False))

    assert result["ok"] is True
    assert result["memory_updated"] is False
    assert calls["memory"] == 0
    assert calls["email"]["channels"] == [{"channel": "Referral", "sessions": 10, "bounce_rate": 10.0}]


def test_email_html_renders_lists_without_markdown(monkeypatch):
    ga_monthly = _load_module()
    sent = {}

    class FakeSMTP:
        def __init__(self, host, port):
            sent["host"] = host
            sent["port"] = port

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def starttls(self):
            sent["tls"] = True

        def login(self, user, password):
            sent["login"] = (user, password)

        def sendmail(self, from_addr, to_addrs, raw):
            sent["raw"] = raw

    monkeypatch.setattr(ga_monthly.smtplib, "SMTP", FakeSMTP)
    monkeypatch.setenv("SMTP_USER", "from@example.com")
    monkeypatch.setenv("SMTP_PASSWORD", "pw")
    monkeypatch.setenv("REPORT_EMAIL", "to@example.com")

    result = ga_monthly._send_email(
        "2026-06-01 ~ 2026-06-30",
        {"sessions": 448, "total_users": 189, "page_views": 3567, "bounce_rate": 30.8, "avg_session_sec": 666, "new_users": 188},
        [{"path": "/discovery", "bounce_rate": 100.0, "avg_session_sec": 90, "sessions": 6}],
        "찾았다. **마크다운** 없이 표시\n핵심 1. 완료된 문장입니다.",
        "버즈 판단. 완료된 문장입니다.\n최우선 실험. B안도 끝까지 완성된 문장입니다.",
        pages=[{"path": "/discovery", "bounce_rate": 100.0, "avg_session_sec": 90, "sessions": 6, "page_views": 12}],
        channels=[{"channel": "Referral", "sessions": 194, "bounce_rate": 18.6}],
        devices=[{"device": "mobile", "sessions": 56, "bounce_rate": 20.0, "avg_session_sec": 130}],
    )

    msg = message_from_string(sent["raw"])
    html_part = next(part for part in msg.walk() if part.get_content_type() == "text/html")
    html_body = html_part.get_payload(decode=True).decode("utf-8")

    assert "<ul>" in html_body
    assert "<li" in html_body
    assert "white-space:pre-wrap" not in html_body
    assert "**" not in html_body
    assert "B안도 끝까지 완성된 문장입니다." in html_body
    assert result == {"ok": True, "to": "to@example.com"}
    assert "핵심 해석" in html_body
    assert "상위 페이지 지표" in html_body
    assert "유입 채널" in html_body
    assert "기기별 체류" in html_body
    assert "이번 달 실행 체크리스트" in html_body
    assert "Referral" in html_body
