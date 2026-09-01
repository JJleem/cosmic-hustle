"""월간 GA 분석 파이프라인 — 카 분석 → 버즈 개선안 → 메모리 업데이트 → 이메일."""
import html
import json
import os
import re
import smtplib
import logging
from datetime import date, datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from zoneinfo import ZoneInfo

import anthropic
from anthropic_text import text_of

logger = logging.getLogger(__name__)

# 글 쓰는 에이전트만 메모리 업데이트
_WRITING_AGENTS = ["buzz", "over", "pixel", "ka"]
GROWTH_MEMORY_START = "<!-- blog-growth-memory:start -->"
GROWTH_MEMORY_END = "<!-- blog-growth-memory:end -->"

KA_SYSTEM = """당신은 Cosmic Hustle의 카(유레카) 과장, 분석가입니다.
다크서클이 짙고, 숫자에서 패턴을 찾으면 "찾았다!"를 외칩니다.
GA 데이터를 분석해 블로그 개선에 필요한 핵심 인사이트를 추출하세요.
한국어로, 간결하게, 수치 근거를 반드시 포함해서 작성하세요."""

BUZZ_SYSTEM = """당신은 Cosmic Hustle의 버즈 대리, 마케터입니다.
"바이럴 각이다!"를 입에 달고 삽니다.
카의 분석을 보고 다음 달 블로그 개선을 위한 구체적 액션 아이템을 작성하세요.
한국어로, 에이전트별로 맞춤 조언을 주세요."""


def _default_month_range(today: date | None = None) -> tuple[str, str]:
    today = today or datetime.now(ZoneInfo("Asia/Seoul")).date()
    first_this_month = today.replace(day=1)
    last_month_end = first_this_month - timedelta(days=1)
    last_month_start = last_month_end.replace(day=1)
    return last_month_start.isoformat(), last_month_end.isoformat()


def _date_range_label(start: str, end: str) -> str:
    return f"{start} ~ {end}"


def _has_ga_metrics(overview: dict, pages: list, channels: list, devices: list) -> bool:
    expected = {"sessions", "total_users", "new_users", "bounce_rate", "avg_session_sec", "page_views"}
    return bool(expected.intersection(overview) or pages or channels or devices)


def _trim_complete_lines(text: str | None, limit: int = 900, max_lines: int = 10) -> str:
    lines = [line.rstrip() for line in (text or "").strip().splitlines() if line.strip()]
    selected: list[str] = []
    omitted = False
    for line in lines:
        if len(selected) >= max_lines:
            omitted = True
            break
        candidate = "\n".join([*selected, line])
        if len(candidate) > limit:
            omitted = True
            break
        selected.append(line)
    if len(selected) < len(lines):
        omitted = True
    if not selected:
        return "요약 생략"
    if omitted:
        selected.append("... (이하 생략)")
    return "\n".join(selected)


def _trim_complete_lines_from_end(text: str | None, limit: int, max_lines: int | None = None) -> str:
    lines = [line.rstrip() for line in (text or "").strip().splitlines() if line.strip()]
    selected: list[str] = []
    for line in reversed(lines):
        if max_lines is not None and len(selected) >= max_lines:
            break
        candidate_lines = [line, *reversed(selected)]
        candidate = "\n".join(candidate_lines)
        if len(candidate) > limit:
            break
        selected.append(line)
    if not selected:
        return "요약 생략"
    kept = list(reversed(selected))
    if len(kept) < len(lines):
        kept.insert(0, "... (이전 내용 생략)")
    return "\n".join(kept)


def _no_ga_data_analysis(period: str) -> str:
    return "\n".join([
        f"GA 데이터 수집 확인 필요 — {period}",
        "",
        "이번 기간은 GA API 응답에 요약 지표, 페이지, 채널, 기기 데이터가 모두 없습니다.",
        "콘텐츠 성과 판단이나 다음 달 전략 추천을 만들지 않습니다.",
        "확인할 것: GA4_PROPERTY_ID, GA4_TOKEN_JSON 또는 GA4_SERVICE_ACCOUNT_JSON, 속성 권한, 날짜 범위.",
    ])


