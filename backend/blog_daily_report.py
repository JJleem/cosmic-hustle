import json
import logging
import os
import re
import subprocess
from collections import Counter
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import feedparser
import httpx
from sqlalchemy import func
from sqlalchemy.orm import Session

from db.models import AgentMemory, BlogComment, BlogDailyVisit, BlogPost, BlogPostLike, BlogViewLog
from anthropic_text import text_of

logger = logging.getLogger(__name__)

TREND_QUERIES = ("AI 트렌드", "블로그 바이럴", "테크 트렌드")
GROWTH_MEMORY_START = "<!-- blog-growth-memory:start -->"
GROWTH_MEMORY_END = "<!-- blog-growth-memory:end -->"
BOT_UA_MARKERS = (
    "bot", "crawler", "spider", "slurp", "bingpreview", "facebookexternalhit",
    "ahrefs", "semrush", "bytespider", "petalbot", "mj12bot", "python-requests",
    "curl", "wget",
)
HAIKU_INPUT_USD_PER_MTOK = 1.0
HAIKU_OUTPUT_USD_PER_MTOK = 5.0


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


def _kst_day_bounds_utc(day: date) -> tuple[datetime, datetime]:
    start_kst = datetime.combine(day, time.min, tzinfo=ZoneInfo("Asia/Seoul"))
    end_kst = start_kst + timedelta(days=1)
    return (
        start_kst.astimezone(timezone.utc).replace(tzinfo=None),
        end_kst.astimezone(timezone.utc).replace(tzinfo=None),
    )


def _rank_daily_posts(
    posts: list,
    daily_views: dict[str, int],
    human_comments: dict[str, int],
    human_likes: dict[str, int],
) -> list[dict]:
    ranked = []
    for post in posts:
        views = int(daily_views.get(post.id, 0))
        comments = int(human_comments.get(post.id, 0))
        likes = int(human_likes.get(post.id, 0))
        if not (views or comments or likes):
            continue
        ranked.append({
            "title": post.title,
            "slug": post.slug,
            "agent_id": post.agent_id,
            "content_type": getattr(post, "content_type", None),
            "views": views,
            "likes": likes,
            "comments": comments,
            "score": views + likes * 5 + comments * 3,
            "tags": _parse_tags(post.tags),
        })
    return sorted(
        ranked,
        key=lambda item: (item["score"], item["views"], item["comments"], item["likes"]),
        reverse=True,
    )


def _merge_engaged_post_ids(
    daily_views: dict[str, int],
    human_comments: dict[str, int],
    human_likes: dict[str, int],
) -> list[str]:
    post_ids: list[str] = []
    seen: set[str] = set()
    for source in (daily_views, human_comments, human_likes):
        for post_id, count in source.items():
            if int(count or 0) <= 0 or post_id in seen:
                continue
            seen.add(post_id)
            post_ids.append(post_id)
    return post_ids


def collect_blog_report_snapshot(db: Session, today: date | None = None) -> dict:
    today = today or _default_report_date()
    compare_day = today - timedelta(days=1)
    week_start = today - timedelta(days=6)
    day_start_utc, day_end_utc = _kst_day_bounds_utc(today)

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
    trend_counter: Counter[str] = Counter()
    for post in recent_posts:
        if post.trending_topic:
            trend_counter.update([post.trending_topic])

    daily_view_rows = (
        db.query(BlogViewLog.post_id, func.count(BlogViewLog.ip_hash))
        .filter(BlogViewLog.date == today.isoformat())
        .group_by(BlogViewLog.post_id)
        .all()
    )
    daily_views = {post_id: int(count) for post_id, count in daily_view_rows}

    comment_rows = (
        db.query(BlogComment.post_id, func.count(BlogComment.id))
        .filter(
            BlogComment.agent_id.is_(None),
            BlogComment.created_at >= day_start_utc,
            BlogComment.created_at < day_end_utc,
        )
        .group_by(BlogComment.post_id)
        .all()
    )
    human_comments = {post_id: int(count) for post_id, count in comment_rows}
    like_rows = (
        db.query(BlogPostLike.post_id, func.count(BlogPostLike.ip_hash))
        .filter(
            BlogPostLike.created_at >= day_start_utc,
            BlogPostLike.created_at < day_end_utc,
        )
        .group_by(BlogPostLike.post_id)
        .all()
    )
    human_likes = {post_id: int(count) for post_id, count in like_rows}

    active_post_ids = _merge_engaged_post_ids(daily_views, human_comments, human_likes)
    active_posts = (
        db.query(BlogPost)
        .filter(BlogPost.id.in_(active_post_ids), BlogPost.published == True)
        .all()
        if active_post_ids else []
    )

    scored_posts = _rank_daily_posts(active_posts, daily_views, human_comments, human_likes)
    tag_counter: Counter[str] = Counter()
    for post in scored_posts:
        for tag in post["tags"]:
            tag_counter[tag] += post["views"]

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


