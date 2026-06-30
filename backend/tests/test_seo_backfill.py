import asyncio
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

import seo_backfill

sys.modules["db.models"].CONTENT_TYPES = (
    "MARKETING",
    "WIKI",
    "DATA",
    "DESIGN",
    "IDEA",
    "SCIENCE",
    "ESSAY",
    "DEBATE",
    "QUIZ",
    "INTRO",
)


def _post(**overrides):
    data = {
        "id": "post-1",
        "slug": "buzz-2026-06-29",
        "agent_id": "buzz",
        "title": "기존 제목",
        "content": "본문입니다. 충분한 내용이 있습니다.",
        "thumbnail_url": "thumb.jpg",
        "tags": '["tag"]',
        "published": True,
        "published_at": "2026-06-29",
        "updated_at": "2026-06-29",
        "embedding": [0.1, 0.2],
        "trending_topic": "마케팅",
        "seo_title": None,
        "summary": None,
        "seo_description": None,
        "content_type": None,
    }
    data.update(overrides)
    return SimpleNamespace(**data)


VALID_OUTPUT = """{{SEO_TITLE}}
검색 의도를 반영한 기존 글 SEO 제목입니다
{{/SEO_TITLE}}
{{SUMMARY}}
기존 본문에서 다루는 핵심 내용을 바탕으로 작성한 요약 문장입니다. 도입부 복사가 아니라 중심 내용을 정리합니다.
{{/SUMMARY}}
{{SEO_DESCRIPTION}}
기존 글의 핵심 주제와 독자가 알게 될 내용을 검색 결과용 문장으로 정리한 설명입니다. 새로운 사실은 추가하지 않습니다.
{{/SEO_DESCRIPTION}}"""


@pytest.mark.parametrize(
    "slug,agent_id,title,trending_topic,expected",
    [
        ("discovery-2026-06-30", "ka", "제목", None, "SCIENCE"),
        ("buzz-2026-06-29", "buzz", "제목", None, "MARKETING"),
        ("over-2026-06-24", "over", "제목", None, "ESSAY"),
        ("ka-2026-06-25", "ka", "제목", None, "DATA"),
        ("pixel-2026-06-26", "pixel", "제목", None, "DESIGN"),
        ("ping-2026-06-27", "ping", "제목", None, "IDEA"),
        ("wiki-2026-06-28", "wiki", "제목", None, "WIKI"),
        ("pocke-2026-07-07", "pocke", "제목", None, "SCIENCE"),
        ("ai-debate-buzz-vs-fact-2026-06-11", "buzz+fact", "제목", None, "DEBATE"),
        ("quiz/which-cosmic-hustle-ai-are-you", "plan", "제목", None, "QUIZ"),
        ("intro-cosmic-hustle-2026-06-01", "buzz+ping", "안녕, 저희가 Cosmic Hustle입니다", None, "INTRO"),
        ("unknown", "mystery", "제목", None, None),
    ],
)
def test_determine_existing_post_content_type(slug, agent_id, title, trending_topic, expected):
    assert seo_backfill.determine_existing_post_content_type(
        slug=slug,
        agent_id=agent_id,
        title=title,
        trending_topic=trending_topic,
    ) == expected


def test_prepare_existing_content_for_seo_removes_noise_and_preserves_text():
    raw = """
    # 제목
    ![대체 텍스트](https://example.com/image.jpg "title")
    <p>문단 <strong>강조</strong></p>
    [링크 텍스트](https://example.com)
    {{THUMBNAIL: a scene}}
    {{TAGS: a,b}}
    """
    prepared = seo_backfill.prepare_existing_content_for_seo(raw)
    assert "대체 텍스트" in prepared
    assert "https://example.com" not in prepared
    assert "<p>" not in prepared
    assert "링크 텍스트" in prepared
    assert "{{" not in prepared
    assert "문단 강조" in prepared


def test_prepare_existing_content_for_seo_empty_and_max_chars():
    assert seo_backfill.prepare_existing_content_for_seo("") == ""
    with pytest.raises(seo_backfill.SEOBackfillError) as exc:
        seo_backfill.prepare_existing_content_for_seo("가" * 11, max_chars=10)
    assert exc.value.reason == "content_too_long"


