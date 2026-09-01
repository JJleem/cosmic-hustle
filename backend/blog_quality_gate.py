"""자동 블로그 발행 전 저비용 품질 게이트.

무료 구조 검사 -> Haiku 1회 편집 판정 -> 필요한 섹션만 Sonnet 1회 수정.
전체 글/이미지는 재생성하지 않으며, 통과하지 못한 글은 호출부가 비공개 초안으로 저장한다.
"""
import json
import logging
import os
import re

import anthropic

from blog_generator import _logged_create

logger = logging.getLogger(__name__)

QUALITY_GATE_BUDGET_USD = float(os.environ.get("BLOG_QUALITY_GATE_BUDGET_USD", "0.03"))
_HEADING_RE = re.compile(r"(?m)^##\s+(.+?)\s*$")
_LEFTOVER_RE = re.compile(r"\{\{(?:IMAGE|THUMBNAIL|TAGS|SEO_TITLE|SUMMARY|SEO_DESCRIPTION)\b")


def free_quality_checks(data: dict) -> dict:
    content = data.get("content") or ""
    headings = _HEADING_RE.findall(content)
    links = re.findall(r"https?://", content)
    fatal = []
    warnings = []
    if _LEFTOVER_RE.search(content):
        fatal.append("처리되지 않은 생성 마커가 본문에 남아 있음")
    if len(content) < 4000:
        warnings.append("본문이 4,000자보다 짧음")
    if len(content) > 14000:
        warnings.append("본문이 14,000자보다 길어 반복 가능성 확인 필요")
    if not 3 <= len(headings) <= 7:
        warnings.append(f"소제목이 권장 범위(3~7개)를 벗어남: {len(headings)}개")
    if len(links) < 2 and (data.get("content_type") or "").upper() not in {"ESSAY", "LAB"}:
        warnings.append("외부 또는 내부 링크가 2개 미만")
    for field in ("summary", "seo_title", "seo_description", "content_type"):
        if not data.get(field):
            warnings.append(f"{field} 누락")
    return {"fatal_issues": fatal, "warnings": warnings}


def _compact_for_review(data: dict) -> str:
    content = data.get("content") or ""
    sections = re.split(r"(?m)(?=^##\s+)", content)
    samples = []
    for section in sections:
        lines = [line.strip() for line in section.splitlines() if line.strip()]
        if not lines:
            continue
        samples.append("\n".join(lines[:3]))
    numbers = [line.strip() for line in content.splitlines() if re.search(r"\d", line)][:12]
    return (
        f"제목: {data.get('title', '')}\n요약: {data.get('summary', '')}\n"
        f"작성자: {data.get('agent_id', '')}\n\n[도입]\n{content[:1600]}\n\n"
        f"[섹션 표본]\n{'\n\n'.join(samples)[:2800]}\n\n"
        f"[숫자 포함 문장]\n{'\n'.join(numbers)[:1400]}\n\n[결론]\n{content[-1600:]}"
    )


def _parse_json(text: str) -> dict | None:
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < start:
        return None
    try:
        return json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        return None


async def _audit(data: dict, checks: dict, costs: list) -> dict:
    client = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    message = await _logged_create(
        client, costs, "quality_gate",
        # 220은 한국어 fatal_issues/warnings가 들어차면 JSON이 닫히기 전에 끊긴다.
        # 판정 1건당 비용이라 넉넉히 준다.
        model="claude-haiku-4-5-20251001", max_tokens=1000,
        messages=[{"role": "user", "content": (
            "자동 발행 직전의 블로그 글을 편집 검수하라. 인기나 SEO가 아니라 아래 세 가지만 본다:\n"
            "1) 출처 표본으로 뒷받침되지 않은 구체적 수치/날짜/역사 단정 같은 치명적 사실 위험,\n"
            "2) 이 글만의 핵심 발견 또는 유용한 관점,\n"
            "3) 제목이 약속한 질문에 결론이 실제로 답하는지.\n"
            "고칠 수 있는 문제면 rewrite_target에 정확한 ## 소제목 텍스트 하나를 적어라. "
            "치명적 문제가 없으면 publishable=true. JSON만 출력: "
            '{"publishable":true,"fatal_issues":[],"warnings":[],"weakest_axis":"factuality|originality|answer",'
            '"rewrite_target":null}\n\n'
            f"무료 검사: {json.dumps(checks, ensure_ascii=False)}\n\n{_compact_for_review(data)}"
        )}],
    )
    raw = "".join(b.text for b in message.content if getattr(b, "type", "") == "text")
    parsed = _parse_json(raw)
    if parsed:
        return parsed
    # 파싱 실패 시 원문을 남긴다. 이게 없어서 8/26~9/1 7일 연속 실패의 원인을 좁히지 못했다.
    # stop_reason == "max_tokens" 면 잘린 것이고, 그 외면 형식이 어긋난 것이다.
    logger.error(
        "품질 판정 응답 파싱 실패 — stop_reason=%s raw=%r",
        getattr(message, "stop_reason", None), raw[:600],
    )
    return {
        "publishable": False, "fatal_issues": ["품질 판정 응답 파싱 실패"],
        "warnings": [], "weakest_axis": "answer", "rewrite_target": None,
    }