def _truncate_complete_lines(text: str, limit: int, max_lines: int | None = None) -> str:
    lines = [line.rstrip() for line in (text or "").strip().splitlines() if line.strip()]
    selected: list[str] = []
    omitted = False
    for line in lines:
        if max_lines is not None and len(selected) >= max_lines:
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
        return "요약 생략 (첫 줄이 너무 김)"
    if omitted:
        selected.append("… (이하 생략)")
    return "\n".join(selected)


def _daily_human_comment_total(snapshot: dict) -> int:
    return sum(int(post.get("comments") or 0) for post in snapshot.get("top_posts", []))


def _ai_debate_is_supported(snapshot: dict) -> bool:
    if _daily_human_comment_total(snapshot) >= 2:
        return True
    return any((post.get("content_type") or "").upper() == "DEBATE" for post in snapshot.get("top_posts", []))


def _guard_buzz_judgement(text: str, snapshot: dict, bot_signals: list[str]) -> str:
    if re.search(r"추천\s*슬롯\s*:\s*ai_debate\b", text or "", re.I) and not _ai_debate_is_supported(snapshot):
        return _fallback_buzz_judgement(snapshot, bot_signals)
    return text


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
    ai_cost_line: str | None = None,
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
        "대상일 반응 상위 포스트 (일일 순방문·사람 반응만)",
    ])

    if snapshot["top_posts"]:
        for idx, post in enumerate(snapshot["top_posts"][:3], start=1):
            lines.append(
                f"{idx}. {post['title']} - 일일 조회 {post['views']}, 사람 좋아요 {post['likes']}, 사람 댓글 {post['comments']}"
            )
    else:
        lines.append("아직 발행/반응 데이터가 부족함")

    lines.extend(["", "현재 핫한 신호"])
    if headlines:
        for item in headlines[:3]:
            lines.append(f"- [{item['query']}] {item['title']}")
    else:
        lines.append("- 외부 트렌드 수집값 없음. 내부 반응 기준으로만 판단.")

    candidates = gsc.get("title_fix_candidates", []) if gsc and gsc.get("ok") else []
    if candidates:
        lines.extend(["", "제목 보강 후보 (GSC 저CTR 검색어)"])
        for cand in candidates[:5]:
            ctr_pct = round(cand["ctr"] * 100, 1)
            title = cand.get("title", cand["page"])
            lines.append(
                f"- '{cand['query']}' 노출 {cand['impressions']}/CTR {ctr_pct}%/순위 {cand['position']} → [{title}] 제목 재검토"
            )

    lines.extend([
        "",
        f"버즈 판단:\n{_truncate_complete_lines(judgement, limit=650, max_lines=7)}",
    ])
    if ai_cost_line:
        lines.extend(["", ai_cost_line])
    return "\n".join(lines)


def render_ai_cost_line(judgement: dict) -> str:
    usage = judgement.get("usage") or {}
    cost = judgement.get("cost_usd")
    if not usage or cost is None:
        if judgement.get("skipped"):
            return "AI 비용: 판단 생성 스킵됨 (0달러)"
        return "AI 비용: usage 미수집"
    return (
        f"AI 비용: Haiku input {usage.get('input_tokens', 0)} / output {usage.get('output_tokens', 0)} "
        f"→ 약 ${cost:.6f}"
    )


