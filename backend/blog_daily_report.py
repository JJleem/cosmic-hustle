import json
import logging
import os
import re
import subprocess
from collections import Counter
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import feedparser
import httpx
from sqlalchemy import func
from sqlalchemy.orm import Session

from db.models import AgentMemory, BlogComment, BlogDailyVisit, BlogPost, BlogViewLog

logger = logging.getLogger(__name__)

TREND_QUERIES = ("AI 트렌드", "블로그 바이럴", "테크 트렌드")
GROWTH_MEMORY_START = "<!-- blog-growth-memory:start -->"
GROWTH_MEMORY_END = "<!-- blog-growth-memory:end -->"
BOT_UA_MARKERS = (
    "bot", "crawler", "spider", "slurp", "bingpreview", "facebookexternalhit",
    "ahrefs", "semrush", "bytespider", "petalbot", "mj12bot", "python-requests",
    "curl", "wget",
)


def _parse_tags(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    return [str(item).strip() for item in data if str(item).strip()]


def _visit_count(db: Session, day: date) -> int:
    row = db.query(BlogDailyVisit).filter(BlogDailyVisit.date == day.isoformat()).first()
    return int(row.count) if row else 0


def _default_report_date() -> date:
    return datetime.now(ZoneInfo("Asia/Seoul")).date() - timedelta(days=1)


def collect_blog_report_snapshot(db: Session, today: date | None = None) -> dict:
    today = today or _default_report_date()
    compare_day = today - timedelta(days=1)
    week_start = today - timedelta(days=6)

    daily_rows = (
        db.query(BlogDailyVisit)
        .filter(BlogDailyVisit.date >= week_start.isoformat())
        .order_by(BlogDailyVisit.date.asc())
        .all()
    )
    daily_visits = [{"date": row.date, "count": int(row.count or 0)} for row in daily_rows]

    recent_posts = (
        db.query(BlogPost)
        .filter(BlogPost.published == True)
        .order_by(BlogPost.published_at.desc())
        .limit(30)
        .all()
    )
    post_ids = [post.id for post in recent_posts]
    comment_counts = {}
    if post_ids:
        rows = (
            db.query(BlogComment.post_id, func.count(BlogComment.id))
            .filter(BlogComment.post_id.in_(post_ids))
            .group_by(BlogComment.post_id)
            .all()
        )
        comment_counts = {post_id: int(count) for post_id, count in rows}

    tag_counter: Counter[str] = Counter()
    trend_counter: Counter[str] = Counter()
    scored_posts = []
    for post in recent_posts:
        tags = _parse_tags(post.tags)
        tag_counter.update(tags)
        if post.trending_topic:
            trend_counter.update([post.trending_topic])
        comments = comment_counts.get(post.id, 0)
        score = int(post.view_count or 0) + int(post.likes or 0) * 5 + comments * 3
        scored_posts.append({
            "title": post.title,
            "slug": post.slug,
            "agent_id": post.agent_id,
            "views": int(post.view_count or 0),
            "likes": int(post.likes or 0),
            "comments": comments,
            "score": score,
            "tags": tags,
        })

    scored_posts.sort(key=lambda item: item["score"], reverse=True)
    total_visits = db.query(func.coalesce(func.sum(BlogDailyVisit.count), 0)).scalar() or 0
    unique_post_views_today = (
        db.query(func.count(BlogViewLog.post_id))
        .filter(BlogViewLog.date == today.isoformat())
        .scalar()
        or 0
    )

    return {
        "date": today.isoformat(),
        "generated_date": datetime.now(ZoneInfo("Asia/Seoul")).date().isoformat(),
        "compare_date": compare_day.isoformat(),
        "today_visits": _visit_count(db, today),
        "yesterday_visits": _visit_count(db, compare_day),
        "week_visits": sum(item["count"] for item in daily_visits),
        "total_visits": int(total_visits),
        "unique_post_views_today": int(unique_post_views_today),
        "daily_visits": daily_visits,
        "top_posts": scored_posts[:5],
        "top_tags": tag_counter.most_common(8),
        "recent_trends": trend_counter.most_common(5),
    }


def fetch_daily_ga_summary(today: date | None = None) -> dict:
    today = today or _default_report_date()
    start = end = today.isoformat()
    try:
        import ga_client

        return {
            "ok": True,
            "date": start,
            "overview": ga_client.fetch_site_overview(start, end),
            "channels": ga_client.fetch_channel_metrics(start, end)[:5],
            "devices": ga_client.fetch_device_metrics(start, end)[:5],
            "pages": ga_client.fetch_page_metrics(start, end, limit=8)[:5],
        }
    except Exception as exc:
        logger.warning("GA 일일 수집 실패: %s", exc)
        return {"ok": False, "error": str(exc)}


def fetch_gsc_summary(window_days: int = 28, lag_days: int = 3) -> dict:
    """GSC 검색어 성과 수집 → 제목 보강 후보 + 상위 검색어.

    용도는 '기존 글 제목 교정'뿐. 주제 선택에는 쓰지 않는다(오버피팅 방지).
    GSC 데이터는 2~3일 지연되므로 today-lag_days를 끝점으로, 트래픽이 적어
    하루치는 너무 얇으니 window_days(기본 28일) 누적 윈도로 본다.
    실패/미설정/빈값 모두 안 깨지게 ok 플래그로만 처리.
    """
    try:
        import gsc_client

        end = datetime.now(ZoneInfo("Asia/Seoul")).date() - timedelta(days=lag_days)
        start = end - timedelta(days=window_days - 1)
        rows = gsc_client.fetch_query_page_rows(start.isoformat(), end.isoformat())
        return {
            "ok": True,
            "start": start.isoformat(),
            "end": end.isoformat(),
            "title_fix_candidates": gsc_client.select_title_fix_candidates(rows),
            "top_queries": gsc_client.top_queries(rows),
        }
    except Exception as exc:
        logger.warning("GSC 수집 실패: %s", exc)
        return {"ok": False, "error": str(exc)}


def attach_post_titles(db: Session, candidates: list[dict]) -> list[dict]:
    """제목 보강 후보의 page URL → 글 제목 매핑(사람용 리포트 가독성)."""
    if not candidates:
        return candidates
    slugs = {cand["page"].rstrip("/").rsplit("/", 1)[-1] for cand in candidates}
    titles = {
        post.slug: post.title
        for post in db.query(BlogPost).filter(BlogPost.slug.in_(slugs)).all()
    }
    for cand in candidates:
        slug = cand["page"].rstrip("/").rsplit("/", 1)[-1]
        cand["title"] = titles.get(slug, slug)
    return candidates


def analyze_access_logs(today: date | None = None, max_lines: int = 5000) -> dict:
    today = today or _default_report_date()
    raw_paths = os.environ.get("BLOG_REPORT_ACCESS_LOG_PATHS", "/var/log/nginx/access.log")
    paths = [Path(item.strip()) for item in raw_paths.split(",") if item.strip()]
    date_token = today.strftime("%d/%b/%Y")

    checked, readable, total, bot_hits = [], [], 0, 0
    bot_uas: Counter[str] = Counter()
    top_paths: Counter[str] = Counter()
    ua_re = re.compile(r'"([^"]*)"\s+"([^"]*)"$')
    path_re = re.compile(r'"(?:GET|POST|HEAD)\s+([^"\s]+)')

    for path in paths:
        checked.append(str(path))
        try:
            lines = path.read_text(errors="ignore").splitlines()[-max_lines:]
        except Exception as exc:
            logger.warning("access log 읽기 실패: %s (%s)", path, exc)
            continue
        readable.append(str(path))
        for line in lines:
            if date_token not in line:
                continue
            total += 1
            ua_match = ua_re.search(line)
            ua = ua_match.group(2).lower() if ua_match else ""
            is_bot = any(marker in ua for marker in BOT_UA_MARKERS)
            if is_bot:
                bot_hits += 1
                bot_uas.update([ua[:80] or "unknown"])
            path_match = path_re.search(line)
            if path_match and (is_bot or "/api/blog/posts/" in path_match.group(1)):
                top_paths.update([path_match.group(1)[:120]])

    ratio = round((bot_hits / total) * 100, 1) if total else 0
    if not readable:
        return analyze_journal_logs(today=today, max_lines=max_lines, checked_paths=checked)

    return {
        "ok": bool(readable),
        "source": "access_log",
        "date": today.isoformat(),
        "checked_paths": checked,
        "readable_paths": readable,
        "total_lines_today": total,
        "bot_hits": bot_hits,
        "bot_ratio": ratio,
        "top_bot_uas": bot_uas.most_common(5),
        "top_paths": top_paths.most_common(5),
    }


def analyze_journal_logs(today: date | None = None, max_lines: int = 5000, checked_paths: list[str] | None = None) -> dict:
    today = today or _default_report_date()
    unit = os.environ.get("BLOG_REPORT_JOURNAL_UNIT", "cosmic-backend")
    cmd = [
        "journalctl",
        "-u",
        unit,
        "--since",
        today.isoformat(),
        "--until",
        (today + timedelta(days=1)).isoformat(),
        "--no-pager",
        "-n",
        str(max_lines),
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=8, check=False)
    except Exception as exc:
        logger.warning("journal 로그 읽기 실패: %s", exc)
        return {
            "ok": False,
            "source": "none",
            "date": today.isoformat(),
            "checked_paths": checked_paths or [],
            "readable_paths": [],
            "error": str(exc),
        }
    if result.returncode != 0:
        return {
            "ok": False,
            "source": "journal",
            "date": today.isoformat(),
            "checked_paths": checked_paths or [],
            "readable_paths": [],
            "error": result.stderr[:300],
        }

    access_re = re.compile(r"INFO:\s+([0-9a-fA-F:.]+):\d+\s+-\s+\"(?:GET|POST|HEAD)\s+([^\"\s]+).*\"\s+(\d{3})")
    ip_counter: Counter[str] = Counter()
    path_counter: Counter[str] = Counter()
    status_counter: Counter[str] = Counter()
    total = 0
    for line in result.stdout.splitlines():
        match = access_re.search(line)
        if not match:
            continue
        ip, path, status = match.groups()
        total += 1
        ip_counter.update([ip])
        status_counter.update([status])
        if path.startswith("/api/blog"):
            path_counter.update([path[:120]])

    top_ip_hits = ip_counter.most_common(1)[0][1] if ip_counter else 0
    top_ip_ratio = round((top_ip_hits / total) * 100, 1) if total else 0
    return {
        "ok": True,
        "source": "journal",
        "date": today.isoformat(),
        "checked_paths": checked_paths or [],
        "readable_paths": [],
        "journal_unit": unit,
        "total_lines_today": total,
        "bot_hits": 0,
        "bot_ratio": 0,
        "top_ip_ratio": top_ip_ratio,
        "top_ips": ip_counter.most_common(5),
        "top_statuses": status_counter.most_common(5),
        "top_bot_uas": [],
        "top_paths": path_counter.most_common(5),
    }


def assess_bot_signals(snapshot: dict, ga: dict, access_logs: dict) -> list[str]:
    signals = []
    overview = ga.get("overview") if ga.get("ok") else {}
    ga_page_views = int(overview.get("page_views") or 0)
    ga_avg_sec = int(overview.get("avg_session_sec") or 0)
    ga_bounce = float(overview.get("bounce_rate") or 0)
    db_views = int(snapshot.get("unique_post_views_today") or 0)

    if ga_page_views and db_views > ga_page_views * 2:
        signals.append(f"자체 포스트뷰({db_views})가 GA 페이지뷰({ga_page_views})의 2배 초과")
    if ga_page_views >= 20 and ga_avg_sec <= 3:
        signals.append(f"GA 평균 체류 {ga_avg_sec}초: 짧은 대량 유입 의심")
    if ga_page_views >= 20 and ga_bounce >= 90:
        signals.append(f"GA 이탈률 {ga_bounce}%: 저품질/봇성 유입 가능")
    if access_logs.get("ok") and access_logs.get("bot_ratio", 0) >= 20:
        signals.append(f"access log bot UA 비율 {access_logs['bot_ratio']}%")
    if access_logs.get("source") == "journal" and access_logs.get("top_ip_ratio", 0) >= 40:
        signals.append(f"journal 상위 IP 비중 {access_logs['top_ip_ratio']}%: 반복 요청 의심")
    if not access_logs.get("ok"):
        signals.append("access log 미연결: AWS/Lightsail 봇 판정은 아직 제한적")
    return signals


async def fetch_trend_headlines(queries: tuple[str, ...] = TREND_QUERIES, limit: int = 6) -> list[dict]:
    headlines: list[dict] = []
    timeout = httpx.Timeout(8.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        for query in queries:
            url = "https://news.google.com/rss/search"
            params = {"q": query, "hl": "ko", "gl": "KR", "ceid": "KR:ko"}
            try:
                response = await client.get(url, params=params)
                response.raise_for_status()
            except Exception as exc:
                logger.warning("트렌드 RSS 수집 실패: %s (%s)", query, exc)
                continue
            feed = feedparser.parse(response.text)
            for entry in feed.entries[:3]:
                title = str(getattr(entry, "title", "")).strip()
                if title:
                    headlines.append({"query": query, "title": title})
            if len(headlines) >= limit:
                break
    return headlines[:limit]


def render_buzz_report(
    snapshot: dict,
    headlines: list[dict],
    ga: dict,
    access_logs: dict,
    bot_signals: list[str],
    judgement: str,
    gsc: dict | None = None,
) -> str:
    visits_delta = snapshot["today_visits"] - snapshot["yesterday_visits"]
    delta_mark = "+" if visits_delta >= 0 else ""
    top_tags = ", ".join(tag for tag, _ in snapshot["top_tags"][:5]) or "아직 없음"
    top_trends = ", ".join(topic for topic, _ in snapshot["recent_trends"][:3]) or "아직 없음"

    lines = [
        f"버즈의 블로그 데일리 리포트 (대상일 {snapshot['date']}, 발송일 {snapshot['generated_date']})",
        "",
        f"조회: 대상일 {snapshot['today_visits']} / 전일 {snapshot['yesterday_visits']} ({delta_mark}{visits_delta}) / 대상 7일 {snapshot['week_visits']} / 누적 {snapshot['total_visits']}",
        f"자체 포스트뷰: 대상일 {snapshot['unique_post_views_today']}",
        f"잘 먹히는 태그: {top_tags}",
        f"최근 포스트 주제: {top_trends}",
        "",
        "GA 일일 요약",
    ]

    if ga.get("ok"):
        overview = ga.get("overview", {})
        channel_text = ", ".join(
            f"{c['channel']} {c['sessions']}" for c in ga.get("channels", [])[:3]
        ) or "채널 없음"
        lines.extend([
            f"세션 {overview.get('sessions', 0)}, 사용자 {overview.get('total_users', 0)}, 페이지뷰 {overview.get('page_views', 0)}, 이탈률 {overview.get('bounce_rate', 'N/A')}%, 체류 {overview.get('avg_session_sec', 'N/A')}초",
            f"유입 채널: {channel_text}",
        ])
    else:
        lines.append(f"GA 수집 실패/미설정: {ga.get('error', 'unknown')}")

    lines.extend([
        "",
        "봇/저품질 유입 신호",
    ])
    if bot_signals:
        lines.extend(f"- {signal}" for signal in bot_signals[:5])
    else:
        lines.append("- 강한 의심 신호 없음")
    if access_logs.get("ok"):
        if access_logs.get("source") == "journal":
            lines.append(
                f"- journal: 대상일 API access {access_logs['total_lines_today']}건, 상위 IP 비중 {access_logs.get('top_ip_ratio', 0)}%"
            )
        else:
            lines.append(
                f"- access log: 대상일 {access_logs['total_lines_today']}줄 중 bot UA {access_logs['bot_hits']}건 ({access_logs['bot_ratio']}%)"
            )

    if access_logs.get("top_bot_uas"):
        ua = access_logs["top_bot_uas"][0][0]
        lines.append(f"- 최다 bot UA: {ua}")
    if access_logs.get("top_paths"):
        path = access_logs["top_paths"][0][0]
        lines.append(f"- 의심/주요 경로: {path}")
    if access_logs.get("top_ips"):
        ip, count = access_logs["top_ips"][0]
        lines.append(f"- 최다 요청 IP: {ip} ({count}건)")

    lines.extend([
        "",
        "상위 포스트",
    ])

    if snapshot["top_posts"]:
        for idx, post in enumerate(snapshot["top_posts"][:3], start=1):
            lines.append(
                f"{idx}. {post['title']} - 조회 {post['views']}, 좋아요 {post['likes']}, 댓글 {post['comments']}"
            )
    else:
        lines.append("아직 발행/반응 데이터가 부족함")

    lines.extend(["", "현재 핫한 신호"])
    if headlines:
        for item in headlines[:5]:
            lines.append(f"- [{item['query']}] {item['title']}")
    else:
        lines.append("- 외부 트렌드 수집값 없음. 내부 반응 기준으로만 판단.")

    lines.extend(["", "제목 보강 후보 (GSC: 노출되는데 클릭 안 되는 검색어 → 기존 글 제목 손볼 대상)"])
    if gsc and gsc.get("ok"):
        candidates = gsc.get("title_fix_candidates", [])
        if candidates:
            for cand in candidates[:5]:
                ctr_pct = round(cand["ctr"] * 100, 1)
                title = cand.get("title", cand["page"])
                lines.append(
                    f"- '{cand['query']}' 노출 {cand['impressions']}/CTR {ctr_pct}%/순위 {cand['position']} → [{title}] 제목 재검토"
                )
        else:
            lines.append("- 조건 충족 검색어 없음 (트래픽 누적 중)")
    else:
        reason = gsc.get("error", "미설정") if gsc else "미수집"
        lines.append(f"- GSC 미연결/실패: {reason}")

    lines.extend([
        "",
        f"버즈 판단: {judgement}",
    ])
    return "\n".join(lines)


def _fallback_buzz_judgement(snapshot: dict, bot_signals: list[str]) -> str:
    if bot_signals:
        return "봇/저품질 신호가 있으니 조회수보다 GA 체류·채널을 우선 보고, 반응 상위 글의 제목 패턴만 다음 실험에 반영."
    if snapshot["top_posts"]:
        return "상위 글의 감성/직접 제목 패턴이 먹히는 중. 다음 글은 잘 먹힌 태그와 오늘 트렌드를 섞어 더 선명한 제목으로 가자."
    return "데이터가 아직 얇음. 오늘은 트렌드 힌트 기반으로 짧고 직접적인 실험 글을 하나 쌓는 쪽이 좋음."


async def generate_buzz_judgement(snapshot: dict, ga: dict, access_logs: dict, bot_signals: list[str], headlines: list[dict]) -> dict:
    if os.environ.get("BLOG_REPORT_AI_JUDGEMENT", "1").lower() in ("0", "false", "no"):
        return {"ok": False, "skipped": True, "text": _fallback_buzz_judgement(snapshot, bot_signals)}
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return {"ok": False, "skipped": True, "reason": "missing_anthropic_key", "text": _fallback_buzz_judgement(snapshot, bot_signals)}

    overview = ga.get("overview") if ga.get("ok") else {}
    payload = {
        "report_date": snapshot["date"],
        "generated_date": snapshot["generated_date"],
        "compare_date": snapshot["compare_date"],
        "db": {
            "today": snapshot["today_visits"],
            "yesterday": snapshot["yesterday_visits"],
            "week": snapshot["week_visits"],
            "post_views": snapshot["unique_post_views_today"],
            "top_tags": snapshot["top_tags"][:5],
            "top_posts": snapshot["top_posts"][:3],
        },
        "ga": {
            "sessions": overview.get("sessions"),
            "users": overview.get("total_users"),
            "page_views": overview.get("page_views"),
            "bounce_rate": overview.get("bounce_rate"),
            "avg_session_sec": overview.get("avg_session_sec"),
            "channels": ga.get("channels", [])[:3],
        },
        "logs": {
            "source": access_logs.get("source"),
            "top_ip_ratio": access_logs.get("top_ip_ratio"),
            "top_paths": access_logs.get("top_paths", [])[:3],
        },
        "bot_signals": bot_signals[:3],
        "headlines": headlines[:5],
    }

    prompt = f"""아래 블로그 성장 데이터를 보고 Cosmic Hustle의 마케터 버즈처럼 판단하세요.
한국어로 3줄 이하, 450자 이하.
반드시 포함:
- 대상일 데이터 해석
- 다음 글 주제/제목 방향 1개
- 봇/저품질 유입 주의가 필요하면 짧게 경고

데이터:
{json.dumps(payload, ensure_ascii=False)}
"""
    try:
        import anthropic

        client = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        msg = await client.messages.create(
            model=os.environ.get("BLOG_REPORT_AI_MODEL", "claude-haiku-4-5-20251001"),
            max_tokens=350,
            messages=[{"role": "user", "content": prompt}],
        )
        text = msg.content[0].text.strip()
        return {"ok": True, "text": text[:700]}
    except Exception as exc:
        logger.warning("버즈 AI 판단 생성 실패: %s", exc)
        return {"ok": False, "error": str(exc), "text": _fallback_buzz_judgement(snapshot, bot_signals)}


def _gsc_title_lesson(gsc: dict | None) -> str:
    """GSC 저CTR 검색어 → '제목 표현 교훈'으로 변환.

    핵심: 이건 제목을 어떻게 쓸지에 대한 교훈이지, 해당 주제를 반복하라는 신호가 아님.
    (예: '포켓몬카드 왜삼?'이 노출되는 건 포켓몬 글을 더 쓰라는 뜻이 아니라,
    사람들이 질문형·구체 키워드로 검색하니 제목을 그 표현에 맞추라는 뜻.)
    """
    if not gsc or not gsc.get("ok"):
        return "- 제목 표현 교훈(GSC): 데이터 미수집"
    candidates = gsc.get("title_fix_candidates", [])
    if not candidates:
        return "- 제목 표현 교훈(GSC): 노출 대비 저CTR 검색어 아직 없음 (트래픽 누적 중)"
    queries = "; ".join(
        f"'{c['query']}'(노출 {c['impressions']})" for c in candidates[:4]
    )
    return (
        f"- 제목 표현 교훈(GSC): 다음 검색어들은 노출은 되는데 클릭이 안 됨 → 사람들이 실제로 "
        f"검색하는 표현(질문형·구체 키워드)을 제목에 반영하라. "
        f"단, 이건 '제목을 어떻게 쓸지'에 대한 교훈일 뿐 해당 주제를 다시 쓰라는 뜻이 아니다 "
        f"(주제는 최신 트렌드에서 고른다). 근거 검색어: {queries}"
    )


def render_buzz_growth_memory(snapshot: dict, ga: dict, access_logs: dict, bot_signals: list[str], headlines: list[dict], gsc: dict | None = None) -> str:
    top_tags = ", ".join(tag for tag, _ in snapshot["top_tags"][:5]) or "없음"
    top_posts = "; ".join(post["title"] for post in snapshot["top_posts"][:3]) or "없음"
    hot_signals = "; ".join(item["title"] for item in headlines[:3]) or "없음"
    bot_text = "; ".join(bot_signals[:3]) or "강한 의심 신호 없음"
    overview = ga.get("overview") if ga.get("ok") else {}
    channels = ", ".join(f"{c['channel']} {c['sessions']}" for c in ga.get("channels", [])[:3]) or "없음"

    return "\n".join([
        GROWTH_MEMORY_START,
        f"[Blog Growth Signals {snapshot['date']}]",
        f"- 자체 조회: 대상일 {snapshot['today_visits']}, 전일 {snapshot['yesterday_visits']}, 대상 7일 {snapshot['week_visits']}, 포스트뷰 {snapshot['unique_post_views_today']}",
        f"- GA: 세션 {overview.get('sessions', 'N/A')}, 페이지뷰 {overview.get('page_views', 'N/A')}, 이탈률 {overview.get('bounce_rate', 'N/A')}%, 체류 {overview.get('avg_session_sec', 'N/A')}초",
        f"- 유입 채널: {channels}",
        f"- 잘 먹힌 태그: {top_tags}",
        f"- 반응 상위 글: {top_posts}",
        f"- 봇/저품질 신호: {bot_text}",
        f"- 현재 트렌드 힌트: {hot_signals}",
        _gsc_title_lesson(gsc),
        "- 다음 글 전략: 상위 태그와 트렌드 힌트를 섞되, 봇 의심 신호가 강한 날은 조회수보다 GA 체류/채널을 우선 판단.",
        GROWTH_MEMORY_END,
    ])


def _replace_growth_memory_section(current_memory: str | None, section: str, limit: int = 1800) -> str:
    current = (current_memory or "").strip()
    start = current.find(GROWTH_MEMORY_START)
    end = current.find(GROWTH_MEMORY_END)
    if start >= 0 and end >= start:
        end += len(GROWTH_MEMORY_END)
        updated = f"{current[:start].rstrip()}\n\n{section}\n\n{current[end:].lstrip()}".strip()
    elif current:
        updated = f"{current}\n\n{section}"
    else:
        updated = section
    return updated[-limit:].strip() if len(updated) > limit else updated


def update_buzz_growth_memory(db: Session, snapshot: dict, ga: dict, access_logs: dict, bot_signals: list[str], headlines: list[dict], gsc: dict | None = None) -> dict:
    section = render_buzz_growth_memory(snapshot, ga, access_logs, bot_signals, headlines, gsc)
    row = db.query(AgentMemory).filter(AgentMemory.agent_id == "buzz").first()
    if row:
        row.memory = _replace_growth_memory_section(row.memory, section)
        row.updated_at = datetime.utcnow()
    else:
        row = AgentMemory(agent_id="buzz", memory=section)
        db.add(row)
    db.commit()
    return {"ok": True, "agent_id": "buzz", "chars": len(row.memory or "")}


def _memory_excerpt(text: str | None, limit: int = 650) -> str:
    if not text:
        return "없음"
    compact = "\n".join(line.rstrip() for line in text.strip().splitlines() if line.strip())
    return compact[:limit] + ("..." if len(compact) > limit else "")


def _growth_memory_section(text: str | None) -> str | None:
    if not text:
        return None
    start = text.find(GROWTH_MEMORY_START)
    end = text.find(GROWTH_MEMORY_END)
    if start < 0 or end < start:
        return None
    end += len(GROWTH_MEMORY_END)
    return text[start:end].strip()


def render_weekly_prompt_memory_report(db: Session) -> dict:
    agent_ids = ["buzz", "over", "pixel", "ka"]
    rows = {row.agent_id: row for row in db.query(AgentMemory).filter(AgentMemory.agent_id.in_(agent_ids)).all()}
    today = datetime.now(ZoneInfo("Asia/Seoul")).date().isoformat()
    lines = [
        f"프롬프트 주입 메모리 주간 리포트 ({today})",
        "",
        "이번 주 블로그 생성 프롬프트에 들어갈 에이전트 메모리 요약입니다.",
    ]
    payload = {}

    for agent_id in agent_ids:
        row = rows.get(agent_id)
        memory = row.memory if row else None
        growth = _growth_memory_section(memory) if agent_id == "buzz" else None
        excerpt = _memory_excerpt(memory)
        payload[agent_id] = {
            "chars": len(memory or ""),
            "updated_at": row.updated_at.isoformat() if row and row.updated_at else None,
            "growth_section": growth,
            "excerpt": excerpt,
        }
        lines.extend([
            "",
            f"[{agent_id}] chars={payload[agent_id]['chars']} updated={payload[agent_id]['updated_at'] or 'unknown'}",
            _memory_excerpt(growth, 500) if growth else excerpt,
        ])

    return {"date": today, "agents": payload, "text": "\n".join(lines)}


async def build_weekly_prompt_memory_report(db: Session, send_slack: bool = False) -> dict:
    report = render_weekly_prompt_memory_report(db)
    slack = await send_slack_report(report["text"]) if send_slack else {"ok": False, "skipped": True}
    return {"ok": True, **report, "slack": slack}


async def send_slack_report(text: str) -> dict:
    webhook_url = os.environ.get("BLOG_REPORT_SLACK_WEBHOOK_URL") or os.environ.get("SLACK_WEBHOOK_URL")
    if not webhook_url:
        return {"ok": False, "skipped": True, "reason": "missing_slack_webhook"}

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(webhook_url, json={"text": text})
    if response.status_code >= 400:
        return {"ok": False, "status_code": response.status_code, "body": response.text[:500]}
    return {"ok": True, "status_code": response.status_code}


async def build_daily_blog_report(db: Session, send_slack: bool = False, update_memory: bool | None = None) -> dict:
    snapshot = collect_blog_report_snapshot(db)
    ga = fetch_daily_ga_summary()
    access_logs = analyze_access_logs()
    bot_signals = assess_bot_signals(snapshot, ga, access_logs)
    headlines = await fetch_trend_headlines()
    gsc = fetch_gsc_summary()
    if gsc.get("ok"):
        attach_post_titles(db, gsc.get("title_fix_candidates", []))
    judgement = await generate_buzz_judgement(snapshot, ga, access_logs, bot_signals, headlines)
    text = render_buzz_report(snapshot, headlines, ga, access_logs, bot_signals, judgement["text"], gsc)
    should_update_memory = send_slack if update_memory is None else update_memory
    memory = update_buzz_growth_memory(db, snapshot, ga, access_logs, bot_signals, headlines, gsc) if should_update_memory else {"ok": False, "skipped": True}
    slack = await send_slack_report(text) if send_slack else {"ok": False, "skipped": True}
    return {
        "ok": True,
        "snapshot": snapshot,
        "ga": ga,
        "access_logs": access_logs,
        "bot_signals": bot_signals,
        "headlines": headlines,
        "gsc": gsc,
        "judgement": judgement,
        "memory": memory,
        "text": text,
        "slack": slack,
    }