async def _analyze_with_ka(overview: dict, pages: list, channels: list, devices: list, period: str) -> str:
    return _build_ka_analysis(overview, pages, channels, devices, period)


async def _suggest_with_buzz(ka_analysis: str, overview: dict, period: str) -> str:
    return _build_buzz_suggestions(overview, period)


def _pct(numerator: int | float | None, denominator: int | float | None) -> str:
    if not numerator or not denominator:
        return "N/A"
    return f"{(float(numerator) / float(denominator) * 100):.1f}%"


def _lowest_bounce_channel(channels: list[dict]) -> dict | None:
    eligible = [c for c in channels if int(c.get("sessions") or 0) > 0]
    return min(eligible, key=lambda c: float(c.get("bounce_rate") or 100), default=None)


def _slowest_device(devices: list[dict]) -> dict | None:
    eligible = [d for d in devices if int(d.get("sessions") or 0) > 0]
    return min(eligible, key=lambda d: int(d.get("avg_session_sec") or 0), default=None)


def _build_ka_analysis(overview: dict, pages: list, channels: list, devices: list, period: str) -> str:
    sessions = int(overview.get("sessions") or 0)
    users = int(overview.get("total_users") or 0)
    new_users = int(overview.get("new_users") or 0)
    page_views = int(overview.get("page_views") or 0)
    avg_sec = int(overview.get("avg_session_sec") or 0)
    bounce = overview.get("bounce_rate", "N/A")
    worst_page = pages[0] if pages else None
    best_channel = _lowest_bounce_channel(channels)
    slow_device = _slowest_device(devices)

    lines = [
        f"찾았다. {period}은 세션 {sessions}, 사용자 {users}, 페이지뷰 {page_views}, 평균 체류 {avg_sec}초입니다.",
        f"전체 이탈률은 {bounce}%이고 신규 사용자 비중은 {_pct(new_users, users)}입니다.",
    ]
    if worst_page:
        lines.append(
            f"핵심 1. {worst_page['path']}는 이탈률 {worst_page['bounce_rate']}%, 체류 {worst_page['avg_session_sec']}초, 세션 {worst_page['sessions']}입니다. 글 끝 내부 이동 장치가 필요합니다."
        )
    if slow_device:
        lines.append(
            f"핵심 2. {slow_device['device']} 체류가 {slow_device['avg_session_sec']}초로 가장 낮습니다. 첫 화면 요약과 모바일 가독성을 우선 점검하세요."
        )
    if best_channel:
        lines.append(
            f"긍정 신호. {best_channel['channel']} 유입은 세션 {best_channel['sessions']}, 이탈률 {best_channel['bounce_rate']}%입니다. 이 채널의 유입원을 다음 성장 레버로 봅니다."
        )
    lines.extend([
        "buzz: 이탈률 낮은 유입 채널의 독자 의도를 기준으로 제목과 CTA를 맞추세요.",
        "over: 완결형 글 끝에 관련 글 2개와 다음 행동 문장을 붙이세요.",
        "pixel: 모바일 첫 화면에서 제목, 요약, 대표 이미지가 바로 신뢰를 주는지 점검하세요.",
    ])
    return "\n".join(lines)


def _build_buzz_suggestions(overview: dict, period: str) -> str:
    bounce = overview.get("bounce_rate", "N/A")
    avg_sec = overview.get("avg_session_sec", "N/A")
    return "\n".join([
        f"버즈 판단. {period}의 다음 목표는 재방문과 내부 이동입니다. 이탈률 {bounce}%, 평균 체류 {avg_sec}초를 기준으로 봅니다.",
        "글 구조. 모든 신규 글은 첫 3문장 안에 핵심 요약을 넣고, 300~400자마다 소제목을 둡니다.",
        "CTA. 글 말미에 관련 글 2개와 댓글 질문 1개를 고정으로 넣습니다.",
        "주제 방향. 유입 품질이 좋은 채널의 독자 의도와 맞는 글을 우선 발행합니다.",
        "에이전트별. buzz는 유입 채널 분석, over는 관련 글 연결, pixel은 모바일 첫 화면 개선을 맡습니다.",
        "최우선 실험. 다음 신규 글 5편 중 A안은 기존 형식, B안은 첫 화면 요약과 관련 글 CTA를 넣은 형식으로 발행해 이탈률과 다음 페이지 이동을 비교합니다.",
    ])


