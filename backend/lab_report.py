"""실험실 리포트 — 우리 운영 데이터를 글감으로 만드는 수집기.

배경(2026-07-29): AdSense가 '가치 없는 콘텐츠'로 반려. 개별 글이 얇아서가 아니라
RSS를 재작성한 파생 콘텐츠를 대량 생산하는 구조라, 구글의 '대규모 콘텐츠 남용' 정의에
그대로 들어맞았다. 글을 더 잘 써서는 못 뒤집는다 — 원본에 없던 가치가 필요하다.

이 프로젝트가 유일하게 가진 1차 자료는 '운영 데이터 그 자체'다. 글별 실비용(토큰+이미지),
사원상 3축 점수, GSC/GA 지표, 타깃 검색어와 실제 노출의 대조 — 아무도 우리 대신 못 쓴다.
루트 사원이 이 데이터로 월 1회 리포트를 쓴다.

월 단위인 이유: blog_post_metrics.period가 YYYY-MM이고 GA 집계도 월간이라 기존 경계를
그대로 쓴다. 2주로 끊으면 현재 트래픽(월 노출 수십 회)에서 델타가 노이즈에 묻힌다.
"""
from __future__ import annotations

import logging
from collections import defaultdict
from datetime import date

log = logging.getLogger(__name__)

# 검색 수요 기반 주제 선정 배포일(커밋 315f15f). 이전 글의 trending_topic은 요일 테마
# ("감성 에세이" 등)라 검색어가 아니다 — 타깃 검증에 섞으면 "'감성 에세이'로 노출 성공"
# 같은 거짓 결론이 나온다. 이 날짜 이후 글만 검증 대상.
KEYWORD_ERA_START = date(2026, 7, 30)


def _prev_period(period: str) -> str:
    y, m = (int(x) for x in period.split("-"))
    return f"{y - 1}-12" if m == 1 else f"{y}-{m - 1:02d}"


def _period_bounds(period: str) -> tuple[date, date]:
    y, m = (int(x) for x in period.split("-"))
    start = date(y, m, 1)
    end = date(y + 1, 1, 1) if m == 12 else date(y, m + 1, 1)
    return start, end


def collect(db, period: str) -> dict:
    """한 달치 운영 데이터를 리포트용 dict로 모은다. 실패해도 예외를 던지지 않고
    가능한 만큼만 채운다 — 리포트는 데이터가 비면 그 사실 자체를 쓰면 된다."""
    from db.models import BlogPost, BlogPostCost, BlogPostMetrics

    start, end = _period_bounds(period)
    posts = (
        db.query(BlogPost)
        .filter(BlogPost.published_at >= start, BlogPost.published_at < end)
        .order_by(BlogPost.published_at)
        .all()
    )
    post_ids = [p.id for p in posts]

    # 비용: post별 phase 분해 + content phase 2회 이상 = 주제 중복으로 재작성된 글
    cost_by_post: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    content_runs: dict[str, int] = defaultdict(int)
    if post_ids:
        for c in db.query(BlogPostCost).filter(BlogPostCost.post_id.in_(post_ids)).all():
            cost_by_post[c.post_id][c.phase] += c.cost_usd or 0.0
            if c.phase == "content":
                content_runs[c.post_id] += 1

    metrics = {
        m.post_id: m
        for m in db.query(BlogPostMetrics).filter(BlogPostMetrics.period == period).all()
    }

    rows = []
    for p in posts:
        m = metrics.get(p.id)
        rows.append({
            "agent_id": p.agent_id,
            "title": p.title,
            "slug": p.slug,
            "target_keyword": p.trending_topic or "",
            "published_at": p.published_at.strftime("%m-%d") if p.published_at else "",
            "_date": p.published_at.date() if p.published_at else None,
            "cost_usd": round(sum(cost_by_post.get(p.id, {}).values()), 4),
            "cost_breakdown": {k: round(v, 4) for k, v in cost_by_post.get(p.id, {}).items()},
            "rewritten": content_runs.get(p.id, 0) > 1,
            "impressions": (m.impressions if m else 0) or 0,
            "clicks": (m.clicks if m else 0) or 0,
            "position": round(m.position, 1) if m and m.position else None,
            "sessions": (m.sessions if m else 0) or 0,
            "views": p.view_count or 0,
        })

    phase_totals: dict[str, float] = defaultdict(float)
    for per_post in cost_by_post.values():
        for k, v in per_post.items():
            phase_totals[k] += v

    by_agent: dict[str, dict] = defaultdict(lambda: {"posts": 0, "cost": 0.0, "impressions": 0, "clicks": 0, "sessions": 0})
    for r in rows:
        a = by_agent[r["agent_id"]]
        a["posts"] += 1
        a["cost"] += r["cost_usd"]
        a["impressions"] += r["impressions"]
        a["clicks"] += r["clicks"]
        a["sessions"] += r["sessions"]
    for a in by_agent.values():
        a["cost"] = round(a["cost"], 4)

    # 타깃 검색어 대조 — 리포트의 핵심. 노린 검색어가 실제 노출로 이어졌는지.
    keyworded = [r for r in rows if r["target_keyword"] and r["_date"] and r["_date"] >= KEYWORD_ERA_START]
    landed = [r for r in keyworded if r["impressions"] > 0]

    # 품질 점수는 사원상 로직(고정 앵커 대비 페어와이즈 판정)이 이미 계산한다 — 재구현하지 않고 재사용.
    quality_map: dict[str, float] = {}
    try:
        import quality as quality_mod
        for pid, q in quality_mod.load_quality(db, post_ids).items():
            if q.get("score") is not None:
                quality_map[pid] = q["score"]
    except Exception:
        log.warning("품질 점수 로드 실패 — 품질 없이 리포트 진행", exc_info=True)
    for r, p in zip(rows, posts):
        r["quality"] = quality_map.get(p.id)

    prev = _prev_period(period)
    prev_metrics = db.query(BlogPostMetrics).filter(BlogPostMetrics.period == prev).all()

    return {
        "period": period,
        "prev_period": prev,
        "posts": rows,
        "totals": {
            "posts": len(rows),
            "cost_usd": round(sum(r["cost_usd"] for r in rows), 4),
            "impressions": sum(r["impressions"] for r in rows),
            "clicks": sum(r["clicks"] for r in rows),
            "sessions": sum(r["sessions"] for r in rows),
            "rewritten": sum(1 for r in rows if r["rewritten"]),
        },
        "prev_totals": {
            "impressions": sum((m.impressions or 0) for m in prev_metrics),
            "clicks": sum((m.clicks or 0) for m in prev_metrics),
            "sessions": sum((m.sessions or 0) for m in prev_metrics),
            "posts": len(prev_metrics),
        },
        "phase_totals": {k: round(v, 4) for k, v in sorted(phase_totals.items(), key=lambda x: -x[1])},
        "by_agent": dict(by_agent),
        "quality_count": len(quality_map),
        "collab_count": sum(1 for r in rows if "+" in r["agent_id"]),
        "keyword_check": {
            "targeted": len(keyworded),
            "landed": len(landed),
            "landed_examples": [
                {"keyword": r["target_keyword"], "impressions": r["impressions"], "position": r["position"]}
                for r in sorted(landed, key=lambda x: -x["impressions"])[:5]
            ],
            "missed_examples": [r["target_keyword"] for r in keyworded if r["impressions"] == 0][:8],
        },
    }