def test_build_existing_post_seo_prompt_contains_rules_without_generation_requests():
    prompt = seo_backfill.build_existing_post_seo_prompt(
        title="기존 제목",
        prepared_content="기존 본문",
        content_type="MARKETING",
    )
    assert "기존 제목" in prompt
    assert "기존 본문" in prompt
    assert "content_type: MARKETING" in prompt
    assert "새 본문 작성 금지" in prompt
    assert "본문에 없는 인명" in prompt
    assert "{{SEO_TITLE}}" in prompt
    assert "{{SUMMARY}}" in prompt
    assert "{{SEO_DESCRIPTION}}" in prompt
    assert "slug 생성 금지" in prompt


def test_validate_generated_seo_metadata_success_with_warning():
    raw = VALID_OUTPUT.replace("검색 의도를 반영한 기존 글 SEO 제목입니다", "짧은 제목")
    metadata = seo_backfill.validate_generated_seo_metadata(
        raw_output=raw,
        expected_content_type="MARKETING",
    )
    assert metadata["seo_title"] == "짧은 제목"
    assert metadata["content_type"] == "MARKETING"
    assert "seo_title_length_5" in metadata["warnings"]


@pytest.mark.parametrize(
    "raw,reason",
    [
        ("{{SUMMARY}}요약{{/SUMMARY}}", "seo_title_marker_count_0"),
        (VALID_OUTPUT + "\n{{SEO_TITLE}}중복 제목{{/SEO_TITLE}}", "seo_title_marker_count_2"),
        (VALID_OUTPUT.replace("검색 의도를 반영한 기존 글 SEO 제목입니다", "   "), "seo_title_empty"),
        (VALID_OUTPUT.replace("{{/SUMMARY}}", ""), "summary_marker_count_0"),
        ("앞말\n" + VALID_OUTPUT, "unexpected_text_outside_markers"),
        (VALID_OUTPUT + "\n{{SUMMARY}}", "orphan_seo_marker"),
    ],
)
def test_validate_generated_seo_metadata_failures(raw, reason):
    with pytest.raises(seo_backfill.SEOValidationError) as exc:
        seo_backfill.validate_generated_seo_metadata(
            raw_output=raw,
            expected_content_type="MARKETING",
        )
    assert exc.value.reason == reason


@pytest.mark.parametrize(
    "post,reason",
    [
        (_post(published=False), "not_published"),
        (_post(title=""), "missing_title"),
        (_post(content=""), "missing_content"),
        (_post(seo_title="t", summary="s", seo_description="d", content_type="MARKETING"), "already_completed"),
        (_post(seo_title="t"), "partial_seo_state"),
        (_post(slug="unknown", agent_id="mystery"), "unmapped_content_type"),
        (_post(slug="ai-debate-buzz-vs-fact-2026-06-11", agent_id="buzz+fact"), "special_content_deferred"),
    ],
)
def test_inspect_backfill_candidate_skips(post, reason):
    result = seo_backfill.inspect_backfill_candidate(post)
    assert result.eligible is False
    assert result.skip_reason == reason


def test_inspect_backfill_candidate_eligible():
    result = seo_backfill.inspect_backfill_candidate(_post())
    assert result.eligible is True
    assert result.content_type == "MARKETING"
    assert result.prepared_length > 0


@pytest.mark.asyncio
async def test_generate_seo_metadata_for_existing_post_uses_only_logged_llm(monkeypatch):
    calls = []

    async def fake_logged_create(client, sink, phase, **kwargs):
        calls.append((phase, kwargs))
        sink.append(
            {
                "phase": phase,
                "model": kwargs["model"],
                "input_tokens": 100,
                "output_tokens": 50,
                "cache_read_tokens": 2,
                "cache_creation_tokens": 3,
                "cost_usd": 0.001,
            }
        )
        return SimpleNamespace(content=[SimpleNamespace(type="text", text=VALID_OUTPUT)])

    monkeypatch.setattr(seo_backfill, "_logged_create", fake_logged_create)
    result = await seo_backfill.generate_seo_metadata_for_existing_post(
        title="기존 제목",
        content="기존 본문",
        agent_id="buzz",
        content_type="MARKETING",
        client=object(),
    )
    assert len(calls) == 1
    assert calls[0][0] == "seo_backfill"
    assert result["seo_title"]
    assert result["input_tokens"] == 100
    assert result["cost_usd"] == 0.001