def _strip_markdown(text: str) -> str:
    cleaned = re.sub(r"(\*\*|__)(.*?)\1", r"\2", text or "")
    cleaned = re.sub(r"(^|\s)(`{1,3})([^`]+)\2", r"\1\3", cleaned)
    cleaned = re.sub(r"^\s{0,3}#{1,6}\s*", "", cleaned)
    cleaned = re.sub(r"^\s*[-*]\s+", "", cleaned)
    return cleaned.strip()


def _lines_to_html_list(text: str) -> str:
    items = [line.strip() for line in (text or "").splitlines() if line.strip()]
    if not items:
        return "<p>내용 없음</p>"
    return "<ul>" + "".join(
        f"<li style=\"margin:6px 0;line-height:1.55\">{html.escape(_strip_markdown(item))}</li>"
        for item in items
    ) + "</ul>"


def _metric(value, suffix: str = "") -> str:
    if value is None:
        return "N/A"
    return f"{value}{suffix}"


def _table_rows(rows: list[dict], columns: list[tuple[str, str, str]]) -> str:
    if not rows:
        return f"<tr><td colspan=\"{len(columns)}\" style=\"padding:8px;border:1px solid #e5e7eb;color:#777\">데이터 없음</td></tr>"
    html_rows = []
    for row in rows:
        cells = []
        for key, _, suffix in columns:
            cells.append(
                f"<td style=\"padding:8px;border:1px solid #e5e7eb\">{html.escape(_metric(row.get(key), suffix))}</td>"
            )
        html_rows.append("<tr>" + "".join(cells) + "</tr>")
    return "".join(html_rows)


def _table_html(rows: list[dict], columns: list[tuple[str, str, str]]) -> str:
    headers = "".join(
        f"<td style=\"padding:8px;border:1px solid #e5e7eb\">{html.escape(label)}</td>"
        for _, label, _ in columns
    )
    return (
        "<table style=\"border-collapse:collapse;width:100%;margin:8px 0 16px\">"
        f"<tr style=\"background:#f3f4f6;font-weight:bold\">{headers}</tr>"
        f"{_table_rows(rows, columns)}"
        "</table>"
    )


def _monthly_takeaways(overview: dict, problem_pages: list, channels: list, devices: list) -> list[str]:
    users = int(overview.get("total_users") or 0)
    new_users = int(overview.get("new_users") or 0)
    best_channel = _lowest_bounce_channel(channels)
    slow_device = _slowest_device(devices)
    worst_page = problem_pages[0] if problem_pages else None
    takeaways = [
        f"신규 사용자 비중은 {_pct(new_users, users)}입니다. 유입은 생기고 있지만 재방문 자산은 아직 약합니다.",
    ]
    if best_channel:
        takeaways.append(
            f"{best_channel['channel']} 유입은 세션 {best_channel['sessions']}, 이탈률 {best_channel['bounce_rate']}%로 가장 품질이 좋습니다."
        )
    if worst_page:
        takeaways.append(
            f"{worst_page['path']}는 이탈률 {worst_page['bounce_rate']}%입니다. 글 말미의 관련 글/댓글 CTA가 우선 개선 대상입니다."
        )
    if slow_device:
        takeaways.append(
            f"{slow_device['device']} 체류가 {slow_device['avg_session_sec']}초로 낮습니다. 첫 화면 요약과 이미지 로딩, 모바일 문단 길이를 점검하세요."
        )
    return takeaways


