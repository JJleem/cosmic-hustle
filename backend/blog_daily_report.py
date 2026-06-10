import json
import logging
import os
from collections import Counter
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import feedparser
import httpx
from sqlalchemy import func
from sqlalchemy.orm import Session

from db.models import BlogComment, BlogDailyVisit, BlogPost

logger = logging.getLogger(__name__)

TREND_QUERIES = ("AI 트렌드", "블로그 바이럴", "테크 트렌드")


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

    return {
        "date": today.isoformat(),
        "today_visits": _visit_count(db, today),
        "yesterday_visits": _visit_count(db, today - timedelta(days=1)),
        "week_visits": sum(item["count"] for item in daily_visits),
        "total_visits": int(total_visits),
        "daily_visits": daily_visits,
        "top_posts": scored_posts[:5],
        "top_tags": tag_counter.most_common(8),
        "recent_trends": trend_counter.most_common(5),
    }


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


def render_buzz_report(snapshot: dict, headlines: list[dict]) -> str:
    visits_delta = snapshot["today_visits"] - snapshot["yesterday_visits"]
    delta_mark = "+" if visits_delta >= 0 else ""
    top_tags = ", ".join(tag for tag, _ in snapshot["top_tags"][:5]) or "아직 없음"
    top_trends = ", ".join(topic for topic, _ in snapshot["recent_trends"][:3]) or "아직 없음"

    lines = [
        f"버즈의 블로그 데일리 리포트 ({snapshot['date']})",
        "",
        f"조회: 오늘 {snapshot['today_visits']} / 어제 {snapshot['yesterday_visits']} ({delta_mark}{visits_delta}) / 7일 {snapshot['week_visits']} / 누적 {snapshot['total_visits']}",
        f"잘 먹히는 태그: {top_tags}",
        f"최근 포스트 주제: {top_trends}",
        "",
        "상위 포스트",
    ]

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
    headlines = await fetch_trend_headlines()
    text = render_buzz_report(snapshot, headlines)
    slack = await send_slack_report(text) if send_slack else {"ok": False, "skipped": True}
    return {"ok": True, "snapshot": snapshot, "headlines": headlines, "text": text, "slack": slack}
