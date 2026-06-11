import pytest

import blog_generator


@pytest.mark.asyncio
async def test_process_content_images_removes_unprocessed_placeholders(monkeypatch):
    async def fake_generate_content_image(prompt: str):
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
