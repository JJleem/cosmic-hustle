import re
import uuid
from dataclasses import dataclass, field
from html import unescape
from typing import Any

import anthropic
from sqlalchemy import text

from blog_generator import (
    _SEO_LEN,
    _logged_create,
    parse_seo_metadata,
    validate_content_type,
)


GENERAL_CONTENT_TYPE_BY_AGENT = {
    "buzz": "MARKETING",
    "over": "ESSAY",
    "ka": "DATA",
    "pixel": "DESIGN",
    "ping": "IDEA",
    "wiki": "WIKI",
    "pocke": "SCIENCE",
}

BACKFILL_COST_PHASE = "seo_backfill"
SEO_BACKFILL_MODEL = "claude-sonnet-4-6"

EXIT_SUCCESS = 0
EXIT_FAILURE = 1
EXIT_ARGUMENT = 2
EXIT_SKIPPED = 3
EXIT_GENERATION = 4
EXIT_CONCURRENT_UPDATE = 5
EXIT_TRANSACTION = 6


class SEOBackfillError(Exception):
    def __init__(self, reason: str, exit_code: int = EXIT_FAILURE):
        super().__init__(reason)
        self.reason = reason
        self.exit_code = exit_code


class SEOValidationError(SEOBackfillError):
    def __init__(self, reason: str):
        super().__init__(reason, EXIT_GENERATION)


@dataclass
class BackfillInspection:
    post_id: str | None
    slug: str | None
    agent_id: str | None
    content_type: str | None
    original_length: int
    prepared_length: int
    eligible: bool
    skip_reason: str | None = None
    warnings: list[str] = field(default_factory=list)


def _value(post: Any, name: str, default: Any = None) -> Any:
    if isinstance(post, dict):
        return post.get(name, default)
    return getattr(post, name, default)


def determine_existing_post_content_type(
    *,
    slug: str,
    agent_id: str | None,
    title: str,
    trending_topic: str | None = None,
) -> str | None:
    slug = slug or ""
    title = title or ""
    trending_topic = trending_topic or ""

    if slug.startswith("ai-debate-") or trending_topic.startswith("AI 토론 시리즈:"):
        return "DEBATE"
    if slug.startswith("quiz/") or "quiz" in slug or "어떤 Cosmic Hustle AI" in title:
        return "QUIZ"
    if slug.startswith("intro-") or slug.startswith("cosmic-hustle") or "Cosmic Hustle" in title:
        return "INTRO"
    if slug.startswith("discovery-") or trending_topic.startswith("Discovery:"):
        return "SCIENCE"

    return GENERAL_CONTENT_TYPE_BY_AGENT.get(agent_id or "")


_MARKDOWN_IMAGE_RE = re.compile(r"!\[([^\]]*)\]\(([^)]*)\)")
_MARKDOWN_LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)]*)\)")
_HTML_TAG_RE = re.compile(r"<[^>]+>")
_SEO_MARKER_RE = re.compile(r"\{\{\s*/?\s*(?:SEO_TITLE|SUMMARY|SEO_DESCRIPTION)\s*\}\}", re.I)
_GEN_MARKER_RE = re.compile(
    r"\{\{\s*(?:THUMBNAIL|TAGS|IMAGE|WIKIMEDIA|WIKIMEDIA_THUMB)\s*:.*?\}\}",
    re.S | re.I,
)
_URL_RE = re.compile(r"https?://\S+")


