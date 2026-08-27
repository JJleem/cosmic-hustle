import pytest

import blog_generator


def test_thumbnail_styles_do_not_invite_written_surfaces():
    risky = ("poster", "panel", "magazine", "card", "sign", "screen", "chalkboard")
    for style in blog_generator._THUMBNAIL_STYLES:
        prompt = f"{style['prefix']} {style['suffix']}".lower()
        assert not any(word in prompt for word in risky)


def test_sanitize_thumbnail_prompt_removes_writing_surfaces_and_cjk():
    prompt = 'character points at a neon sign saying "SALE" beside a 간판 and 中文 poster'
    clean = blog_generator._sanitize_thumbnail_scene_prompt(prompt)

    assert "sign" not in clean.lower()
    assert "poster" not in clean.lower()
    assert "SALE" not in clean
    assert "간판" not in clean
    assert "中文" not in clean


@pytest.mark.asyncio
async def test_thumbnail_retries_once_when_glyph_guard_rejects(monkeypatch):
    monkeypatch.setenv("FAL_KEY", "test")

    async def fake_upload(agent_id):
        return "https://example.com/character.png"

    calls = []
    async def fake_generate(char_url, prompt, sink=None):
        calls.append(prompt)
        return f"http://backend/static/blog/thumb-{len(calls)}.png"

    verdicts = iter([True, False])
    async def fake_guard(url, sink=None):
        return next(verdicts)

    monkeypatch.setattr(blog_generator, "_upload_character", fake_upload)
    monkeypatch.setattr(blog_generator, "_run_thumbnail_generation", fake_generate)
    monkeypatch.setattr(blog_generator, "_thumbnail_has_glyphs", fake_guard)
    monkeypatch.setattr(blog_generator, "_discard_local_image", lambda url: None)

    result = await blog_generator._generate_thumbnail("buzz", "holding a blank orb")

    assert result.endswith("thumb-2.png")
    assert len(calls) == 2


@pytest.mark.asyncio
@pytest.mark.parametrize("retry_verdict", [True, None])
async def test_thumbnail_keeps_retry_when_guard_cannot_produce_a_clean_result(monkeypatch, retry_verdict):
    monkeypatch.setenv("FAL_KEY", "test")

    async def fake_upload(agent_id):
        return "https://example.com/character.png"

    calls = []
    async def fake_generate(char_url, prompt, sink=None):
        calls.append(prompt)
        return f"http://backend/static/blog/thumb-{len(calls)}.png"

    verdicts = iter([True, retry_verdict])
    async def fake_guard(url, sink=None):
        return next(verdicts)

    discarded = []
    monkeypatch.setattr(blog_generator, "_upload_character", fake_upload)
    monkeypatch.setattr(blog_generator, "_run_thumbnail_generation", fake_generate)
    monkeypatch.setattr(blog_generator, "_thumbnail_has_glyphs", fake_guard)
    monkeypatch.setattr(blog_generator, "_discard_local_image", discarded.append)

    result = await blog_generator._generate_thumbnail("ka", "holding a blank orb")

    assert result.endswith("thumb-2.png")
    assert discarded == ["http://backend/static/blog/thumb-1.png"]


@pytest.mark.asyncio
async def test_thumbnail_keeps_generated_image_when_glyph_guard_is_unavailable(monkeypatch):
    monkeypatch.setenv("FAL_KEY", "test")

    async def fake_upload(agent_id):
        return "https://example.com/character.png"

    async def fake_generate(char_url, prompt, sink=None):
        return "http://backend/static/blog/thumb.png"

    async def fake_guard(url, sink=None):
        return None

    discarded = []
    monkeypatch.setattr(blog_generator, "_upload_character", fake_upload)
    monkeypatch.setattr(blog_generator, "_run_thumbnail_generation", fake_generate)
    monkeypatch.setattr(blog_generator, "_thumbnail_has_glyphs", fake_guard)
    monkeypatch.setattr(blog_generator, "_discard_local_image", discarded.append)

    result = await blog_generator._generate_thumbnail("ka", "holding a blank orb")

    assert result == "http://backend/static/blog/thumb.png"
    assert discarded == []


