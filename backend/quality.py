"""사원상 1축(내재 품질) — 고정앵커 페어와이즈 판사.

스펙 §3.1: LLM 절대점수(1~10) 금지 — 판사/프롬프트 바뀌면 점수 통째로 흔들려 추세 무의미.
대신 *고정 레퍼런스 세트*(앵커)와 1:1 비교한 **승률**로 위치를 잡는다(드리프트 차단).
채점 5축: 사실성 / 논리 일관성 / 캐릭터 보이스 / 독창성 / 구조.
Haiku로 대량 비교 + confidence=low인 비교만 Sonnet 재판정(§5.2).
품질은 주제 독립이라 글당 고정 — 레퍼런스가 바뀔 때만 재판정한다.
"""
import os
import json
import random
import logging

import anthropic

from db.models import BlogPost, QualityReference, BlogPostQuality

logger = logging.getLogger(__name__)

DIMENSIONS = ["factuality", "logic", "voice", "originality", "structure"]
_DIM_KR = {
    "factuality": "사실성", "logic": "논리 일관성", "voice": "캐릭터 보이스",
    "originality": "독창성", "structure": "구조",
}
HAIKU = "claude-haiku-4-5-20251001"
SONNET = "claude-sonnet-4-6"
_MAX_CHARS = 1800


def _excerpt(post: BlogPost) -> str:
    return f"제목: {post.title}\n\n{(post.content or '')[:_MAX_CHARS]}"


def _compare_prompt(a: str, b: str) -> str:
    dims = "\n".join(f"  - {k}: {_DIM_KR[k]}" for k in DIMENSIONS)
    return (
        "두 블로그 글 A와 B를 아래 5개 축에서 각각 어느 쪽이 더 나은지 판정하라.\n"
        "주제의 인기/검색수요가 아니라 글 자체의 질만 본다.\n"
        f"축:\n{dims}\n\n"
        f"=== 글 A ===\n{a}\n\n=== 글 B ===\n{b}\n\n"
        "각 축마다 \"A\" | \"B\" | \"tie\" 중 하나로 판정.\n"
        "전반적으로 우열이 분명하면 confidence \"high\", 박빙이면 \"low\".\n"
        "JSON만 출력: "
        '{"factuality":"A|B|tie","logic":"...","voice":"...","originality":"...",'
        '"structure":"...","confidence":"high|low"}'
    )


async def _call_judge(client, model: str, prompt: str) -> dict | None:
    msg = await client.messages.create(
        model=model, max_tokens=200,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text").strip()
    start, end = raw.find("{"), raw.rfind("}")
    if start < 0 or end < 0:
        return None
    try:
        return json.loads(raw[start:end + 1])
    except json.JSONDecodeError:
        return None


async def _compare(client, post_text: str, anchor_text: str) -> tuple[dict, str] | None:
    """post vs anchor 1:1 비교. 반환: (post 관점 축별 결과 {dim: 1.0|0.5|0.0}, 사용모델).
    위치편향 완화: A/B 슬롯을 매 비교마다 랜덤 배치."""
    post_is_a = random.random() < 0.5
    a, b = (post_text, anchor_text) if post_is_a else (anchor_text, post_text)
    prompt = _compare_prompt(a, b)

    verdict = await _call_judge(client, HAIKU, prompt)
    model = HAIKU
    if verdict and verdict.get("confidence") == "low":
        sv = await _call_judge(client, SONNET, prompt)
        if sv:
            verdict, model = sv, "haiku+sonnet"
    if not verdict:
        return None

    post_label = "A" if post_is_a else "B"
    result = {}
    for dim in DIMENSIONS:
        v = verdict.get(dim)
        result[dim] = 1.0 if v == post_label else (0.5 if v == "tie" else 0.0)
    return result, model


async def judge_post(db, post: BlogPost, anchors: list[BlogPost]) -> BlogPostQuality | None:
    """한 글을 앵커 전부와 비교해 축별 승률 + 종합 점수(0~100) 산출·저장.
    자기 자신이 앵커면 제외. 앵커가 없으면 None."""
    others = [a for a in anchors if a.id != post.id]
    if not others:
        return None

    client = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    post_text = _excerpt(post)
    dim_wins = {d: 0.0 for d in DIMENSIONS}
    n = 0
    used_sonnet = False
    for anchor in others:
        out = await _compare(client, post_text, _excerpt(anchor))
        if out is None:
            continue
        result, model = out
        for d in DIMENSIONS:
            dim_wins[d] += result[d]
        n += 1
        if model != HAIKU:
            used_sonnet = True
    if n == 0:
        return None

    dim_rate = {d: round(dim_wins[d] / n, 3) for d in DIMENSIONS}
    score = round(sum(dim_rate.values()) / len(DIMENSIONS) * 100, 1)

    row = db.get(BlogPostQuality, post.id)
    if row is None:
        row = BlogPostQuality(post_id=post.id)
        db.add(row)
    row.score = score
    row.dims = json.dumps(dim_rate, ensure_ascii=False)
    row.n_comparisons = n
    row.model = "haiku+sonnet" if used_sonnet else "haiku"
    return row


async def judge_all(db, only_missing: bool = True) -> dict:
    """개인 글(합작 제외) 전체를 판정. only_missing=True면 아직 점수 없는 글만.
    반환: {anchors, judged, skipped}."""
    anchor_ids = [r.post_id for r in db.query(QualityReference).all()]
    anchors = db.query(BlogPost).filter(BlogPost.id.in_(anchor_ids)).all() if anchor_ids else []
    if len(anchors) < 2:
        return {"error": "레퍼런스 세트가 2개 미만 — 앵커를 먼저 등록하라", "anchors": len(anchors)}

    posts = db.query(BlogPost).filter(~BlogPost.agent_id.like("%+%")).all()
    judged = skipped = 0
    for post in posts:
        if only_missing and db.get(BlogPostQuality, post.id) is not None:
            skipped += 1
            continue
        row = await judge_post(db, post, anchors)
        if row is not None:
            judged += 1
            db.commit()
    return {"anchors": len(anchors), "judged": judged, "skipped": skipped}


def set_reference(db, items: list[dict]) -> int:
    """레퍼런스 세트 교체. items: [{"slug": ..., "note": ...}]. 반환: 등록 수.
    세트가 바뀌면 기존 품질 점수는 무효 → 전부 비우고 재판정 유도."""
    db.query(QualityReference).delete()
    count = 0
    for it in items:
        post = db.query(BlogPost).filter(BlogPost.slug == it["slug"]).first()
        if not post:
            logger.warning(f"레퍼런스 slug 없음: {it['slug']}")
            continue
        db.add(QualityReference(post_id=post.id, note=it.get("note")))
        count += 1
    db.query(BlogPostQuality).delete()  # 앵커 바뀌면 점수 재계산 필요
    db.commit()
    return count


def load_quality(db, post_ids: list[str]) -> dict[str, dict]:
    """build_awards용 — post_id → {score, dims} 맵."""
    if not post_ids:
        return {}
    rows = db.query(BlogPostQuality).filter(BlogPostQuality.post_id.in_(post_ids)).all()
    out = {}
    for r in rows:
        out[r.post_id] = {"score": r.score, "dims": json.loads(r.dims) if r.dims else None}
    return out
