"""사원상 — 글별 성과/비용 지표 수집 + 3축 점수 산출.

설계 원칙(스펙 §3):
- raw 트래픽으로 줄세우지 않는다. 성과는 *교란 보정된* 지표만:
  · GSC 순위 대비 CTR 잔차(impressions 운 제거)
  · GA 평균 참여시간(유입량 운 제거)
- 점수는 저장된 raw 지표에서 *API 시점에* 계산 → 가중치·정규화를 재수집 없이 튜닝.
- raw를 그대로 노출해 "왜 한 숫자로 안 합쳤나"를 화면이 증명.
"""
import logging
from calendar import monthrange
from datetime import date
from urllib.parse import urlparse

from sqlalchemy.orm import Session

from db.models import BlogPost, BlogPostMetrics, BlogPostCost

logger = logging.getLogger(__name__)

DEFAULT_WEIGHTS = {"performance": 0.5, "quality": 0.3, "efficiency": 0.2}


def _period_range(period: str) -> tuple[str, str]:
    """'YYYY-MM' → (시작일, 종료일). 종료일은 이번 달이면 오늘, 지난 달이면 말일."""
    year, month = (int(x) for x in period.split("-"))
    start = date(year, month, 1)
    last = date(year, month, monthrange(year, month)[1])
    today = date.today()
    end = min(last, today) if (year, month) == (today.year, today.month) else last
    return start.isoformat(), end.isoformat()


def _slug_from_path(path: str) -> str:
    """GA pagePath('/slug') 또는 GSC page(full URL)에서 slug 추출."""
    if path.startswith("http"):
        path = urlparse(path).path
    return path.strip("/").split("?")[0]


def collect_post_metrics(db: Session, period: str) -> int:
    """해당 period에 발행된 글들의 GSC/GA 지표를 모아 blog_post_metrics에 upsert. 반환: 처리한 글 수.

    GA/GSC 자격증명이 없거나 호출 실패 시 해당 소스는 0으로 둔다(부분 수집 허용).
    """
    start, end = _period_range(period)

    # 이번 period 발행 글 (slug → post)
    posts = (
        db.query(BlogPost)
        .filter(BlogPost.published_at >= f"{start} 00:00:00", BlogPost.published_at <= f"{end} 23:59:59")
        .all()
    )
    by_slug = {p.slug: p for p in posts}
    if not by_slug:
        return 0

    ga_by_slug: dict[str, dict] = {}
    try:
        from ga_client import fetch_page_metrics
        for row in fetch_page_metrics(start, end, limit=200):
            ga_by_slug[_slug_from_path(row["path"])] = row
    except Exception as e:
        logger.warning(f"GA 지표 수집 실패 (period={period}): {e}")

    gsc_by_slug: dict[str, dict] = {}
    try:
        from gsc_client import fetch_query_page_rows
        agg: dict[str, dict] = {}
        for row in fetch_query_page_rows(start, end, row_limit=1000):
            slug = _slug_from_path(row["page"])
            item = agg.setdefault(slug, {"clicks": 0, "impressions": 0, "pos_weighted": 0.0})
            item["clicks"] += row["clicks"]
            item["impressions"] += row["impressions"]
            item["pos_weighted"] += row["position"] * row["impressions"]
        for slug, item in agg.items():
            impr = item["impressions"]
            gsc_by_slug[slug] = {
                "clicks": item["clicks"],
                "impressions": impr,
                "ctr": round(item["clicks"] / impr, 4) if impr else 0.0,
                "position": round(item["pos_weighted"] / impr, 1) if impr else 0.0,
            }
    except Exception as e:
        logger.warning(f"GSC 지표 수집 실패 (period={period}): {e}")

    for slug, post in by_slug.items():
        ga = ga_by_slug.get(slug, {})
        gsc = gsc_by_slug.get(slug, {})
        row = db.get(BlogPostMetrics, (post.id, period))
        if row is None:
            row = BlogPostMetrics(post_id=post.id, period=period, agent_id=post.agent_id)
            db.add(row)
        row.agent_id = post.agent_id
        row.impressions = gsc.get("impressions", 0)
        row.clicks = gsc.get("clicks", 0)
        row.ctr = gsc.get("ctr", 0.0)
        row.position = gsc.get("position", 0.0)
        row.sessions = ga.get("sessions", 0)
        row.avg_session_sec = ga.get("avg_session_sec", 0)
    db.commit()
    return len(by_slug)


