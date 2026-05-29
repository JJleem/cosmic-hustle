"""11명 캐릭터 단체사진 OG 이미지 생성 스크립트.

실행: backend/ 디렉토리에서
  .venv/bin/python scripts/generate_og_image.py

결과: backend/static/blog/og-image.png
"""
import asyncio
import os
import sys
import uuid
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env")

from PIL import Image

# ── 캐릭터 순서 ────────────────────────────────────────────────────────────────
BACK_ROW  = ["plan", "wiki", "pocke", "ka", "over"]
FRONT_ROW = ["buzz", "pixel", "ping", "fact", "root", "run"]

CHAR_DIR  = Path(__file__).parent.parent / "characters"
OUT_DIR   = Path(__file__).parent.parent / "static" / "blog"
OUT_PATH  = OUT_DIR / "og-image.png"
OUT_PATH2 = OUT_DIR / "og-image-2.png"
OUT_FINAL = OUT_DIR / "og-image-final.png"

# ── 레퍼런스 합성 ──────────────────────────────────────────────────────────────

def _make_composite(names: list[str]) -> Path:
    """캐릭터를 2열로 배치한 레퍼런스 합성 이미지 생성.
    뒷줄: 약간 작게 위쪽 / 앞줄: 크게 아래쪽.
    """
    # 절반씩 나눔 (홀수면 앞줄이 1명 더)
    mid       = len(names) // 2
    back_row  = names[:mid]
    front_row = names[mid:]

    FRONT_H  = 380
    BACK_H   = int(FRONT_H * 0.80)
    CANVAS_W = 1800
    CANVAS_H = 720
    BG       = (240, 238, 255, 255)

    canvas = Image.new("RGBA", (CANVAS_W, CANVAS_H), BG)

    def _place_row(row_names: list[str], char_h: int, y_top: int):
        imgs = []
        for name in row_names:
            img = Image.open(CHAR_DIR / name / "default.png").convert("RGBA")
            ratio = char_h / img.height
            img = img.resize((int(img.width * ratio), char_h), Image.LANCZOS)
            imgs.append(img)
        total_w = sum(i.width for i in imgs)
        gap = max(10, (CANVAS_W - total_w) // (len(imgs) + 1))
        x = gap
        for img in imgs:
            canvas.paste(img, (x, y_top), img)
            x += img.width + gap

    _place_row(back_row,  BACK_H,  30)                          # 뒷줄: 위
    _place_row(front_row, FRONT_H, CANVAS_H - FRONT_H - 20)     # 앞줄: 아래

    tmp = Path(tempfile.mktemp(suffix=".png"))
    canvas.save(tmp, "PNG")
    print(f"레퍼런스 합성 완료: {tmp} ({CANVAS_W}×{CANVAS_H}, 뒷줄 {len(back_row)}명 / 앞줄 {len(front_row)}명)")
    return tmp


def _merge_two_images(path1: Path, path2: Path) -> Path:
    """두 이미지를 각각 600x630으로 맞춰 좌우 합성. 결과: 1200x630."""
    import numpy as np

    HALF_W  = 600
    TARGET_H = 630
    BLEND_W  = 160

    def _fit(img: Image.Image) -> Image.Image:
        """600x630으로 강제 리사이즈 (비율 약간 왜곡 허용)."""
        return img.resize((HALF_W, TARGET_H), Image.LANCZOS)

    left  = np.array(_fit(Image.open(path1).convert("RGB")), dtype=np.float32)
    right = np.array(_fit(Image.open(path2).convert("RGB")), dtype=np.float32)

    # 블렌드 구간: left 오른쪽 BLEND_W + right 왼쪽 BLEND_W
    l_blend = left[:, HALF_W - BLEND_W:, :]
    r_blend = right[:, :BLEND_W, :]
    alpha   = np.linspace(0, 1, BLEND_W)[np.newaxis, :, np.newaxis]
    blended = (l_blend * (1 - alpha) + r_blend * alpha).astype(np.uint8)

    l_arr = left[:, :HALF_W - BLEND_W, :].astype(np.uint8)
    r_arr = right[:, BLEND_W:, :].astype(np.uint8)
    full  = np.concatenate([l_arr, blended, r_arr], axis=1)  # 1200x630

    out = Path(tempfile.mktemp(suffix=".png"))
    Image.fromarray(full).save(out, "PNG")
    print(f"두 이미지 합성 완료: {out} (1200x630)")
    return out


# ── FAL 업로드 + Flux Kontext ─────────────────────────────────────────────────

async def _generate(composite_path: Path) -> str:
    import fal_client

    print("FAL에 레퍼런스 이미지 업로드 중...")
    ref_url = await asyncio.to_thread(fal_client.upload_file, str(composite_path))
    print(f"업로드 완료: {ref_url[:60]}...")

    prompt = (
        "Recreate ALL ELEVEN cartoon characters from the reference image exactly as shown, "
        "arranged in TWO ROWS: back row of 5 characters standing slightly behind and higher, "
        "front row of 6 characters in front and lower — a classic group photo composition. "
        "Each character has a relaxed, natural pose: some leaning on each other, "
        "some giving a thumbs up, some waving, some grinning sideways — "
        "casual and full of personality, NOT stiff or standing straight. "
        "All faces show warm happy expressions. Framed at chest/waist level, upper body visible. "
        "Background: soft bokeh cosmic space — deep purple-blue sky, glowing nebulae, "
        "distant stars and planets softly out of focus. "
        "No text, no banners. Warm soft front lighting, Pixar 3D animation style, "
        "high quality render, 16:9 aspect ratio."
    )

    print("Flux Kontext 이미지 생성 중... (최대 2분)")
    result = await asyncio.wait_for(
        asyncio.to_thread(
            fal_client.subscribe,
            "fal-ai/flux-kontext/dev",
            arguments={
                "image_url":           ref_url,
                "prompt":              prompt,
                "num_inference_steps": 35,
                "guidance_scale":      4.0,
                "aspect_ratio":        "16:9",
            },
        ),
        timeout=180.0,
    )
    return result["images"][0]["url"]


async def _download(url: str, dest: Path):
    import httpx
    print(f"다운로드 중: {url[:60]}...")
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        dest.write_bytes(resp.content)


async def main():
    import sys
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    mode = sys.argv[1] if len(sys.argv) > 1 else "second"

    if mode == "first":
        # 1차: 전체 11명 레퍼런스로 생성 (기존 방식)
        chars = BACK_ROW + FRONT_ROW
        composite = _make_composite(chars)
        try:
            fal_url = await _generate(composite)
        finally:
            composite.unlink(missing_ok=True)
        await _download(fal_url, OUT_PATH)
        print(f"\n1차 완료! → {OUT_PATH}")

    elif mode == "second":
        # 2차: 나머지 6명만 생성
        second_chars = ["wiki", "run", "ping", "fact", "plan", "over"]
        print(f"2차 생성: {second_chars}")
        composite = _make_composite(second_chars)
        try:
            fal_url = await _generate(composite)
        finally:
            composite.unlink(missing_ok=True)
        await _download(fal_url, OUT_PATH2)
        print(f"\n2차 완료! → {OUT_PATH2}")

    elif mode == "merge":
        # 두 이미지 합성
        if not OUT_PATH.exists():
            print(f"1차 이미지 없음: {OUT_PATH}")
            return
        if not OUT_PATH2.exists():
            print(f"2차 이미지 없음: {OUT_PATH2}")
            return
        merged = _merge_two_images(OUT_PATH, OUT_PATH2)
        import shutil
        shutil.copy(merged, OUT_FINAL)
        merged.unlink(missing_ok=True)
        print(f"\n최종 합성 완료! → {OUT_FINAL}")
        print(f"서버 URL: http://3.36.239.214:8000/static/blog/og-image-final.png")

    elif mode == "all":
        # 전체 자동 실행: second → merge
        second_chars = ["wiki", "run", "ping", "fact", "plan", "over"]
        composite = _make_composite(second_chars)
        try:
            fal_url = await _generate(composite)
        finally:
            composite.unlink(missing_ok=True)
        await _download(fal_url, OUT_PATH2)
        print(f"2차 완료! → {OUT_PATH2}")

        merged = _merge_two_images(OUT_PATH, OUT_PATH2)
        import shutil
        shutil.copy(merged, OUT_FINAL)
        merged.unlink(missing_ok=True)
        print(f"\n최종 합성 완료! → {OUT_FINAL}")
        print(f"서버 URL: http://3.36.239.214:8000/static/blog/og-image-final.png")


if __name__ == "__main__":
    if not os.environ.get("FAL_KEY"):
        print("FAL_KEY 없음. .env 확인.")
        sys.exit(1)
    asyncio.run(main())