def _monthly_actions() -> list[str]:
    return [
        "모든 신규 글 말미에 관련 글 2개와 댓글 질문 1개를 고정으로 넣습니다.",
        "Referral 유입원의 실제 소스를 확인하고, 해당 독자층에 맞는 제목/도입부를 3편 이상 발행합니다.",
        "모바일 첫 화면에서 제목, 요약, 대표 이미지가 한 화면 안에 들어오는지 점검합니다.",
        "다음 월간 리포트에서는 재방문 사용자 수, 다음 페이지 이동률, Referral 소스별 성과를 같이 봅니다.",
    ]


def _render_monthly_email_bodies(
    period: str,
    overview: dict,
    problem_pages: list,
    pages: list,
    channels: list,
    devices: list,
    ka_analysis: str,
    buzz_suggestions: str,
    memory_status: str,
) -> tuple[str, str]:
    takeaways = _monthly_takeaways(overview, problem_pages, channels, devices)
    actions = _monthly_actions()
    ka_excerpt = _trim_complete_lines(ka_analysis, limit=1200, max_lines=14)
    buzz_excerpt = _trim_complete_lines(buzz_suggestions, limit=1000, max_lines=12)
    top_pages = pages[:8] if pages else problem_pages

    text_body = "\n\n".join([
        f"Cosmic Hustle GA 월간 리포트 — {period}",
        (
            f"전체 요약: 세션 {overview.get('sessions','N/A')}, 사용자 {overview.get('total_users','N/A')}, "
            f"페이지뷰 {overview.get('page_views','N/A')}, 이탈률 {overview.get('bounce_rate','N/A')}%, "
            f"체류 {overview.get('avg_session_sec','N/A')}초"
        ),
        "핵심 해석\n" + "\n".join(f"- {item}" for item in takeaways),
        "카의 분석\n" + ka_excerpt,
        "버즈의 개선안\n" + buzz_excerpt,
        "이번 달 실행 체크리스트\n" + "\n".join(f"- {item}" for item in actions),
        memory_status,
    ])

    summary_cards = "".join([
        f"<div style=\"padding:12px;border:1px solid #e5e7eb;background:#fafafa\"><div style=\"font-size:12px;color:#666\">세션</div><b>{overview.get('sessions','N/A')}</b></div>",
        f"<div style=\"padding:12px;border:1px solid #e5e7eb;background:#fafafa\"><div style=\"font-size:12px;color:#666\">사용자</div><b>{overview.get('total_users','N/A')}</b></div>",
        f"<div style=\"padding:12px;border:1px solid #e5e7eb;background:#fafafa\"><div style=\"font-size:12px;color:#666\">페이지뷰</div><b>{overview.get('page_views','N/A')}</b></div>",
        f"<div style=\"padding:12px;border:1px solid #e5e7eb;background:#fafafa\"><div style=\"font-size:12px;color:#666\">이탈률</div><b>{overview.get('bounce_rate','N/A')}%</b></div>",
        f"<div style=\"padding:12px;border:1px solid #e5e7eb;background:#fafafa\"><div style=\"font-size:12px;color:#666\">평균 체류</div><b>{overview.get('avg_session_sec','N/A')}초</b></div>",
        f"<div style=\"padding:12px;border:1px solid #e5e7eb;background:#fafafa\"><div style=\"font-size:12px;color:#666\">신규 사용자</div><b>{overview.get('new_users','N/A')}</b></div>",
    ])
    html_body = f"""
<html><body style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;color:#1a1a1a;line-height:1.5">
<h2 style="color:#6d28d9;margin-bottom:4px">Cosmic Hustle — GA 월간 리포트</h2>
<p style="color:#666;margin-top:0">{html.escape(period)}</p>

<h3>전체 요약</h3>
<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:16px">{summary_cards}</div>

<h3>핵심 해석</h3>
<div style="background:#f8fafc;padding:14px;border-radius:8px">{_lines_to_html_list(chr(10).join(takeaways))}</div>

<h3>주의 페이지 TOP {len(problem_pages)}</h3>
{_table_html(problem_pages, [("path", "페이지", ""), ("bounce_rate", "이탈률", "%"), ("avg_session_sec", "체류시간", "초"), ("sessions", "세션", "")])}

<h3>상위 페이지 지표</h3>
{_table_html(top_pages, [("path", "페이지", ""), ("sessions", "세션", ""), ("page_views", "페이지뷰", ""), ("bounce_rate", "이탈률", "%"), ("avg_session_sec", "체류시간", "초")])}

<h3>유입 채널</h3>
{_table_html(channels[:6], [("channel", "채널", ""), ("sessions", "세션", ""), ("bounce_rate", "이탈률", "%")])}

<h3>기기별 체류</h3>
{_table_html(devices[:5], [("device", "기기", ""), ("sessions", "세션", ""), ("bounce_rate", "이탈률", "%"), ("avg_session_sec", "체류시간", "초")])}

<h3>카의 분석</h3>
<div style="background:#faf5ff;padding:14px;border-radius:8px">{_lines_to_html_list(ka_excerpt)}</div>

<h3>버즈의 개선안</h3>
<div style="background:#fff7ed;padding:14px;border-radius:8px">{_lines_to_html_list(buzz_excerpt)}</div>

<h3>이번 달 실행 체크리스트</h3>
<div style="background:#ecfdf5;padding:14px;border-radius:8px">{_lines_to_html_list(chr(10).join(actions))}</div>

<p style="color:#999;font-size:12px;margin-top:28px">{html.escape(memory_status)}<br>Cosmic Hustle 자동 발송</p>
</body></html>"""
    return text_body, html_body


