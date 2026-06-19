import pytest

import blog_generator


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