class FakeResult:
    rowcount = 1


class FakeDB:
    def __init__(self):
        self.executed = []
        self.added = []
        self.commits = 0
        self.rollbacks = 0

    def execute(self, stmt, params):
        self.executed.append((str(stmt), params))
        return FakeResult()

    def add(self, row):
        self.added.append(row)

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1


def test_conditional_update_post_seo_preserves_updated_at():
    db = FakeDB()
    rowcount = seo_backfill.conditional_update_post_seo(
        db,
        post_id="post-1",
        metadata={
            "seo_title": "t",
            "summary": "s",
            "seo_description": "d",
            "content_type": "MARKETING",
        },
    )
    sql = db.executed[0][0]
    assert rowcount == 1
    assert "updated_at = updated_at" in sql
    assert "seo_title IS NULL" in sql
    assert "published = true" in sql


def test_apply_seo_backfill_updates_cost_and_commits():
    db = FakeDB()
    post = _post()
    metadata = {
        "seo_title": "t",
        "summary": "s",
        "seo_description": "d",
        "content_type": "MARKETING",
        "model": "model",
        "input_tokens": 1,
        "output_tokens": 2,
        "cache_read_tokens": 3,
        "cache_creation_tokens": 4,
        "cost_usd": 0.01,
    }
    cost_calls = []

    def fake_cost(db_arg, **kwargs):
        cost_calls.append(kwargs)

    seo_backfill.apply_seo_backfill(db, post=post, metadata=metadata, cost_func=fake_cost)
    assert db.commits == 1
    assert db.rollbacks == 0
    assert cost_calls[0]["post_id"] == "post-1"
    assert post.title == "기존 제목"
    assert post.content.startswith("본문")
    assert post.slug == "buzz-2026-06-29"
    assert post.updated_at == "2026-06-29"


def test_apply_seo_backfill_rowcount_zero_rolls_back():
    db = FakeDB()

    def fake_update(*args, **kwargs):
        return 0

    with pytest.raises(seo_backfill.SEOBackfillError) as exc:
        seo_backfill.apply_seo_backfill(
            db,
            post=_post(),
            metadata={"seo_title": "t", "summary": "s", "seo_description": "d", "content_type": "MARKETING"},
            update_func=fake_update,
        )
    assert exc.value.exit_code == seo_backfill.EXIT_CONCURRENT_UPDATE
    assert db.rollbacks == 1


def test_apply_seo_backfill_cost_failure_rolls_back():
    db = FakeDB()

    def fail_cost(*args, **kwargs):
        raise RuntimeError("cost failed")

    with pytest.raises(seo_backfill.SEOBackfillError) as exc:
        seo_backfill.apply_seo_backfill(
            db,
            post=_post(),
            metadata={"seo_title": "t", "summary": "s", "seo_description": "d", "content_type": "MARKETING"},
            cost_func=fail_cost,
        )
    assert exc.value.exit_code == seo_backfill.EXIT_TRANSACTION
    assert db.rollbacks == 1


def test_cli_inspect_uses_no_llm_or_write(monkeypatch, capsys):
    from scripts import backfill_blog_seo

    fake_db = SimpleNamespace(close=AsyncMock())
    fake_query = SimpleNamespace(filter=lambda *a, **k: SimpleNamespace(first=lambda: _post()))
    fake_db.query = lambda model: fake_query
    fake_db.close = lambda: None
    monkeypatch.setattr(backfill_blog_seo, "SessionLocal", lambda: fake_db)
    monkeypatch.setattr(backfill_blog_seo, "BlogPost", SimpleNamespace(id="id"))
    monkeypatch.setattr(backfill_blog_seo, "generate_seo_metadata_for_existing_post", AsyncMock())
    code = backfill_blog_seo.main(["--inspect", "--post-id", "post-1"])
    out = capsys.readouterr().out
    assert code == 0
    assert '"mode": "inspect"' in out
    backfill_blog_seo.generate_seo_metadata_for_existing_post.assert_not_called()