def _fallback_buzz_judgement(snapshot: dict, bot_signals: list[str]) -> str:
    if bot_signals:
        return "\n".join([
            "추천 슬롯: trend_reaction",
            "이유: 봇/저품질 신호가 있으니 조회수보다 GA 체류·채널을 우선 보며, 트렌드를 Cosmic Hustle 관점으로 짧게 해석하는 편이 안전.",
            "제목 후보: 1. AI 뉴스가 매일 쏟아질 때 우리가 봐야 할 신호 2. 바이럴보다 체류시간이 먼저다 3. 오늘의 AI 트렌드를 우주 직원들이 읽는 법",
            "피할 것: 조회수만 보고 같은 주제 반복하기",
        ])
    if snapshot["top_posts"]:
        return "\n".join([
            "추천 슬롯: character_essay",
            "이유: 상위 글의 감성/직접 제목 패턴이 먹히는 중이라 캐릭터 목소리로 체류를 늘리는 실험이 좋음.",
            "제목 후보: 1. 아이디어가 너무 많은 사람의 밤 2. 시작 전 설렘을 오래 붙잡는 법 3. 내가 만든 세계에 내가 제일 늦게 도착했다",
            "피할 것: 현재 트렌드 기사를 그대로 요약하기",
        ])
    return "\n".join([
        "추천 슬롯: ai_test",
        "이유: 데이터가 아직 얇으니 댓글/체류를 만들 수 있는 참여형 실험을 쌓는 편이 좋음.",
        "제목 후보: 1. 나는 어떤 Cosmic Hustle 직원일까? 2. 내 아이디어는 핑형인가 버즈형인가? 3. AI 사무실에서 내 역할은 무엇일까?",
        "피할 것: 너무 기술적인 AI 뉴스 단순 요약",
    ])


def _cost_usd(input_tokens: int, output_tokens: int) -> float:
    input_rate = float(os.environ.get("BLOG_REPORT_AI_INPUT_USD_PER_MTOK", HAIKU_INPUT_USD_PER_MTOK))
    output_rate = float(os.environ.get("BLOG_REPORT_AI_OUTPUT_USD_PER_MTOK", HAIKU_OUTPUT_USD_PER_MTOK))
    return (input_tokens / 1_000_000 * input_rate) + (output_tokens / 1_000_000 * output_rate)


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
            "daily_top_posts": snapshot["top_posts"][:3],
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
한국어로 650자 이하.

반드시 아래 형식으로 출력:
추천 슬롯: <regular_post | character_essay | trend_reaction | ai_debate | ai_test | behind_story | marketing_hook 중 하나>
이유: <대상일 데이터 해석 + 왜 이 슬롯인지>
제목 후보:
1. <제목>
2. <제목>
3. <제목>
피할 것: <내일 글에서 피해야 할 방향>

슬롯 의미:
- regular_post: 일반 블로그/정보글
- character_essay: 오버식 감성 에세이
- trend_reaction: 최신 트렌드에 Cosmic Hustle식 반응
- ai_debate: AI 토론/찬반형
- ai_test: 퀴즈/테스트/참여형
- behind_story: 세계관/캐릭터/제작 비하인드
- marketing_hook: 버즈식 바이럴/마케팅 글

주의:
- GSC 검색어는 제목 표현 교정용이지, 그 주제를 반복하라는 뜻이 아님.
- daily_top_posts의 조회·좋아요·댓글은 대상일 하루 데이터이며 사람 반응만 포함한다.
- 에이전트 자동 댓글·에이전트 토론 투표·글의 누적 조회수는 성과 근거에 포함되지 않는다.
- 대상일 상위 글/태그는 참고하되 같은 장르를 연속 추천하지 말 것.
- ai_debate는 대상일 사람 댓글 합계가 2개 이상이거나 상위 글이 토론 글일 때만 추천할 것.
- 데이터가 적으면 성공을 단정하지 말고 새 포맷 실험을 추천할 것.
- 봇/저품질 유입 주의가 필요하면 이유나 피할 것에 짧게 반영.

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
        text = _guard_buzz_judgement(text_of(msg), snapshot, bot_signals)
        usage_obj = getattr(msg, "usage", None)
        input_tokens = int(getattr(usage_obj, "input_tokens", 0) or 0)
        output_tokens = int(getattr(usage_obj, "output_tokens", 0) or 0)
        return {
            "ok": True,
            "text": _truncate_complete_lines(text, limit=650, max_lines=7),
            "usage": {"input_tokens": input_tokens, "output_tokens": output_tokens},
            "cost_usd": _cost_usd(input_tokens, output_tokens),
        }
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


