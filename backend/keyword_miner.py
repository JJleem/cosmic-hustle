"""검색 수요 기반 주제 선정 — Google 자동완성으로 '실제로 사람들이 치는 말'을 수집한다.

배경(2026-07-29): 3개월간 74편을 발행했으나 GSC에 잡힌 고유 검색어가 3개, 총 클릭 2회였다.
노출된 글의 평균 순위는 5.6위 — 색인·순위는 정상인데 아무도 검색하지 않는 말에서 상위에
있었다는 뜻이다. 원인은 주제를 서브테마 풀(개발자 취향)에서 뽑고 검색 수요를 한 번도
보지 않은 것. 이 모듈이 그 계층을 대체한다.

자동완성에 노출된다 = 구글이 실제 검색 트래픽을 확인한 질의라는 뜻이라, 무료 API가 없는
검색량 대신 '수요 존재'의 프록시로 쓴다. 절대 수치는 알 수 없으므로 순위 매김은 롱테일
선호 휴리스틱으로 처리한다.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re

import httpx

log = logging.getLogger(__name__)

_SUGGEST_URL = "https://suggestqueries.google.com/complete/search"

# 시드 하나를 넓히는 접미사. 질문·비교형(롱테일·저경쟁)을 노리는 조합 + 자모로 알파벳 스윕 효과.
_MODIFIERS = ["", " 왜", " 어떻게", " 차이", " 이유", " 방법", " 뜻", " ㅅ", " ㅈ", " ㅎ"]

# 네비게이셔널·비정보성 질의 — 글로 만들 수 없거나 만들어도 클릭이 안 되는 것들
_NAVIGATIONAL = (
    "사이트", "홈페이지", "로그인", "다운로드", "설치", "무료보기", "다시보기", "토렌트",
    "짤", "사진", "이미지", "노래방", "가사", "뜻밖", "채용", "주가", "부동산", "복권",
    "쿠팡", "네이버", "유튜브", "인스타", "디시", "나무위키",
)

# YMYL 회피 — 의료·법률·금융의 진단/처방/투자 조언 영역. 신생 도메인이 이길 수 없고 심사에도 불리.
_YMYL = (
    "증상", "진단", "치료", "처방", "약", "병원", "정신과", "수술", "부작용", "복용",
    "암", "질환", "후유증", "투자", "수익률", "종목", "코인", "대출", "보험금", "소송",
)

# 기존 시스템과 동일한 절대 금지 주제
_BANNED = (
    "정치", "선거", "정당", "대통령", "국회", "페미", "젠더", "남녀", "한남", "김치녀",
    "종교", "교회", "이단", "혐오", "일베", "성범죄",
)

# 의도별 가중치. 비교형("A B 차이")이 최우선 — 실제 수요가 있으면서 사전·백과가 답을 못 주는
# 유일한 구간이라 신생 도메인이 뚫을 수 있다. 반대로 "뜻/의미"는 수요는 크지만 나무위키·사전이
# 독식해 순위를 못 잡으므로 감점한다.
# 패턴에 부정 전방탐색을 쓰는 이유: '차이나'(중국)가 '차이'로, '왜곡'이 '왜'로 잡히면
# 무관한 질의가 최상위로 올라온다. 실제로 'sol 차이나 소비 트렌드 etf'가 1위를 먹었다.
_INTENT_WEIGHTS = (
    ((r"차이(?!나)", r"\bvs\b", "비교"), 0.7),
    ((r"왜(?![가-힣])", "이유", "원인", "원리", "어떻게"), 0.5),
    (("기준", "종류", "방법", "순서", "예시"), 0.3),
    ((r"뜻(?![가-힣])", "의미", "영어로"), -0.2),
)


async def fetch_suggestions(client: httpx.AsyncClient, query: str) -> list[str]:
    """자동완성 1건 조회. 실패는 빈 목록 — 수집은 부분 실패해도 계속 간다."""
    try:
        resp = await client.get(
            _SUGGEST_URL,
            params={"client": "firefox", "hl": "ko", "gl": "kr", "q": query},
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=10,
        )
        resp.raise_for_status()
        return [s for s in json.loads(resp.text)[1] if isinstance(s, str)]
    except Exception:
        return []


async def expand_seeds(seeds: list[str], per_seed_delay: float = 0.2) -> list[str]:
    """시드마다 접미사를 붙여 자동완성을 훑고 고유 질의를 모은다."""
    found: dict[str, None] = {}
    async with httpx.AsyncClient(follow_redirects=True) as client:
        for seed in seeds:
            tasks = [fetch_suggestions(client, f"{seed}{m}") for m in _MODIFIERS]
            for group in await asyncio.gather(*tasks):
                for q in group:
                    found.setdefault(q.strip(), None)
            if per_seed_delay:
                await asyncio.sleep(per_seed_delay)
    return list(found)


def _covered(query: str, covered_terms: list[str]) -> bool:
    """이미 다룬 주제인지 — 질의의 핵심 어절이 과거 제목·태그에 이미 있으면 제외."""
    words = [w for w in re.split(r"\s+", query) if len(w) >= 2]
    if not words:
        return False
    joined = " ".join(covered_terms)
    hits = sum(1 for w in words if w in joined)
    return hits >= max(2, len(words) - 1)


def score_query(query: str) -> float:
    """롱테일·비교형 우선 점수. 높을수록 신생 블로그가 노려볼 만하다."""
    n = len(query.split())
    score = {1: 0.2, 2: 0.7, 3: 1.0, 4: 0.95, 5: 0.7}.get(n, 0.3)
    for patterns, weight in _INTENT_WEIGHTS:
        if any(re.search(p, query) for p in patterns):
            score += weight
            break
    return score


def _on_topic(query: str, seeds: list[str]) -> bool:
    """시드에서 표류한 질의 제외. 자동완성은 'f1 번아웃 뜻', '이유빈 폰트'처럼
    시드 문자열만 스친 무관한 질의를 자주 물어온다."""
    if not seeds:
        return True
    tokens = {t for s in seeds for t in s.split() if len(t) >= 2}
    return any(t in query for t in tokens) if tokens else True


def filter_candidates(
    queries: list[str],
    covered_terms: list[str] | None = None,
    limit: int = 25,
    seeds: list[str] | None = None,
) -> list[str]:
    """금지·YMYL·네비게이셔널·표류·기존중복을 걷어내고 점수 상위만 남긴다."""
    covered_terms = covered_terms or []
    out: list[tuple[float, str]] = []
    for q in queries:
        if len(q) < 4 or len(q) > 40:
            continue
        if any(b in q for b in _BANNED) or any(y in q for y in _YMYL):
            continue
        if any(nav in q for nav in _NAVIGATIONAL):
            continue
        if not _on_topic(q, seeds or []):
            continue
        if _covered(q, covered_terms):
            continue
        out.append((score_query(q), q))
    # 동점이면 더 구체적인(긴) 질의를 우선 — 좁을수록 뚫린다
    out.sort(key=lambda x: (-x[0], -len(x[1])))
    return [q for _, q in out[:limit]]


async def mine(seeds: list[str], covered_terms: list[str] | None = None, limit: int = 25) -> list[str]:
    """시드 → 자동완성 확장 → 필터. 실패하면 빈 목록(호출자가 기존 동작으로 폴백)."""
    try:
        raw = await expand_seeds(seeds)
    except Exception:
        log.warning("자동완성 수집 실패 — 키워드 없이 진행", exc_info=True)
        return []
    picked = filter_candidates(raw, covered_terms, limit, seeds=seeds)
    log.info("키워드 마이닝: 시드 %d개 → 수집 %d → 후보 %d", len(seeds), len(raw), len(picked))
    return picked