def _section_bounds(content: str, heading: str) -> tuple[int, int] | None:
    match = re.search(rf"(?m)^##\s+{re.escape(heading.strip())}\s*$", content)
    if not match:
        return None
    next_heading = re.search(r"(?m)^##\s+", content[match.end():])
    end = match.end() + next_heading.start() if next_heading else len(content)
    return match.start(), end


async def _rewrite_section(data: dict, audit: dict, costs: list) -> bool:
    heading = audit.get("rewrite_target")
    bounds = _section_bounds(data.get("content") or "", heading) if heading else None
    if not bounds:
        return False
    start, end = bounds
    content = data["content"]
    section = content[start:end]
    client = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    message = await _logged_create(
        client, costs, "quality_rewrite",
        model="claude-sonnet-5", max_tokens=1200,
        messages=[{"role": "user", "content": (
            "아래 블로그의 문제 섹션만 수정하라. 새 수치나 사실을 발명하지 말고, 제공된 글 안에서 "
            "확인되는 근거만 사용하라. 제목과 ## 소제목은 유지하고 수정된 섹션만 출력하라.\n\n"
            f"글 제목: {data.get('title')}\n문제: {json.dumps(audit.get('fatal_issues', []), ensure_ascii=False)}\n"
            f"앞 문맥: {content[max(0, start - 500):start]}\n\n수정 대상:\n{section}\n\n"
            f"뒤 문맥: {content[end:end + 500]}"
        )}],
    )
    replacement = "".join(b.text for b in message.content if getattr(b, "type", "") == "text").strip()
    if not replacement or not replacement.startswith("##"):
        return False
    data["content"] = content[:start] + replacement + content[end:]
    return True


async def run_quality_gate(data: dict) -> dict:
    costs = data.setdefault("costs", [])
    checks = free_quality_checks(data)
    if checks["fatal_issues"]:
        return {"publishable": False, **checks, "rewritten": False}
    try:
        audit = await _audit(data, checks, costs)
    except Exception as exc:
        return {
            "publishable": False, "fatal_issues": [f"품질 판정 호출 실패: {type(exc).__name__}"],
            "warnings": checks["warnings"], "rewritten": False,
        }
    if audit.get("publishable"):
        return {**audit, "warnings": checks["warnings"] + audit.get("warnings", []), "rewritten": False}
    try:
        rewritten = await _rewrite_section(data, audit, costs)
    except Exception as exc:
        return {
            **audit, "publishable": False,
            "fatal_issues": audit.get("fatal_issues", []) + [f"부분 수정 호출 실패: {type(exc).__name__}"],
            "warnings": checks["warnings"] + audit.get("warnings", []), "rewritten": False,
        }
    # 비용 상한은 기록값으로 감사한다. 호출 수와 max_tokens가 실제 하드 가드다.
    gate_cost = sum(c.get("cost_usd", 0) for c in costs if c.get("phase") in {"quality_gate", "quality_rewrite"})
    return {
        **audit,
        "publishable": rewritten and not free_quality_checks(data)["fatal_issues"] and gate_cost <= QUALITY_GATE_BUDGET_USD,
        "warnings": checks["warnings"] + audit.get("warnings", []),
        "rewritten": rewritten, "cost_usd": round(gate_cost, 6),
    }