def render_buzz_growth_memory(
    snapshot: dict,
    ga: dict,
    access_logs: dict,
    bot_signals: list[str],
    headlines: list[dict],
    gsc: dict | None = None,
    judgement_text: str | None = None,
) -> str:
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
        f"- 대상일 조회 기반 태그: {top_tags}",
        f"- 대상일 반응 상위 글(사람 반응만): {top_posts}",
        f"- 봇/저품질 신호: {bot_text}",
        f"- 현재 트렌드 힌트: {hot_signals}",
        _gsc_title_lesson(gsc),
        f"- 버즈 슬롯 제안: {(judgement_text or '없음')[:650]}",
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
    if len(updated) <= limit:
        return updated
    lines = [line.rstrip() for line in updated.splitlines() if line.strip()]
    selected: list[str] = []
    for line in reversed(lines):
        candidate = "\n".join([line, *reversed(selected)])
        if len(candidate) > limit:
            break
        selected.append(line)
    kept = list(reversed(selected))
    if len(kept) < len(lines):
        kept.insert(0, "... (이전 내용 생략)")
    return "\n".join(kept).strip()


def update_buzz_growth_memory(
    db: Session,
    snapshot: dict,
    ga: dict,
    access_logs: dict,
    bot_signals: list[str],
    headlines: list[dict],
    gsc: dict | None = None,
    judgement_text: str | None = None,
) -> dict:
    section = render_buzz_growth_memory(snapshot, ga, access_logs, bot_signals, headlines, gsc, judgement_text)
    row = db.query(AgentMemory).filter(AgentMemory.agent_id == "buzz").first()
    if row:
        row.memory = _replace_growth_memory_section(row.memory, section)
        row.updated_at = datetime.utcnow()
    else:
        row = AgentMemory(agent_id="buzz", memory=section)
        db.add(row)
    db.commit()
    return {"ok": True, "agent_id": "buzz", "chars": len(row.memory or "")}


def _memory_excerpt(text: str | None, limit: int = 650, max_lines: int | None = None) -> str:
    if not text:
        return "없음"
    lines = [
        line.rstrip()
        for line in text.strip().splitlines()
        if line.strip() and line.strip() not in {GROWTH_MEMORY_START, GROWTH_MEMORY_END}
    ]
    selected: list[str] = []
    omitted = False
    for line in lines:
        if max_lines is not None and len(selected) >= max_lines:
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
        return "요약 생략 (첫 줄이 너무 김)"
    if omitted:
        selected.append("… (이하 생략)")
    return "\n".join(selected)


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
        excerpt = _memory_excerpt(memory, limit=360, max_lines=4)
        report_excerpt = _memory_excerpt(growth or memory, limit=360, max_lines=4)
        payload[agent_id] = {
            "chars": len(memory or ""),
            "updated_at": row.updated_at.isoformat() if row and row.updated_at else None,
            "growth_section": growth,
            "excerpt": excerpt,
        }
        lines.extend([
            "",
            f"[{agent_id}] {payload[agent_id]['chars']:,}자 · 갱신 {(payload[agent_id]['updated_at'] or 'unknown')[:10]}",
            report_excerpt,
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
    text = render_buzz_report(
        snapshot,
        headlines,
        ga,
        access_logs,
        bot_signals,
        judgement["text"],
        gsc,
        render_ai_cost_line(judgement),
    )
    should_update_memory = send_slack if update_memory is None else update_memory
    memory = update_buzz_growth_memory(db, snapshot, ga, access_logs, bot_signals, headlines, gsc, judgement["text"]) if should_update_memory else {"ok": False, "skipped": True}
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