def prepare_existing_content_for_seo(content: str, *, max_chars: int | None = None) -> str:
    raw = content or ""

    def _image_repl(match: re.Match) -> str:
        alt = match.group(1).strip()
        return f"이미지: {alt}" if alt else ""

    cleaned = _MARKDOWN_IMAGE_RE.sub(_image_repl, raw)
    cleaned = _MARKDOWN_LINK_RE.sub(lambda m: m.group(1).strip(), cleaned)
    cleaned = _GEN_MARKER_RE.sub("", cleaned)
    cleaned = _SEO_MARKER_RE.sub("", cleaned)
    cleaned = _URL_RE.sub("", cleaned)
    cleaned = _HTML_TAG_RE.sub(" ", cleaned)
    cleaned = unescape(cleaned)
    cleaned = re.sub(r"[ \t\r\f\v]+", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    cleaned = "\n".join(line.strip() for line in cleaned.splitlines()).strip()

    if max_chars is not None and len(cleaned) > max_chars:
        raise SEOBackfillError("content_too_long", EXIT_SKIPPED)
    return cleaned


def build_existing_post_seo_prompt(*, title: str, prepared_content: str, content_type: str) -> str:
    return f"""기존 블로그 글의 SEO metadata만 생성하세요.

절대 하지 말 것:
- 새 본문 작성 금지
- 기존 title/content/slug/tags/thumbnail/published 상태 수정 금지
- markdown code fence, 설명 문장, 추가 코멘트 출력 금지
- 이미지, 썸네일, 태그, slug 생성 금지

grounding 규칙:
- 아래 기존 제목과 본문에 없는 사실을 추가하지 마세요.
- 본문에 없는 인명·기관·연도·통계·연구·출처를 만들지 마세요.
- 본문보다 더 강하게 단정하지 마세요.
- 건강·의학 효과를 본문보다 확대하지 마세요.
- SEO_TITLE은 기존 title을 단순 복사하지 말고 검색용으로만 다듬으세요.
- SUMMARY는 도입부 복사가 아니라 핵심 요약이어야 합니다.
- SEO_DESCRIPTION은 검색 결과에 보일 자연스러운 설명문이어야 합니다.

content_type: {content_type}

출력은 아래 세 블록만 정확히 한 번씩 사용하세요.

{{{{SEO_TITLE}}}}
25~60자 권장
{{{{/SEO_TITLE}}}}

{{{{SUMMARY}}}}
50~180자 권장
{{{{/SUMMARY}}}}

{{{{SEO_DESCRIPTION}}}}
80~160자 권장
{{{{/SEO_DESCRIPTION}}}}

기존 title:
{title}

기존 content:
{prepared_content}
"""


_STRICT_BLOCKS = {
    "seo_title": re.compile(r"\{\{\s*SEO_TITLE\s*\}\}(.*?)\{\{\s*/\s*SEO_TITLE\s*\}\}", re.S | re.I),
    "summary": re.compile(r"\{\{\s*SUMMARY\s*\}\}(.*?)\{\{\s*/\s*SUMMARY\s*\}\}", re.S | re.I),
    "seo_description": re.compile(
        r"\{\{\s*SEO_DESCRIPTION\s*\}\}(.*?)\{\{\s*/\s*SEO_DESCRIPTION\s*\}\}", re.S | re.I
    ),
}


def validate_generated_seo_metadata(*, raw_output: str, expected_content_type: str) -> dict:
    validated_type = validate_content_type(expected_content_type)
    if validated_type != expected_content_type:
        raise SEOValidationError("invalid_content_type")

    raw = raw_output or ""
    warnings: list[str] = []
    values: dict[str, str] = {}
    without_blocks = raw

    for field_name, rx in _STRICT_BLOCKS.items():
        matches = rx.findall(raw)
        if len(matches) != 1:
            raise SEOValidationError(f"{field_name}_marker_count_{len(matches)}")
        value = matches[0].strip()
        if not value:
            raise SEOValidationError(f"{field_name}_empty")
        length = len(value)
        limits = _SEO_LEN[field_name]
        if length > limits["hard"]:
            raise SEOValidationError(f"{field_name}_too_long")
        if length < limits["min"] or length > limits["max"]:
            warnings.append(f"{field_name}_length_{length}")
        values[field_name] = value
        without_blocks = rx.sub("", without_blocks)

    if _SEO_MARKER_RE.search(without_blocks):
        raise SEOValidationError("orphan_seo_marker")
    if without_blocks.strip():
        raise SEOValidationError("unexpected_text_outside_markers")

    parsed = parse_seo_metadata(raw)
    for key in ("seo_title", "summary", "seo_description"):
        if parsed.get(key) != values[key]:
            raise SEOValidationError(f"{key}_parse_mismatch")

    return {
        "seo_title": values["seo_title"],
        "summary": values["summary"],
        "seo_description": values["seo_description"],
        "content_type": expected_content_type,
        "warnings": warnings,
    }


async def generate_seo_metadata_for_existing_post(
    *,
    title: str,
    content: str,
    agent_id: str | None,
    content_type: str,
    client: Any | None = None,
) -> dict:
    prepared_content = prepare_existing_content_for_seo(content)
    prompt = build_existing_post_seo_prompt(
        title=title,
        prepared_content=prepared_content,
        content_type=content_type,
    )
    costs: list[dict] = []
    if client is None:
        client = anthropic.AsyncAnthropic()
    message = await _logged_create(
        client,
        costs,
        BACKFILL_COST_PHASE,
        model=SEO_BACKFILL_MODEL,
        max_tokens=800,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = "\n".join(
        block.text for block in message.content if getattr(block, "type", "text") == "text"
    ).strip()
    metadata = validate_generated_seo_metadata(
        raw_output=raw,
        expected_content_type=content_type,
    )
    cost = costs[0] if costs else {}
    metadata.update(
        {
            "model": cost.get("model", SEO_BACKFILL_MODEL),
            "input_tokens": cost.get("input_tokens", 0),
            "output_tokens": cost.get("output_tokens", 0),
            "cache_read_tokens": cost.get("cache_read_tokens", 0),
            "cache_creation_tokens": cost.get("cache_creation_tokens", 0),
            "cost_usd": cost.get("cost_usd", 0.0),
        }
    )
    return metadata


def inspect_backfill_candidate(post: Any, *, max_chars: int | None = None) -> BackfillInspection:
    post_id = _value(post, "id")
    slug = _value(post, "slug")
    agent_id = _value(post, "agent_id")
    title = _value(post, "title")
    content = _value(post, "content")
    original_length = len(content or "")
    prepared_length = 0

    def _skip(reason: str, content_type: str | None = None) -> BackfillInspection:
        return BackfillInspection(
            post_id=post_id,
            slug=slug,
            agent_id=agent_id,
            content_type=content_type,
            original_length=original_length,
            prepared_length=prepared_length,
            eligible=False,
            skip_reason=reason,
        )

    if _value(post, "published") is not True:
        return _skip("not_published")
    if not title:
        return _skip("missing_title")
    if not content:
        return _skip("missing_content")

    seo_values = [
        _value(post, "seo_title"),
        _value(post, "summary"),
        _value(post, "seo_description"),
        _value(post, "content_type"),
    ]
    if all(value is not None for value in seo_values):
        return _skip("already_completed")
    if any(value is not None for value in seo_values):
        return _skip("partial_seo_state")

    content_type = determine_existing_post_content_type(
        slug=slug or "",
        agent_id=agent_id,
        title=title,
        trending_topic=_value(post, "trending_topic"),
    )
    if content_type is None:
        return _skip("unmapped_content_type")
    if content_type in {"DEBATE", "QUIZ", "INTRO"}:
        return _skip("special_content_deferred", content_type)

    try:
        prepared_length = len(prepare_existing_content_for_seo(content, max_chars=max_chars))
    except SEOBackfillError as exc:
        return _skip(exc.reason, content_type)

    return BackfillInspection(
        post_id=post_id,
        slug=slug,
        agent_id=agent_id,
        content_type=content_type,
        original_length=original_length,
        prepared_length=prepared_length,
        eligible=True,
    )


def conditional_update_post_seo(db: Any, *, post_id: str, metadata: dict) -> int:
    result = db.execute(
        text(
            """
            UPDATE blog_posts
            SET
                seo_title = :seo_title,
                summary = :summary,
                seo_description = :seo_description,
                content_type = :content_type,
                updated_at = updated_at
            WHERE id = :post_id
              AND published = true
              AND seo_title IS NULL
              AND summary IS NULL
              AND seo_description IS NULL
              AND content_type IS NULL
            """
        ),
        {
            "post_id": post_id,
            "seo_title": metadata["seo_title"],
            "summary": metadata["summary"],
            "seo_description": metadata["seo_description"],
            "content_type": metadata["content_type"],
        },
    )
    return int(getattr(result, "rowcount", 0) or 0)


def record_seo_backfill_cost(db: Any, *, post_id: str, agent_id: str, metadata: dict) -> None:
    from db.models import BlogPostCost

    db.add(
        BlogPostCost(
            id=str(uuid.uuid4()),
            post_id=post_id,
            agent_id=agent_id,
            phase=BACKFILL_COST_PHASE,
            model=metadata.get("model"),
            input_tokens=metadata.get("input_tokens", 0),
            output_tokens=metadata.get("output_tokens", 0),
            cache_read_tokens=metadata.get("cache_read_tokens", 0),
            cache_creation_tokens=metadata.get("cache_creation_tokens", 0),
            cost_usd=metadata.get("cost_usd", 0.0),
        )
    )


def apply_seo_backfill(
    db: Any,
    *,
    post: Any,
    metadata: dict,
    update_func=conditional_update_post_seo,
    cost_func=record_seo_backfill_cost,
) -> None:
    inspection = inspect_backfill_candidate(post)
    if not inspection.eligible:
        raise SEOBackfillError(inspection.skip_reason or "not_eligible", EXIT_SKIPPED)

    try:
        rowcount = update_func(db, post_id=inspection.post_id, metadata=metadata)
        if rowcount != 1:
            db.rollback()
            raise SEOBackfillError("race_or_no_longer_eligible", EXIT_CONCURRENT_UPDATE)
        cost_func(db, post_id=inspection.post_id, agent_id=inspection.agent_id, metadata=metadata)
        db.commit()
    except SEOBackfillError:
        raise
    except Exception as exc:
        db.rollback()
        raise SEOBackfillError(f"transaction_failed: {exc}", EXIT_TRANSACTION) from exc
