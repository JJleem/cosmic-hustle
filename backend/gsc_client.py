"""Google Search Console API 클라이언트 — 검색어/노출/CTR 수집용.

용도는 단 하나: "노출은 되는데 클릭이 안 되는 검색어" = 기존 글 제목 보강 대상 찾기.
주제 선택(다음에 뭘 쓸까)에는 쓰지 않는다 — 그건 외부 트렌드 신호의 몫이고,
GSC로 주제를 고르면 이미 쓴 주제로만 회귀하는 오버피팅이 생긴다.

자격증명은 blog_generator._load_indexing_credentials 패턴을 그대로 따름:
GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON 우선, 없으면 GA4_SERVICE_ACCOUNT_JSON 재사용.
어느 쪽이든 해당 서비스 계정이 GSC 사이트 소유자로 등록돼 있어야 함.
사전작업: Google Cloud에서 "Search Console API" 활성화 필요 (Indexing API와 별개).
"""
import os
import json
import logging
from urllib.parse import quote

import httpx

logger = logging.getLogger(__name__)

_SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"]


def _site_url() -> str:
    """GSC 속성 URL. URL-prefix는 끝에 / 필요, 도메인 속성은 sc-domain: 접두사."""
    return os.environ.get("GSC_SITE_URL", "https://cosmic-hustle.ai.kr/")


def _load_credentials():
    """webmasters.readonly 스코프 서비스 계정 자격증명 로드. 미설정 시 None."""
    sa_json = os.environ.get("GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON") or os.environ.get("GA4_SERVICE_ACCOUNT_JSON")
    if not sa_json:
        return None
    from google.oauth2.service_account import Credentials
    if sa_json.strip().startswith("{"):
        info = json.loads(sa_json)
    else:
        with open(sa_json) as f:
            info = json.load(f)
    return Credentials.from_service_account_info(info, scopes=_SCOPES)


def fetch_query_page_rows(start: str, end: str, row_limit: int = 200) -> list[dict]:
    """검색어×페이지 단위 성과 행 반환. 자격증명 미설정/에러는 호출부에서 처리.

    각 행: {"query", "page", "clicks", "impressions", "ctr", "position"}.
    트래픽이 적으면 빈 리스트가 정상.
    """
    creds = _load_credentials()
    if creds is None:
        raise RuntimeError("GSC 서비스 계정 자격증명 미설정")

    from google.auth.transport.requests import Request
    creds.refresh(Request())

    site = quote(_site_url(), safe="")
    url = f"https://searchconsole.googleapis.com/webmasters/v3/sites/{site}/searchAnalytics/query"
    body = {
        "startDate": start,
        "endDate": end,
        "dimensions": ["query", "page"],
        "rowLimit": row_limit,
        "type": "web",
    }
    with httpx.Client(timeout=15.0) as client:
        resp = client.post(url, headers={"Authorization": f"Bearer {creds.token}"}, json=body)
    resp.raise_for_status()
    rows = resp.json().get("rows", [])

    out = []
    for row in rows:
        keys = row.get("keys", [])
        if len(keys) < 2:
            continue
        out.append({
            "query": keys[0],
            "page": keys[1],
            "clicks": int(row.get("clicks", 0)),
            "impressions": int(row.get("impressions", 0)),
            "ctr": float(row.get("ctr", 0.0)),
            "position": round(float(row.get("position", 0.0)), 1),
        })
    return out


def select_title_fix_candidates(
    rows: list[dict],
    min_impressions: int = 5,
    max_ctr: float = 0.03,
    max_position: float = 30.0,
    limit: int = 8,
) -> list[dict]:
    """제목 보강 후보 선별: 노출 충분 + CTR 낮음 + 순위가 너무 깊지 않음.

    순위가 50위처럼 깊으면 CTR이 낮은 게 제목 탓이 아니라 그냥 안 보여서이므로 제외.
    노출 내림차순으로 정렬해 '고칠 가치가 큰' 글부터 반환.
    """
    candidates = [
        row for row in rows
        if row["impressions"] >= min_impressions
        and row["ctr"] <= max_ctr
        and 0 < row["position"] <= max_position
    ]
    candidates.sort(key=lambda r: r["impressions"], reverse=True)
    return candidates[:limit]


def top_queries(rows: list[dict], limit: int = 8) -> list[dict]:
    """검색어 단위 노출 합산 상위 — '지금 우리가 뭘로 발견되는가' 맥락용."""
    agg: dict[str, dict] = {}
    for row in rows:
        item = agg.setdefault(row["query"], {"query": row["query"], "clicks": 0, "impressions": 0})
        item["clicks"] += row["clicks"]
        item["impressions"] += row["impressions"]
    merged = list(agg.values())
    for item in merged:
        item["ctr"] = round(item["clicks"] / item["impressions"], 4) if item["impressions"] else 0.0
    merged.sort(key=lambda r: r["impressions"], reverse=True)
    return merged[:limit]