def _delta_str(curr: dict, prev: dict) -> str:
    """이번 달 vs 이전 달 수치 변화 요약 문자열 생성."""
    if not prev:
        return "  (이전 달 데이터 없음 — 첫 번째 기록)"
    lines = []
    for key, label, unit in [
        ("sessions",       "세션",       "%"),
        ("total_users",    "사용자",     "%"),
        ("page_views",     "페이지뷰",   "%"),
        ("bounce_rate",    "이탈률",     "pp"),
        ("avg_session_sec","체류시간",   "초"),
    ]:
        c, p = curr.get(key), prev.get(key)
        if c is None or p is None or p == 0:
            continue
        if unit == "%":
            diff = (c - p) / p * 100
            lines.append(f"  {label}: {p} → {c} ({diff:+.1f}%)")
        elif unit == "pp":
            diff = c - p
            lines.append(f"  {label}: {p}% → {c}% ({diff:+.1f}pp)")
        else:
            diff = c - p
            lines.append(f"  {label}: {p}{unit} → {c}{unit} ({diff:+.1f}{unit})")
    return "\n".join(lines) if lines else "  변화 수치 없음"


def _split_growth_memory(memory: str | None) -> tuple[str | None, str | None]:
    if not memory:
        return memory, None
    start = memory.find(GROWTH_MEMORY_START)
    end = memory.find(GROWTH_MEMORY_END)
    if start < 0 or end < start:
        return memory, None
    end += len(GROWTH_MEMORY_END)
    base = f"{memory[:start].rstrip()}\n\n{memory[end:].lstrip()}".strip()
    growth = memory[start:end].strip()
    return base or None, growth


def _restore_growth_memory(memory: str, growth: str | None, limit: int = 1800) -> str:
    if not growth:
        return _trim_complete_lines(memory, limit=limit, max_lines=40)
    updated = f"{memory.strip()}\n\n{growth}".strip() if memory.strip() else growth
    if len(updated) <= limit:
        return updated
    growth_budget = min(len(growth), 900)
    base_budget = max(limit - growth_budget - 2, 300)
    base = _trim_complete_lines(memory, limit=base_budget, max_lines=30)
    restored = f"{base.strip()}\n\n{growth.strip()}".strip()
    return _trim_complete_lines_from_end(restored, limit=limit, max_lines=60)


