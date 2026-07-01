"""월간 GA 분석 파이프라인 — 카 분석 → 버즈 개선안 → 메모리 업데이트 → 이메일."""
import html
import json
import os
import smtplib
import logging
from datetime import date, datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from zoneinfo import ZoneInfo

import anthropic

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


def _no_ga_data_analysis(period: str) -> str:
    return "\n".join([
        f"GA 데이터 수집 확인 필요 — {period}",
        "",
        "이번 기간은 GA API 응답에 요약 지표, 페이지, 채널, 기기 데이터가 모두 없습니다.",
        "콘텐츠 성과 판단이나 다음 달 전략 추천을 만들지 않습니다.",
        "확인할 것: GA4_PROPERTY_ID, GA4_TOKEN_JSON 또는 GA4_SERVICE_ACCOUNT_JSON, 속성 권한, 날짜 범위.",
    ])


async def _analyze_with_ka(overview: dict, pages: list, channels: list, devices: list, period: str) -> str:
    client = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    # 문제 페이지 TOP 5 (이탈률 높고 세션 10 이상)
    problem_pages = [p for p in pages if p["sessions"] >= 5][:5]
    pages_text = "\n".join(
        f"  {i+1}. {p['path']} — 이탈률 {p['bounce_rate']}%, 체류 {p['avg_session_sec']}초, 세션 {p['sessions']}"
        for i, p in enumerate(problem_pages)
    )
    channels_text = "\n".join(
        f"  - {c['channel']}: 세션 {c['sessions']}, 이탈률 {c['bounce_rate']}%"
        for c in channels
    )
    devices_text = "\n".join(
        f"  - {d['device']}: 세션 {d['sessions']}, 체류 {d['avg_session_sec']}초"
        for d in devices
    )

    prompt = f"""【분석 기간】{period}

【전체 요약】
- 총 세션: {overview.get('sessions', 'N/A')}
- 총 사용자: {overview.get('total_users', 'N/A')} (신규: {overview.get('new_users', 'N/A')})
- 전체 이탈률: {overview.get('bounce_rate', 'N/A')}%
- 평균 체류시간: {overview.get('avg_session_sec', 'N/A')}초
- 총 페이지뷰: {overview.get('page_views', 'N/A')}

【이탈률 높은 페이지 TOP 5】
{pages_text if pages_text else "  데이터 없음"}

【유입 채널】
{channels_text if channels_text else "  데이터 없음"}

【기기 분포】
{devices_text if devices_text else "  데이터 없음"}

위 데이터를 분석해 다음을 작성하세요:
1. 전체 블로그 현황 총평 (2~3문장)
2. 핵심 문제점 3가지 (수치 근거 포함)
3. 주목할 긍정적 신호 1~2가지
4. 에이전트(글쓴이)별 개선 방향 힌트 (buzz/over/pixel 각 1줄)

전체 900자 이하. 표, 긴 서론, 마크다운 장식은 쓰지 마세요."""

    msg = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=700,
        system=KA_SYSTEM,
        messages=[{"role": "user", "content": prompt}],
    )
    return _trim_complete_lines(msg.content[0].text.strip(), limit=900, max_lines=12)


