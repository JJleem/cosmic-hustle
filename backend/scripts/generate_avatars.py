"""
일회성 아바타 생성 스크립트.
실행: cd backend && .venv/bin/python scripts/generate_avatars.py
"""
import os
import asyncio
import httpx
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

import fal_client

OUTPUT_DIR = Path(__file__).parent.parent / "static" / "avatars"

AVATARS = [
    # (번호, 프롬프트)
    (0,  "a chubby orange alien with three blinking eyes and tiny antennae, wearing a oversized knitted sweater, confused expression"),
    (1,  "a tall thin blue alien with a huge grin and springy legs, wearing a striped scarf, waving enthusiastically"),
    (2,  "a round purple blob creature with stubby arms, wearing tiny round glasses, reading a miniature book"),
    (3,  "a small green alien with enormous ears like satellite dishes, wearing a backwards cap, giving thumbs up"),
    (4,  "a fluffy pink alien with a curly tail and star-shaped spots, wearing a polka dot bow tie, giggling"),
    (5,  "a grey alien with a square head and pixel-art eyes, wearing a hoodie, holding a tiny controller"),
    (6,  "a yellow alien shaped like a pear with noodle arms, wearing overalls, eating space noodles"),
    (7,  "a tiny red alien with a giant head and big teary eyes, wrapped in a cozy blanket, sneezing"),
    (8,  "a turquoise alien with tentacle hair and freckles, wearing a lab coat, holding a glowing beaker"),
    (9,  "a white fluffy alien that looks like a cloud with cute dot eyes, floating sleepily"),
    (10, "a brown alien with mushroom-shaped head, wearing a raincoat, looking surprised at an umbrella"),
    (11, "a lavender alien with bunny ears and a puffy tail, wearing pajamas, yawning"),
    (12, "a neon green alien with zigzag antennae, wearing a cowboy hat, pointing dramatically"),
    (13, "a dark blue alien with glowing moon-shaped eyes, wearing a turtleneck, looking mysterious"),
    (14, "a coral pink alien with four tiny arms, juggling miniature planets, sweating nervously"),
    (15, "a striped orange and white alien like a candy cane, wearing a party hat, blowing a noisemaker"),
    (16, "a silver metallic alien with a domed head and blinking LED eyes, wearing a tiny apron, cooking"),
    (17, "a lime green alien with a squishy body and suction cup feet, wearing roller skates, wobbling"),
    (18, "a dusty purple alien with spiral horns, wearing a detective coat, holding a magnifying glass"),
    (19, "a sky blue alien made of geometric shapes, wearing a beret, painting a tiny canvas"),
    (20, "a red alien with a round belly and zigzag mouth, wearing a cape, trying to fly but falling"),
    (21, "a mint green alien with jellyfish-like frills, wearing a sailor uniform, saluting"),
    (22, "a golden alien with sun-ray spikes around its head, wearing sunglasses, lounging in a hammock"),
    (23, "a dark green alien shaped like a cactus with googly eyes, wearing sandals, sweating"),
    (24, "a lavender alien with a snail shell on its back, wearing a scarf, moving very slowly"),
    (25, "a plump teal alien with polka dot skin, wearing a chef hat, sniffing a giant spoon"),
    (26, "a hot pink alien with a lightning bolt pattern, wearing a tracksuit, doing a victory pose"),
    (27, "a pale yellow alien with dandelion fluff on its head, wearing dungarees, blowing seeds"),
    (28, "a charcoal alien with star-shaped pupils, wearing a formal suit jacket with pajama pants"),
    (29, "a cobalt blue alien with fish fins, wearing a diving suit on land, looking confused"),
    (30, "a peach alien shaped like a dumpling with a grumpy face, wearing a tiny crown"),
    (31, "a forest green alien with leaf wings, wearing cargo pants, carrying a huge backpack"),
    (32, "a rose gold alien with spring-loaded legs, wearing a tracksuit, bouncing uncontrollably"),
    (33, "a cream colored alien with tiger stripes, wearing a karate belt, doing a stance"),
    (34, "a deep purple alien with galaxy swirl patterns, wearing a wizard robe, looking confused at a wand"),
    (35, "a bright orange alien with spring antennae that have hearts on tips, wearing a cardigan, blushing"),
    (36, "a slate grey alien with a zipper mouth, wearing a raincoat, getting hit by indoor rain somehow"),
    (37, "a bubblegum pink alien with floating hair, wearing a crop top, taking a selfie"),
    (38, "a mossy green alien that looks like a potato, wearing a beanie, looking proud of nothing"),
    (39, "a cyan alien with peacock-feather tail, wearing a vest, strutting importantly"),
    (40, "a maroon alien with corkscrew horns, wearing suspenders, carrying stacked books taller than itself"),
    (41, "a butter yellow alien with a wobbly antenna with a bell, wearing a apron, ringing itself by mistake"),
    (42, "a indigo alien with kaleidoscope eyes, wearing a trench coat, looking dramatically into distance"),
    (43, "a pastel green alien shaped like a teardrop, wearing flip flops, slipping on a banana peel"),
    (44, "a tangerine alien with wavy tentacle arms, wearing a Hawaiian shirt, holding a tiny surfboard"),
    (45, "a white alien with rainbow freckles, wearing overalls with one strap undone, laughing at nothing"),
    (46, "a navy blue alien with a periscope eye, wearing a captain's hat, dramatically scanning horizon"),
    (47, "a pale pink alien that is just a giant round head with tiny legs, wearing a tiny hat, waddling"),
    (48, "a electric blue alien with lightning bolt ears, wearing a mechanic's uniform, sparking accidentally"),
    (49, "a olive green alien with a hammock between its two antennae, napping in it, wearing tiny slippers"),
]

BASE_PROMPT = (
    "Pixar 3D animation style, chibi cartoon character portrait, "
    "white clean background, centered composition, soft studio lighting, "
    "cute and expressive, high quality render, no text, no watermark. Character: "
)


async def generate_one(session: httpx.AsyncClient, idx: int, description: str) -> tuple[int, bool]:
    out_path = OUTPUT_DIR / f"avatar_{idx:02d}.png"
    if out_path.exists():
        print(f"[{idx:02d}] 이미 존재, 건너뜀")
        return idx, True

    try:
        result = await asyncio.to_thread(
            fal_client.subscribe,
            "fal-ai/flux/schnell",
            arguments={
                "prompt": BASE_PROMPT + description,
                "num_inference_steps": 4,
                "image_size": "square_hd",
            },
        )
        url = result["images"][0]["url"]
        resp = await session.get(url)
        resp.raise_for_status()
        out_path.write_bytes(resp.content)
        print(f"[{idx:02d}] 완료: {description[:50]}...")
        return idx, True
    except Exception as e:
        print(f"[{idx:02d}] 실패: {e}")
        return idx, False


async def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # 5개씩 병렬 처리 (FAL rate limit 고려)
    async with httpx.AsyncClient(timeout=120) as session:
        for batch_start in range(0, len(AVATARS), 5):
            batch = AVATARS[batch_start:batch_start + 5]
            results = await asyncio.gather(*[generate_one(session, idx, desc) for idx, desc in batch])
            failed = [idx for idx, ok in results if not ok]
            if failed:
                print(f"실패한 인덱스: {failed}")

    total = len(list(OUTPUT_DIR.glob("avatar_*.png")))
    print(f"\n완료: {total}/50 생성됨 → {OUTPUT_DIR}")


if __name__ == "__main__":
    asyncio.run(main())