async def _update_agent_memories(
    ka_analysis: str,
    buzz_suggestions: str,
    period: str,
    current_overview: dict,
):
    """글 쓰는 에이전트 4명의 메모리 업데이트 + 히스토리/스냅샷 저장."""
    from db.connection import SessionLocal
    from db.models import AgentMemory, AgentMemoryHistory, GaMonthlySnapshot
    from datetime import datetime

    client = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    db = SessionLocal()
    try:
        # 이전 달 GA 스냅샷 조회 (가장 최근 period)
        prev_snapshot = (
            db.query(GaMonthlySnapshot)
            .filter(GaMonthlySnapshot.period != period)
            .order_by(GaMonthlySnapshot.created_at.desc())
            .first()
        )
        prev_overview = json.loads(prev_snapshot.overview_json) if prev_snapshot else {}
        prev_period = prev_snapshot.period if prev_snapshot else None
        delta = _delta_str(current_overview, prev_overview)

        # 이번 달 GA 스냅샷 저장 (upsert)
        snap = db.query(GaMonthlySnapshot).filter(GaMonthlySnapshot.period == period).first()
        if snap:
            snap.overview_json = json.dumps(current_overview, ensure_ascii=False)
            snap.ka_analysis = ka_analysis
            snap.buzz_suggestions = buzz_suggestions
        else:
            db.add(GaMonthlySnapshot(
                period=period,
                overview_json=json.dumps(current_overview, ensure_ascii=False),
                ka_analysis=ka_analysis,
                buzz_suggestions=buzz_suggestions,
            ))
        db.flush()

        for agent_id in _WRITING_AGENTS:
            mem_row = db.query(AgentMemory).filter(AgentMemory.agent_id == agent_id).first()
            current_memory = mem_row.memory if mem_row else None
            prompt_memory, growth_memory = _split_growth_memory(current_memory) if agent_id == "buzz" else (current_memory, None)

            # 현재 메모리를 히스토리에 스냅샷으로 저장
            db.add(AgentMemoryHistory(
                agent_id=agent_id,
                period=period,
                memory_snapshot=current_memory,
            ))

            # 이전 달 메모리 히스토리 조회
            prev_memory_row = (
                db.query(AgentMemoryHistory)
                .filter(
                    AgentMemoryHistory.agent_id == agent_id,
                    AgentMemoryHistory.period != period,
                )
                .order_by(AgentMemoryHistory.created_at.desc())
                .first()
            )
            prev_memory = prev_memory_row.memory_snapshot if prev_memory_row else None

            prev_context = ""
            if prev_period:
                prev_context = f"""
【이전 달({prev_period}) 내 메모리】
{prev_memory or "기록 없음"}
"""

            prompt = f"""당신은 {agent_id} 에이전트의 학습 메모리 관리자입니다.

【수치 변화 — {prev_period or "기준 없음"} → {period}】
{delta}

【이번 달 GA 분석 — {period}】
{ka_analysis}

【버즈의 개선 제안】
{buzz_suggestions}
{prev_context}
【현재 메모리 (업데이트 대상)】
{prompt_memory or "없음 (첫 번째 기록)"}

지시사항:
1. {agent_id} 에이전트 글쓰기에 직접 적용 가능한 패턴만 추출
2. "[성장 분석 {period}]" 섹션: 수치 변화 기반으로 "지난달 대비 무엇이 나아졌고 무엇이 나빠졌는지" 2~3줄로 작성
3. "[GA {period}]" 섹션: 이번 달 인사이트 및 다음 달 적용 전략
4. 기존 메모리 내용은 유지하되, 오래된 GA 섹션(2달 이상)은 핵심만 1줄로 압축
5. 전체 1200자 이하 유지
6. 한국어, 항목별 줄 구분
7. 메모리 내용만 출력 (설명 없이)"""

            msg = await client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=700,
                messages=[{"role": "user", "content": prompt}],
            )
            new_memory = _trim_complete_lines(text_of(msg), limit=1200, max_lines=40)
            if agent_id == "buzz":
                new_memory = _restore_growth_memory(new_memory, growth_memory)

            if mem_row:
                mem_row.memory = new_memory
                mem_row.updated_at = datetime.utcnow()
            else:
                db.add(AgentMemory(agent_id=agent_id, memory=new_memory))

        db.commit()
        logger.info(f"GA 월간 메모리 업데이트 완료: {_WRITING_AGENTS}")
    finally:
        db.close()