def to_prompt_text(data: dict) -> str:
    """수집 결과를 LLM이 그대로 인용할 수 있는 텍스트로. 여기 없는 숫자는 쓰면 안 된다."""
    t, pt = data["totals"], data["prev_totals"]
    L = [f"【{data['period']} 운영 데이터】",
         f"- 발행 {t['posts']}편 / 총비용 ${t['cost_usd']:.2f} / 편당 평균 ${t['cost_usd']/max(t['posts'],1):.3f}",
         f"- 검색 노출 {t['impressions']}회 / 클릭 {t['clicks']}회 / 세션 {t['sessions']}",
         f"- 전월({data['prev_period']}) 대비: 노출 {pt['impressions']}→{t['impressions']}, 클릭 {pt['clicks']}→{t['clicks']}, 세션 {pt['sessions']}→{t['sessions']}",
         f"- 주제 중복으로 재작성된 글: {t['rewritten']}편"]

    total_cost = sum(data["phase_totals"].values()) or 1
    L.append("\n【비용 구성(단계별)】")
    for k, v in data["phase_totals"].items():
        L.append(f"- {k}: ${v:.3f} ({v/total_cost*100:.0f}%)")

    L.append("\n【에이전트별】")
    for aid, a in sorted(data["by_agent"].items(), key=lambda x: -x[1]["impressions"]):
        L.append(f"- {aid}: {a['posts']}편, 비용 ${a['cost']:.2f}, 노출 {a['impressions']}, 클릭 {a['clicks']}, 세션 {a['sessions']}")

    kc = data["keyword_check"]
    if kc["targeted"]:
        L.append(f"\n【타깃 검색어 검증】 노린 검색어 {kc['targeted']}개 중 실제 노출된 것 {kc['landed']}개")
        for e in kc["landed_examples"]:
            L.append(f"- 성공: \"{e['keyword']}\" 노출 {e['impressions']}회, 평균순위 {e['position']}")
        if kc["missed_examples"]:
            L.append(f"- 노출 0회: {', '.join(kc['missed_examples'])}")
    else:
        L.append("\n【타깃 검색어 검증】 이 기간에는 검색어 타기팅 이전 글만 있어 검증할 대상이 없음 "
                 "(2026-07-30부터 적용). 이 사실을 그대로 쓸 것 — 없는 성과를 지어내지 말 것.")

    L.append("\n【개별 글】 (품질=사원상 품질점수, 앵커 대비 승률 0~100)")
    for r in data["posts"]:
        flag = " [재작성]" if r["rewritten"] else ""
        q = f" 품질{r['quality']}" if r.get("quality") is not None else ""
        L.append(f"- {r['published_at']} {r['agent_id']}: \"{r['title']}\" / 타깃 \"{r['target_keyword']}\" "
                 f"/ ${r['cost_usd']:.3f} / 노출{r['impressions']} 클릭{r['clicks']} 조회{r['views']}{q}{flag}")
    return "\n".join(L)


def pick_question(data: dict, questions: list[str], index: int) -> str:
    """데이터가 답할 수 있는 질문만 후보로 두고 회차별로 돌린다.
    첫 회차(2026-08)에 '타깃 검색어가 노출로 이어졌나'를 물으면 검증 대상이 0개라
    답할 수 없는 질문으로 창간호가 나간다 — 그런 미스매치를 막는다."""
    ok = []
    for q in questions:
        if "타깃 검색어" in q and data["keyword_check"]["targeted"] < 3:
            continue
        if "품질 점수" in q and data.get("quality_count", 0) < 5:
            continue
        if "협업" in q and data.get("collab_count", 0) < 1:
            continue
        ok.append(q)
    return ok[index % len(ok)] if ok else questions[index % len(questions)]
