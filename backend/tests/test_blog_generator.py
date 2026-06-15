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