async def _suggest_with_buzz(ka_analysis: str, overview: dict, period: str) -> str:
    client = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    prompt = f"""【기간】{period}
【카의 분석 결과】
{ka_analysis}

【전체 이탈률】{overview.get('bounce_rate', 'N/A')}% / 평균 체류 {overview.get('avg_session_sec', 'N/A')}초

위 분석을 바탕으로 다음 달 블로그 개선을 위한 액션 아이템을 작성하세요:
1. 글 구조 개선 (서론 길이, 소제목 배치, 요약 위치 등)
2. 주제 방향 (잘 되는 카테고리·형식 강화, 피해야 할 패턴)
3. 에이전트별 맞춤 조언 (buzz / over / pixel 각 1~2문장)
4. 이번 달 최우선 실험 1가지 (A/B 테스트 가능한 수준으로 구체적으로)

전체 800자 이하. 표, 긴 서론, 마크다운 장식은 쓰지 마세요."""

    msg = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=600,
        system=BUZZ_SYSTEM,
        messages=[{"role": "user", "content": prompt}],
    )
    return _trim_complete_lines(msg.content[0].text.strip(), limit=800, max_lines=10)


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
        return memory
    updated = f"{memory.strip()}\n\n{growth}".strip() if memory.strip() else growth
    return updated[-limit:].strip() if len(updated) > limit else updated


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
            new_memory = msg.content[0].text.strip()[:1200]
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
    memory_updated: bool = True,
):
    smtp_host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_password = os.environ.get("SMTP_PASSWORD", "")
    to_email = os.environ.get("REPORT_EMAIL", smtp_user)

    if not smtp_user or not smtp_password:
        logger.warning("SMTP 미설정 — 이메일 발송 건너뜀")
        return

    # 페이지 테이블 rows
    page_rows = "".join(
        f"<tr><td>{p['path']}</td><td>{p['bounce_rate']}%</td>"
        f"<td>{p['avg_session_sec']}초</td><td>{p['sessions']}</td></tr>"
        for p in problem_pages
    )

    ka_excerpt = _trim_complete_lines(ka_analysis, limit=900, max_lines=12)
    buzz_excerpt = _trim_complete_lines(buzz_suggestions, limit=800, max_lines=10)
    memory_status = "에이전트 메모리 업데이트 완료 (buzz / over / pixel / ka)" if memory_updated else "GA 데이터 없음: 에이전트 메모리 업데이트 건너뜀"

    text_body = "\n\n".join([
        f"Cosmic Hustle GA 월간 리포트 — {period}",
        (
            f"전체 요약: 세션 {overview.get('sessions','N/A')}, 사용자 {overview.get('total_users','N/A')}, "
            f"페이지뷰 {overview.get('page_views','N/A')}, 이탈률 {overview.get('bounce_rate','N/A')}%, "
            f"체류 {overview.get('avg_session_sec','N/A')}초"
        ),
        f"주의 페이지 TOP {len(problem_pages)}",
        "카의 분석\n" + ka_excerpt,
        "버즈의 개선안\n" + buzz_excerpt,
        memory_status,
    ])

    html_body = f"""
<html><body style="font-family:sans-serif;max-width:680px;margin:0 auto;color:#1a1a1a">
<h2 style="color:#6d28d9">Cosmic Hustle — GA 월간 리포트</h2>
<p style="color:#666">{period}</p>

<h3>전체 요약</h3>
<table style="border-collapse:collapse;width:100%">
<tr style="background:#f3f4f6">
  <td style="padding:8px;border:1px solid #e5e7eb">총 세션</td>
  <td style="padding:8px;border:1px solid #e5e7eb"><b>{overview.get('sessions','N/A')}</b></td>
  <td style="padding:8px;border:1px solid #e5e7eb">총 사용자</td>
  <td style="padding:8px;border:1px solid #e5e7eb"><b>{overview.get('total_users','N/A')}</b></td>
</tr>
<tr>
  <td style="padding:8px;border:1px solid #e5e7eb">전체 이탈률</td>
  <td style="padding:8px;border:1px solid #e5e7eb"><b>{overview.get('bounce_rate','N/A')}%</b></td>
  <td style="padding:8px;border:1px solid #e5e7eb">평균 체류시간</td>
  <td style="padding:8px;border:1px solid #e5e7eb"><b>{overview.get('avg_session_sec','N/A')}초</b></td>
</tr>
<tr style="background:#f3f4f6">
  <td style="padding:8px;border:1px solid #e5e7eb">페이지뷰</td>
  <td style="padding:8px;border:1px solid #e5e7eb"><b>{overview.get('page_views','N/A')}</b></td>
  <td style="padding:8px;border:1px solid #e5e7eb">신규 사용자</td>
  <td style="padding:8px;border:1px solid #e5e7eb"><b>{overview.get('new_users','N/A')}</b></td>
</tr>
</table>

<h3>주의 페이지 TOP {len(problem_pages)}</h3>
<table style="border-collapse:collapse;width:100%">
<tr style="background:#f3f4f6;font-weight:bold">
  <td style="padding:8px;border:1px solid #e5e7eb">페이지</td>
  <td style="padding:8px;border:1px solid #e5e7eb">이탈률</td>
  <td style="padding:8px;border:1px solid #e5e7eb">체류시간</td>
  <td style="padding:8px;border:1px solid #e5e7eb">세션</td>
</tr>
{page_rows}
</table>

<h3>카의 분석</h3>
<div style="background:#faf5ff;padding:16px;border-radius:8px;white-space:pre-wrap">{html.escape(ka_excerpt)}</div>

<h3>버즈의 개선안</h3>
<div style="background:#fff7ed;padding:16px;border-radius:8px;white-space:pre-wrap">{html.escape(buzz_excerpt)}</div>

<p style="color:#999;font-size:12px;margin-top:32px">{html.escape(memory_status)}<br>
Cosmic Hustle 자동 발송</p>
</body></html>"""

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


async def run_monthly_ga_report(start_date: str | None = None, end_date: str | None = None):
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

    if has_ga_metrics:
        ka_analysis = await _analyze_with_ka(overview, problem_pages, channels, devices, period)
        buzz_suggestions = await _suggest_with_buzz(ka_analysis, overview, period)
        await _update_agent_memories(ka_analysis, buzz_suggestions, period, overview)
    else:
        ka_analysis = _no_ga_data_analysis(period)
        buzz_suggestions = "GA 데이터가 없어 개선안을 생성하지 않았습니다. 먼저 측정 설정을 복구한 뒤 다음 월간 리포트에서 전략을 만듭니다."
        logger.warning("GA 월간 데이터 없음 — AI 분석과 메모리 업데이트를 건너뜀: %s", period)

    try:
        _send_email(period, overview, problem_pages, ka_analysis, buzz_suggestions, memory_updated=has_ga_metrics)
    except Exception as e:
        logger.error(f"이메일 발송 실패: {e}")

    logger.info(f"GA 월간 분석 완료 — {period}")
    return {
        "ok": True,
        "period": period,
        "overview": overview,
        "problem_pages": problem_pages,
        "ka_analysis": ka_analysis,
        "buzz_suggestions": buzz_suggestions,
        "memory_updated": has_ga_metrics,
    }