@pytest.mark.asyncio
async def test_process_content_images_removes_unprocessed_placeholders(monkeypatch):
    async def fake_generate_content_image(prompt: str, cheap: bool = False, sink=None):
        return f"https://example.com/{prompt}.png"

    monkeypatch.setattr(blog_generator, "_generate_content_image", fake_generate_content_image)

    content = "\n".join(
        f"section {index}\n{{{{IMAGE: scene-{index}}}}}"
        for index in range(1, 4)
    )

    result = await blog_generator._process_content_images(content, "buzz", limit=2)

    assert "![이미지](https://example.com/scene-1.png)" in result
    assert "![이미지](https://example.com/scene-2.png)" in result
    assert "{{IMAGE:" not in result
    assert "scene-3" not in result


@pytest.mark.asyncio
async def test_process_content_images_zero_limit_removes_placeholders(monkeypatch):
    async def fail_if_called(prompt: str, cheap: bool = False):
        raise AssertionError("image generation should not run")

    monkeypatch.setattr(blog_generator, "_generate_content_image", fail_if_called)

    result = await blog_generator._process_content_images(
        "intro\n{{IMAGE: expensive scene}}\noutro",
        "buzz",
        limit=0,
    )

    assert result == "intro\n\noutro"


@pytest.mark.asyncio
async def test_process_content_images_negative_limit_processes_all(monkeypatch):
    async def fake_generate_content_image(prompt: str, cheap: bool = False, sink=None):
        return f"https://example.com/{prompt}-{cheap}.png"

    monkeypatch.setattr(blog_generator, "_generate_content_image", fake_generate_content_image)

    content = "{{IMAGE: one}}\n{{IMAGE: two}}\n{{IMAGE: three}}"

    result = await blog_generator._process_content_images(content, "buzz", limit=-1, cheap=True)

    assert result.count("![이미지](") == 3
    assert "{{IMAGE:" not in result
    assert "one-True.png" in result
    assert "three-True.png" in result


def test_clamp_span_colors_brightens_near_black():
    # 다크모드 배경에 묻히던 거의 검정(#1a1a1a)이 읽히는 명도로 보정돼야 함
    out = blog_generator._clamp_span_colors('<span style="color:#1a1a1a">먹색</span>')
    assert "#1a1a1a" not in out
    # 6자리 hex를 3자리로 잘못 매칭하지 않아야 함(회귀): 결과가 무채색 회색이어야
    m = blog_generator._SPAN_COLOR_RE.search(out)
    r, g, b = (int(m.group(2)[i:i + 2], 16) for i in (0, 2, 4))
    assert r == g == b and r > 0x40


def test_clamp_span_colors_keeps_palette_accents():
    # 밴드 안의 팔레트 강조색은 손대지 않음
    for hex_color in ("#F97316", "#FACC15", "#6EE7B7", "#EF4444", "#60A5FA"):
        src = f'<span style="color:{hex_color}">x</span>'
        assert blog_generator._clamp_span_colors(src) == src

def test_rotation_index_advances_every_week():
    # 회귀: day_index 기반이던 시절 주 1회 발행 에이전트는 %7이 요일에 고정돼
    # 오버가 '반박형'만 반복했다(2026-06-03 == 2026-07-29). 주 단위 인덱스는 매주 +1이어야 함.
    from datetime import date, timedelta
    base = date(2026, 7, 29)
    idx = [blog_generator._rotation_index(base + timedelta(days=7 * w)) for w in range(5)]
    assert idx == [idx[0] + w for w in range(5)]
    assert blog_generator._rotation_index(base, offset=2) == idx[0] + 2


def test_over_format_emotion_pair_does_not_repeat_within_a_year():
    # 형식 11 · 감정 13(서로소) → 조합 주기 143주. 1년(52주) 안에는 같은 조합이 없어야 함.
    from datetime import date, timedelta
    fmts, emos = blog_generator.OVER_ESSAY_FORMATS, blog_generator.OVER_EMOTIONS
    seen = set()
    for w in range(52):
        r = blog_generator._rotation_index(date(2026, 7, 29) + timedelta(days=7 * w))
        pair = (r % len(fmts), (r + 3) % len(emos))
        assert pair not in seen, f"{w}주 뒤 형식·감정 조합 재현: {pair}"
        seen.add(pair)