# ── 점수 산출 ─────────────────────────────────────────────────────────────────

def _median(values: list[float]) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    n = len(s)
    mid = n // 2
    return s[mid] if n % 2 else (s[mid - 1] + s[mid]) / 2


def _minmax_norm(value: float, lo: float, hi: float) -> float:
    """[lo,hi] → [0,100]. 범위 0이면 50(중립)."""
    if hi <= lo:
        return 50.0
    return round((value - lo) / (hi - lo) * 100, 1)


def _ctr_residual_map(rows: list[BlogPostMetrics]) -> dict[str, float]:
    """글별 'CTR 잔차' = 실제 CTR − 동일 정수 순위의 사이트 중앙 CTR.
    외부 CTR 곡선표 없이 자가 보정(노출량 운 제거). 노출 부족(<5)인 글은 잔차 0."""
    by_pos: dict[int, list[float]] = {}
    for r in rows:
        if r.impressions >= 5 and r.position > 0:
            by_pos.setdefault(round(r.position), []).append(r.ctr)
    pos_median = {pos: _median(ctrs) for pos, ctrs in by_pos.items()}
    out: dict[str, float] = {}
    for r in rows:
        if r.impressions >= 5 and r.position > 0:
            out[r.post_id] = round(r.ctr - pos_median.get(round(r.position), r.ctr), 4)
        else:
            out[r.post_id] = 0.0
    return out