def test_cli_generate_without_save_calls_llm_but_not_apply(monkeypatch, capsys):
    from scripts import backfill_blog_seo

    fake_db = SimpleNamespace(close=lambda: None)
    fake_query = SimpleNamespace(filter=lambda *a, **k: SimpleNamespace(first=lambda: _post()))
    fake_db.query = lambda model: fake_query
    metadata = {
        "seo_title": "t",
        "summary": "s",
        "seo_description": "d",
        "content_type": "MARKETING",
        "warnings": [],
    }
    monkeypatch.setattr(backfill_blog_seo, "SessionLocal", lambda: fake_db)
    monkeypatch.setattr(backfill_blog_seo, "BlogPost", SimpleNamespace(id="id"))
    monkeypatch.setattr(backfill_blog_seo, "generate_seo_metadata_for_existing_post", AsyncMock(return_value=metadata))
    monkeypatch.setattr(backfill_blog_seo, "apply_seo_backfill", AsyncMock())
    code = backfill_blog_seo.main(["--generate-without-save", "--post-id", "post-1"])
    out = capsys.readouterr().out
    assert code == 0
    assert '"mode": "generate-without-save"' in out
    backfill_blog_seo.apply_seo_backfill.assert_not_called()


def test_cli_apply_single_post(monkeypatch, capsys):
    from scripts import backfill_blog_seo

    fake_db = SimpleNamespace(close=lambda: None)
    fake_query = SimpleNamespace(filter=lambda *a, **k: SimpleNamespace(first=lambda: _post()))
    fake_db.query = lambda model: fake_query
    metadata = {
        "seo_title": "t",
        "summary": "s",
        "seo_description": "d",
        "content_type": "MARKETING",
        "warnings": [],
    }
    apply_mock = MagicMock()
    monkeypatch.setattr(backfill_blog_seo, "SessionLocal", lambda: fake_db)
    monkeypatch.setattr(backfill_blog_seo, "BlogPost", SimpleNamespace(id="id"))
    monkeypatch.setattr(backfill_blog_seo, "generate_seo_metadata_for_existing_post", AsyncMock(return_value=metadata))
    monkeypatch.setattr(backfill_blog_seo, "apply_seo_backfill", apply_mock)
    code = backfill_blog_seo.main(["--apply", "--post-id", "post-1"])
    out = capsys.readouterr().out
    assert code == 0
    assert '"mode": "apply"' in out
    assert '"saved": true' in out
    assert apply_mock.call_count == 1


def test_cli_argument_error_for_multiple_modes():
    from scripts import backfill_blog_seo

    code = backfill_blog_seo.main(["--inspect", "--apply", "--post-id", "post-1"])
    assert code == seo_backfill.EXIT_ARGUMENT


def test_cli_help_does_not_open_session(monkeypatch, capsys):
    from scripts import backfill_blog_seo

    session_mock = MagicMock(side_effect=AssertionError("SessionLocal should not be called"))
    monkeypatch.setattr(backfill_blog_seo, "SessionLocal", session_mock)
    code = backfill_blog_seo.main(["--help"])
    out = capsys.readouterr().out
    assert code == seo_backfill.EXIT_SUCCESS
    assert "usage:" in out
    session_mock.assert_not_called()


def test_apply_seo_backfill_commit_failure_rolls_back():
    db = FakeDB()

    def fail_commit():
        raise RuntimeError("commit failed")

    db.commit = fail_commit
    with pytest.raises(seo_backfill.SEOBackfillError) as exc:
        seo_backfill.apply_seo_backfill(
            db,
            post=_post(),
            metadata={"seo_title": "t", "summary": "s", "seo_description": "d", "content_type": "MARKETING"},
        )
    assert exc.value.exit_code == seo_backfill.EXIT_TRANSACTION
    assert db.rollbacks == 1
