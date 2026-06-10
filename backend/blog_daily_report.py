import json
import logging
import os
import re
from collections import Counter
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import feedparser
import httpx
from sqlalchemy import func
from sqlalchemy.orm import Session

from db.models import BlogComment, BlogDailyVisit, BlogPost, BlogViewLog

logger = logging.getLogger(__name__)

TREND_QUERIES = ("AI 트렌드", "블로그 바이럴", "테크 트렌드")
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


def collect_blog_report_snapshot(db: Session, today: date | None = None) -> dict:
    today = today or datetime.now(ZoneInfo("Asia/Seoul")).date()
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
        "today_visits": _visit_count(db, today),
        "yesterday_visits": _visit_count(db, today - timedelta(days=1)),
        "week_visits": sum(item["count"] for item in daily_visits),
        "total_visits": int(total_visits),
        "unique_post_views_today": int(unique_post_views_today),
        "daily_visits": daily_visits,
        "top_posts": scored_posts[:5],
        "top_tags": tag_counter.most_common(8),
        "recent_trends": trend_counter.most_common(5),
    }


def fetch_daily_ga_summary(today: date | None = None) -> dict:
    today = today or datetime.now(ZoneInfo("Asia/Seoul")).date()
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


def analyze_access_logs(today: date | None = None, max_lines: int = 5000) -> dict:
    today = today or datetime.now(ZoneInfo("Asia/Seoul")).date()
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
    return {
        "ok": bool(readable),
        "date": today.isoformat(),
        "checked_paths": checked,
        "readable_paths": readable,
        "total_lines_today": total,
        "bot_hits": bot_hits,
        "bot_ratio": ratio,
        "top_bot_uas": bot_uas.most_common(5),
        "top_paths": top_paths.most_common(5),
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
) -> str:
    visits_delta = snapshot["today_visits"] - snapshot["yesterday_visits"]
    delta_mark = "+" if visits_delta >= 0 else ""
    top_tags = ", ".join(tag for tag, _ in snapshot["top_tags"][:5]) or "아직 없음"
    top_trends = ", ".join(topic for topic, _ in snapshot["recent_trends"][:3]) or "아직 없음"

    lines = [
        f"버즈의 블로그 데일리 리포트 ({snapshot['date']})",
        "",
        f"조회: 오늘 {snapshot['today_visits']} / 어제 {snapshot['yesterday_visits']} ({delta_mark}{visits_delta}) / 7일 {snapshot['week_visits']} / 누적 {snapshot['total_visits']}",
        f"자체 포스트뷰: 오늘 {snapshot['unique_post_views_today']}",
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
        lines.append(
            f"- access log: 오늘 {access_logs['total_lines_today']}줄 중 bot UA {access_logs['bot_hits']}건 ({access_logs['bot_ratio']}%)"
        )

    if access_logs.get("top_bot_uas"):
        ua = access_logs["top_bot_uas"][0][0]
        lines.append(f"- 최다 bot UA: {ua}")
    if access_logs.get("top_paths"):
        path = access_logs["top_paths"][0][0]
        lines.append(f"- 의심/주요 경로: {path}")

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

    lines.extend(["", "오늘 핫한 신호"])
    if headlines:
        for item in headlines[:5]:
            lines.append(f"- [{item['query']}] {item['title']}")
    else:
        lines.append("- 외부 트렌드 수집값 없음. 내부 반응 기준으로만 판단.")

    lines.extend([
        "",
        "버즈 판단: 위 상위 태그/핫 신호를 섞어서 다음 글 제목은 더 직접적으로 가자. 바이럴 각은 숫자가 오른 포스트의 제목 패턴에서 먼저 찾기.",
    ])
    return "\n".join(lines)


async def send_slack_report(text: str) -> dict:
    webhook_url = os.environ.get("BLOG_REPORT_SLACK_WEBHOOK_URL") or os.environ.get("SLACK_WEBHOOK_URL")
    if not webhook_url:
        return {"ok": False, "skipped": True, "reason": "missing_slack_webhook"}

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(webhook_url, json={"text": text})
    if response.status_code >= 400:
        return {"ok": False, "status_code": response.status_code, "body": response.text[:500]}
    return {"ok": True, "status_code": response.status_code}


async def build_daily_blog_report(db: Session, send_slack: bool = False) -> dict:
    snapshot = collect_blog_report_snapshot(db)
    ga = fetch_daily_ga_summary()
    access_logs = analyze_access_logs()
    bot_signals = assess_bot_signals(snapshot, ga, access_logs)
    headlines = await fetch_trend_headlines()
    text = render_buzz_report(snapshot, headlines, ga, access_logs, bot_signals)
    slack = await send_slack_report(text) if send_slack else {"ok": False, "skipped": True}
    return {
        "ok": True,
        "snapshot": snapshot,
        "ga": ga,
        "access_logs": access_logs,
        "bot_signals": bot_signals,
        "headlines": headlines,
        "text": text,
        "slack": slack,
    }