def build_awards(db: Session, period: str, weights: dict | None = None) -> dict:
    """blog_post_metrics + blog_post_cost를 읽어 글/에이전트 단위 3축 점수 JSON 생성."""
    weights = weights or DEFAULT_WEIGHTS
    rows = db.query(BlogPostMetrics).filter(BlogPostMetrics.period == period).all()
    posts = {p.id: p for p in db.query(BlogPost).filter(BlogPost.id.in_([r.post_id for r in rows])).all()} if rows else {}

    # 글별 비용 합 + phase 분해
    cost_rows = db.query(BlogPostCost).filter(BlogPostCost.post_id.in_(list(posts.keys()))).all() if posts else []
    cost_total: dict[str, float] = {}
    cost_break: dict[str, dict] = {}
    for c in cost_rows:
        cost_total[c.post_id] = cost_total.get(c.post_id, 0.0) + (c.cost_usd or 0.0)
        cost_break.setdefault(c.post_id, {})
        cost_break[c.post_id][c.phase] = round(cost_break[c.post_id].get(c.phase, 0.0) + (c.cost_usd or 0.0), 6)

    residual = _ctr_residual_map(rows)

    # 정규화 범위 (이 period 글 전체 기준)
    res_vals = [residual[r.post_id] for r in rows]
    eng_vals = [r.avg_session_sec for r in rows]
    res_lo, res_hi = (min(res_vals), max(res_vals)) if res_vals else (0, 0)
    eng_lo, eng_hi = (min(eng_vals), max(eng_vals)) if eng_vals else (0, 0)

    post_out = []
    perf_by_post: dict[str, float] = {}
    eff_by_post: dict[str, float] = {}
    for r in rows:
        perf = round(0.5 * _minmax_norm(residual[r.post_id], res_lo, res_hi)
                     + 0.5 * _minmax_norm(r.avg_session_sec, eng_lo, eng_hi), 1)
        perf_by_post[r.post_id] = perf
        cost = cost_total.get(r.post_id)
        eff_raw = (perf / cost) if cost else None  # 비용 데이터 없는 글(로깅 이전)은 효율 미산정
        post = posts.get(r.post_id)
        post_out.append({
            "post_id": r.post_id,
            "slug": post.slug if post else None,
            "title": post.title if post else None,
            "agent_id": r.agent_id,
            "is_collab": "+" in r.agent_id,  # 토론/인트로 합작 글 — agents 랭킹엔 안 들어감
            "published_at": post.published_at.date().isoformat() if post and post.published_at else None,
            "metrics": {
                "impressions": r.impressions, "clicks": r.clicks, "ctr": r.ctr,
                "position": r.position, "ctr_residual": residual[r.post_id],
                "sessions": r.sessions, "avg_session_sec": r.avg_session_sec,
            },
            "cost_usd": round(cost, 6) if cost else None,
            "cost_breakdown": cost_break.get(r.post_id),
            "scores": {"performance": perf, "efficiency": None},  # efficiency는 정규화 후 채움
            "_eff_raw": eff_raw,
        })

    # 효율 정규화 ([있는 글]끼리 min-max)
    eff_raws = [p["_eff_raw"] for p in post_out if p["_eff_raw"] is not None]
    eff_lo, eff_hi = (min(eff_raws), max(eff_raws)) if eff_raws else (0, 0)
    for p in post_out:
        if p["_eff_raw"] is not None:
            eff = _minmax_norm(p["_eff_raw"], eff_lo, eff_hi)
            p["scores"]["efficiency"] = eff
            eff_by_post[p["post_id"]] = eff
        del p["_eff_raw"]

    # 에이전트 집계 (합작 글 'buzz+ping' 등은 개인 시상 대상 아니라 랭킹 제외 — posts 목록엔 남음)
    agents: dict[str, dict] = {}
    for r in rows:
        if "+" in r.agent_id:
            continue
        a = agents.setdefault(r.agent_id, {
            "post_ids": [], "res": [], "eng": [], "cost": [], "break": {},
        })
        a["post_ids"].append(r.post_id)
        a["res"].append(residual[r.post_id])
        a["eng"].append(r.avg_session_sec)
        if cost_total.get(r.post_id):
            a["cost"].append(cost_total[r.post_id])
        for phase, v in (cost_break.get(r.post_id) or {}).items():
            a["break"][phase] = round(a["break"].get(phase, 0.0) + v, 6)

    has_quality = False  # 1축(LLM 판사)은 v2
    agent_out = []
    for agent_id, a in agents.items():
        perfs = [perf_by_post[pid] for pid in a["post_ids"]]
        effs = [eff_by_post[pid] for pid in a["post_ids"] if pid in eff_by_post]
        perf = round(sum(perfs) / len(perfs), 1) if perfs else None
        eff = round(sum(effs) / len(effs), 1) if effs else None
        total = _weighted_total({"performance": perf, "quality": None, "efficiency": eff}, weights)
        n_cost = len(a["cost"])
        agent_out.append({
            "agent_id": agent_id,
            "post_count": len(a["post_ids"]),
            "scores": {"performance": perf, "quality": None, "efficiency": eff, "total": total},
            "raw": {
                "ctr_residual_avg": round(sum(a["res"]) / len(a["res"]), 4) if a["res"] else 0.0,
                "avg_session_sec": round(sum(a["eng"]) / len(a["eng"])) if a["eng"] else 0,
                "cost_usd_per_post": round(sum(a["cost"]) / n_cost, 6) if n_cost else None,
                "cost_breakdown": a["break"] or None,
            },
        })
    agent_out.sort(key=lambda x: (x["scores"]["total"] is None, -(x["scores"]["total"] or 0)))

    return {
        "period": period,
        "weights": weights,
        "axis_status": {
            "performance": "live",
            "quality": "live" if has_quality else "v2_pending",
            "efficiency": "live",
        },
        "agents": agent_out,
        "posts": post_out,
    }


def _weighted_total(scores: dict, weights: dict) -> float | None:
    """사용 가능한(None 아닌) 축만 골라 가중치 재정규화 후 합. 전부 None이면 None."""
    avail = {k: v for k, v in scores.items() if v is not None and weights.get(k)}
    if not avail:
        return None
    wsum = sum(weights[k] for k in avail)
    return round(sum(scores[k] * weights[k] for k in avail) / wsum, 1)