def _send_email(
    period: str,
    overview: dict,
    problem_pages: list,
    ka_analysis: str,
    buzz_suggestions: str,
    *,
    pages: list | None = None,
    channels: list | None = None,
    devices: list | None = None,
    memory_updated: bool = True,
):
    smtp_host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_password = os.environ.get("SMTP_PASSWORD", "")
    to_email = os.environ.get("REPORT_EMAIL", smtp_user)

    if not smtp_user or not smtp_password:
        logger.warning("SMTP 미설정 — 이메일 발송 건너뜀")
        return {"ok": False, "skipped": True, "reason": "missing_smtp"}

    memory_status = "에이전트 메모리 업데이트 완료 (buzz / over / pixel / ka)" if memory_updated else "GA 데이터 없음: 에이전트 메모리 업데이트 건너뜀"
    text_body, html_body = _render_monthly_email_bodies(
        period,
        overview,
        problem_pages,
        pages or [],
        channels or [],
        devices or [],
        ka_analysis,
        buzz_suggestions,
        memory_status,
    )

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"[Cosmic Hustle] GA 월간 리포트 — {period}"
    msg["From"] = smtp_user
    msg["To"] = to_email
    msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    with smtplib.SMTP(smtp_host, smtp_port) as server:
        server.starttls()
        server.login(smtp_user, smtp_password)
        server.sendmail(smtp_user, to_email, msg.as_string())

    logger.info(f"GA 월간 리포트 이메일 발송 완료 → {to_email}")
    return {"ok": True, "to": to_email}


async def run_monthly_ga_report(
    start_date: str | None = None,
    end_date: str | None = None,
    update_memory: bool = True,
):
    """월간 GA 분석 실행. 날짜 미지정 시 전달(1일~말일) 기준."""
    import ga_client

    if not start_date or not end_date:
        start_date, end_date = _default_month_range()

    period = _date_range_label(start_date, end_date)
    logger.info(f"GA 월간 분석 시작 — {period}")

    try:
        overview = ga_client.fetch_site_overview(start_date, end_date)
        pages = ga_client.fetch_page_metrics(start_date, end_date, limit=20)
        channels = ga_client.fetch_channel_metrics(start_date, end_date)
        devices = ga_client.fetch_device_metrics(start_date, end_date)
    except Exception as e:
        logger.error(f"GA 데이터 수집 실패: {e}")
        return {"ok": False, "error": str(e)}

    problem_pages = [p for p in pages if p["sessions"] >= 5][:5]
    has_ga_metrics = _has_ga_metrics(overview, pages, channels, devices)

    memory_updated = False
    if has_ga_metrics:
        ka_analysis = await _analyze_with_ka(overview, problem_pages, channels, devices, period)
        buzz_suggestions = await _suggest_with_buzz(ka_analysis, overview, period)
        if update_memory:
            await _update_agent_memories(ka_analysis, buzz_suggestions, period, overview)
            memory_updated = True
    else:
        ka_analysis = _no_ga_data_analysis(period)
        buzz_suggestions = "GA 데이터가 없어 개선안을 생성하지 않았습니다. 먼저 측정 설정을 복구한 뒤 다음 월간 리포트에서 전략을 만듭니다."
        logger.warning("GA 월간 데이터 없음 — AI 분석과 메모리 업데이트를 건너뜀: %s", period)

    try:
        email_status = _send_email(
            period,
            overview,
            problem_pages,
            ka_analysis,
            buzz_suggestions,
            pages=pages,
            channels=channels,
            devices=devices,
            memory_updated=memory_updated,
        )
    except Exception as e:
        logger.error(f"이메일 발송 실패: {e}")
        email_status = {"ok": False, "error": str(e)}

    logger.info(f"GA 월간 분석 완료 — {period}")
    return {
        "ok": True,
        "period": period,
        "overview": overview,
        "problem_pages": problem_pages,
        "ka_analysis": ka_analysis,
        "buzz_suggestions": buzz_suggestions,
        "memory_updated": memory_updated,
        "email": email_status,
    }
