"""4A SEO 마커 파서 단위 테스트 — parse_seo_metadata / resolve_seo_fields / validate_content_type.
LLM·DB 호출 없음(순수 함수). conftest가 db.models를 mock하므로 CONTENT_TYPES만 실제 값으로 주입.
하단 4B-2 블록: generate_blog_post의 SEO 마커 통합 동작(LLM·트렌드·이미지·썸네일 전부 mock)."""
import sys
import os
import types
import asyncio
import inspect
from types import SimpleNamespace
from unittest.mock import patch

import blog_generator

# 실제 CONTENT_TYPES 주입 (conftest의 db.models mock에 부착)
_CT = ("MARKETING", "WIKI", "DATA", "DESIGN", "IDEA", "SCIENCE", "ESSAY", "DEBATE", "QUIZ", "INTRO")
sys.modules["db.models"].CONTENT_TYPES = _CT

SEO_BLOCK = (
    "{{SEO_TITLE}}\n먹태깡 마케팅이 바이럴된 진짜 이유\n{{/SEO_TITLE}}\n"
    "{{SUMMARY}}\n먹태깡 품귀는 FOMO와 체험 마케팅이 결합한 결과다. 이 글은 그 메커니즘을 사례로 푼다.\n{{/SUMMARY}}\n"
    "{{SEO_DESCRIPTION}}\n먹태깡 바이럴의 배경을 FOMO·체험·마이크로 인플루언서 관점에서 정리해 마케터가 응용할 포인트를 짚는다.\n{{/SEO_DESCRIPTION}}"
)
BODY = "# 먹태깡은 왜 품절일까\n\n본문 첫 문단입니다.\n\n두 번째 문단."


# 1. 세 마커 모두 정상
def test_all_three_markers():
    r = blog_generator.parse_seo_metadata(BODY + "\n\n" + SEO_BLOCK)
    assert r["seo_title"] == "먹태깡 마케팅이 바이럴된 진짜 이유"
    assert r["summary"].startswith("먹태깡 품귀는 FOMO")
    assert r["seo_description"].startswith("먹태깡 바이럴")
    assert "본문 첫 문단입니다." in r["clean_content"]
    assert "{{" not in r["clean_content"]


# 2. summary만 누락
def test_missing_summary():
    raw = BODY + "\n{{SEO_TITLE}}제목입니다 그리고 충분히 긴 제목 텍스트{{/SEO_TITLE}}" \
        "\n{{SEO_DESCRIPTION}}여든 자가 넘는 설명을 위해 충분히 길게 쓴 검색 설명 문장으로 채운 예시 데이터입니다 더 채움{{/SEO_DESCRIPTION}}"
    r = blog_generator.parse_seo_metadata(raw)
    assert r["seo_title"] is not None
    assert r["summary"] is None
    assert r["seo_description"] is not None


# 3. 모든 SEO 마커 누락
def test_no_markers():
    r = blog_generator.parse_seo_metadata(BODY)
    assert r["seo_title"] is None and r["summary"] is None and r["seo_description"] is None
    assert r["clean_content"] == BODY  # 본문 그대로


# 4. 빈 마커 → None
def test_empty_markers():
    raw = BODY + "\n{{SEO_TITLE}}   {{/SEO_TITLE}}\n{{SUMMARY}}\n\n{{/SUMMARY}}"
    r = blog_generator.parse_seo_metadata(raw)
    assert r["seo_title"] is None
    assert r["summary"] is None
    assert "{{" not in r["clean_content"]


# 5. 중복 마커 → 첫 값 사용
def test_duplicate_markers():
    raw = BODY + "\n{{SEO_TITLE}}첫 번째 제목 충분히 긴 텍스트입니다{{/SEO_TITLE}}" \
        "\n{{SEO_TITLE}}두 번째 제목 충분히 긴 텍스트입니다{{/SEO_TITLE}}"
    r = blog_generator.parse_seo_metadata(raw)
    assert r["seo_title"] == "첫 번째 제목 충분히 긴 텍스트입니다"
    assert "두 번째 제목" not in r["clean_content"]  # 중복 블록도 제거됨


# 6. 마커 앞뒤/내부 공백
def test_marker_whitespace():
    raw = BODY + "\n{{  SEO_TITLE  }}\n   공백 많은 제목 충분히 긴 텍스트   \n{{ / SEO_TITLE }}"
    r = blog_generator.parse_seo_metadata(raw)
    assert r["seo_title"] == "공백 많은 제목 충분히 긴 텍스트"


# 7. 한글·영문·이모지 혼합
def test_mixed_unicode_emoji():
    raw = BODY + "\n{{SUMMARY}}먹태깡 marketing 🔥 바이럴의 핵심을 한 문장으로 정리한 요약 텍스트입니다{{/SUMMARY}}"
    r = blog_generator.parse_seo_metadata(raw)
    assert "🔥" in r["summary"] and "marketing" in r["summary"]


# 8. 본문에 유사하지만 진짜 마커가 아닌 문자열
def test_lookalike_not_marker():
    raw = BODY + "\n여기서 SEO_TITLE 이라는 단어와 {SUMMARY} {{SUMMARYX}} 는 마커가 아니다."
    r = blog_generator.parse_seo_metadata(raw)
    assert r["seo_title"] is None and r["summary"] is None
    # 비마커 문자열은 본문에 그대로 보존
    assert "SEO_TITLE 이라는 단어" in r["clean_content"]
    assert "{SUMMARY}" in r["clean_content"]
    assert "{{SUMMARYX}}" in r["clean_content"]


# 9. 기존 thumbnail/tags 마커와 공존 — SEO 파서가 그것들을 건드리지 않음
def test_coexists_with_thumbnail_tags():
    raw = BODY + "\n{{SEO_TITLE}}공존 테스트용 충분히 긴 제목 텍스트{{/SEO_TITLE}}" \
        "\n{{TAGS: 마케팅, 바이럴}}\n{{THUMBNAIL: a hamster doing marketing}}"
    r = blog_generator.parse_seo_metadata(raw)
    assert r["seo_title"] == "공존 테스트용 충분히 긴 제목 텍스트"
    # thumbnail/tags 마커는 SEO 파서가 보존(각자 파서가 처리)
    assert "{{TAGS:" in r["clean_content"]
    assert "{{THUMBNAIL:" in r["clean_content"]


# 10. 파싱 후 본문에 SEO 마커 잔존 없음 (짝 안 맞는 태그 포함)
def test_no_seo_marker_residue():
    raw = BODY + "\n{{SEO_TITLE}}정상 제목 충분히 긴 텍스트입니다{{/SEO_TITLE}}" \
        "\n{{SUMMARY}}닫히지 않은 요약 마커"  # 닫는 태그 없음(orphan)
    r = blog_generator.parse_seo_metadata(raw)
    for tok in ("{{SEO_TITLE}}", "{{/SEO_TITLE}}", "{{SUMMARY}}", "{{/SUMMARY}}",
                "{{SEO_DESCRIPTION}}", "{{/SEO_DESCRIPTION}}"):
        assert tok not in r["clean_content"]


# 11. 허용되지 않은 content_type
def test_validate_content_type():
    assert blog_generator.validate_content_type("MARKETING") == "MARKETING"
    assert blog_generator.validate_content_type("marketing") == "MARKETING"  # 대소문자 정규화
    assert blog_generator.validate_content_type("UNKNOWN") is None
    assert blog_generator.validate_content_type(None) is None
    assert blog_generator.validate_content_type("  essay  ") == "ESSAY"


# 12. 기존 생성 결과와 호환 — 마커 없는 본문 + 폴백
def test_resolve_fallbacks():
    parsed = blog_generator.parse_seo_metadata(BODY)  # 전부 None
    fields = blog_generator.resolve_seo_fields(parsed, title="원래 사용자용 제목")
    assert fields["seo_title"] == "원래 사용자용 제목"   # seo_title → title 폴백
    assert fields["summary"] is None                    # summary → None
    assert fields["seo_description"] is None             # → summary(None) → None

    # seo_description은 summary로 폴백
    parsed2 = {"seo_title": None, "summary": "핵심 요약 문장입니다 충분히 긴 길이로 작성한 요약 데이터", "seo_description": None}
    f2 = blog_generator.resolve_seo_fields(parsed2, title="T")
    assert f2["seo_description"] == parsed2["summary"]


# 추가: 하드캡 초과 시 폴백
def test_hardcap_fallback():
    long_title = "가" * 100  # hard cap 70 초과
    parsed = {"seo_title": long_title, "summary": None, "seo_description": None}
    f = blog_generator.resolve_seo_fields(parsed, title="짧은 폴백 제목")
    assert f["seo_title"] == "짧은 폴백 제목"  # 어색한 컷 대신 title로 폴백


# ── 4B-1 보강 케이스 ──────────────────────────────────────────────────────────

# (A) 열기 마커만 있고 닫기 마커가 없는 경우
#  - 마커 문자열은 제거 / 이후 정상 본문은 보존 / 전체 본문을 SEO 값으로 삼지 않음
def test_open_marker_without_close():
    body_tail = "\n\n이것은 글의 정상적인 마지막 문단입니다. 본문으로 보존돼야 합니다."
    raw = "# 디스커버리 글\n\n물곰은 극한 환경에서 생존한다." + body_tail + "\n{{SUMMARY}}여기서부터 닫는 태그가 없다"
    r = blog_generator.parse_seo_metadata(raw)
    # 닫는 짝이 없으므로 값으로 캡처되지 않음(전체 본문을 SEO로 삼지 않음)
    assert r["summary"] is None
    # 열기 마커 문자열은 제거됨
    assert "{{SUMMARY}}" not in r["clean_content"]
    assert "{{" not in r["clean_content"]
    # 마커 뒤에 붙어있던 일반 텍스트와 정상 본문은 보존
    assert "물곰은 극한 환경에서 생존한다." in r["clean_content"]
    assert "정상적인 마지막 문단" in r["clean_content"]
    assert "여기서부터 닫는 태그가 없다" in r["clean_content"]


# (B) 본문/SEO 값에 마커와 유사한 일반 문자열이 있는 경우
#  - 정확한 블록 마커만 파싱 / 일반 문장은 보존
def test_lookalike_strings_with_real_block():
    raw = (
        "# 블랙홀 이야기\n\n"
        "본문에서 SEO_DESCRIPTION 이라는 용어를 단순 언급한다. {SEO_TITLE} 같은 단일 중괄호도 마커가 아니다.\n\n"
        "{{SEO_TITLE}}블랙홀의 사건의 지평선이란 무엇인가{{/SEO_TITLE}}"
    )
    r = blog_generator.parse_seo_metadata(raw)
    # 진짜 블록만 파싱
    assert r["seo_title"] == "블랙홀의 사건의 지평선이란 무엇인가"
    assert r["summary"] is None and r["seo_description"] is None
    # 유사 일반 문자열은 본문에 보존
    assert "SEO_DESCRIPTION 이라는 용어" in r["clean_content"]
    assert "{SEO_TITLE} 같은 단일 중괄호" in r["clean_content"]
    # 진짜 마커는 제거
    assert "{{SEO_TITLE}}" not in r["clean_content"]


# ── 4B-2 generate_blog_post 통합 (외부 호출 전부 mock) ─────────────────────────
# 실제 LLM/트렌드/이미지/썸네일 호출은 하지 않는다. _logged_create로 넘어가는
# system 프롬프트와, 조립된 반환 dict만 검증한다.

os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")  # 클라이언트 생성용(호출은 안 함)

_THUMB_URL = "http://thumb/test.png"


def _run_blog_post(agent_id: str, raw: str, seo_markers: bool):
    """generate_blog_post를 외부 호출 mock 상태로 실행. (data, captured_system_text) 반환."""
    captured = {}

    async def _fake_logged_create(client, sink, label, **kwargs):
        captured["system"] = kwargs["system"][0]["text"]
        return types.SimpleNamespace(content=[types.SimpleNamespace(type="text", text=raw)])

    async def _fake_fetch_trending(*a, **k):
        return ""

    async def _fake_thumbnail(*a, **k):
        return _THUMB_URL

    async def _fake_process_images(content, *a, **k):
        return content  # 인라인 이미지 처리 없이 본문 그대로

    with patch.object(blog_generator, "_logged_create", _fake_logged_create), \
         patch.object(blog_generator, "_fetch_trending", _fake_fetch_trending), \
         patch.object(blog_generator, "_generate_thumbnail", _fake_thumbnail), \
         patch.object(blog_generator, "_process_content_images", _fake_process_images):
        data = asyncio.run(
            blog_generator.generate_blog_post(agent_id=agent_id, theme="테스트 주제", seo_markers=seo_markers)
        )
    return data, captured.get("system", "")


_OMIT_DISCOVERY_PUBLISHED = object()


def _run_discovery_post(raw: str, seo_markers: bool, published=_OMIT_DISCOVERY_PUBLISHED):
    """generate_discovery_post를 외부 호출 mock 상태로 실행. sentinel이면 published 인자를 생략한다."""
    captured = {}

    async def _fake_logged_create(client, sink, label, **kwargs):
        captured["system"] = kwargs["system"][0]["text"]
        return types.SimpleNamespace(content=[types.SimpleNamespace(type="text", text=raw)])

    async def _fake_classify(*a, **k):
        return "science", "pocke"

    async def _fake_fetch_trending(*a, **k):
        return ""

    async def _fake_thumbnail(*a, **k):
        return _THUMB_URL

    kwargs = {"topic": "비 오는 날 흙냄새가 나는 이유", "seo_markers": seo_markers}
    if published is not _OMIT_DISCOVERY_PUBLISHED:
        kwargs["published"] = published

    with patch.object(blog_generator, "_logged_create", _fake_logged_create), \
         patch.object(blog_generator, "_classify_discovery_topic", _fake_classify), \
         patch.object(blog_generator, "_fetch_trending", _fake_fetch_trending), \
         patch.object(blog_generator, "_generate_thumbnail", _fake_thumbnail):
        data = asyncio.run(blog_generator.generate_discovery_post(**kwargs))
    return data, captured.get("system", "")


_SEO_TAIL = (
    "\n\n---\n**📎 참고한 자료**\n- 뉴스 제목 1\n\n"
    "{{THUMBNAIL: a hamster doing marketing in a tv studio, excited}}\n"
    "{{TAGS: 마케팅, 바이럴, 먹태깡}}\n" + SEO_BLOCK
)
_BODY_FULL = "# 먹태깡은 왜 품절일까\n\n본문 첫 문단입니다.\n\n## 섹션\n\n두 번째 문단."


# A. SEO OFF — 기존 동작 유지, SEO 키·규칙 없음
def test_blog_post_seo_off():
    raw = _BODY_FULL + "\n\n{{THUMBNAIL: a hamster}}\n{{TAGS: 마케팅, 바이럴}}"
    data, system = _run_blog_post("buzz", raw, seo_markers=False)
    # 반환 dict에 SEO 4키 없음
    for k in ("seo_title", "summary", "seo_description", "content_type"):
        assert k not in data
    # system 프롬프트에 일반 SEO 규칙/마커 없음
    assert "{{SEO_TITLE}}" not in system
    assert "SEO 메타" not in system
    # 기존 파싱 정상
    assert data["title"] == "먹태깡은 왜 품절일까"
    assert "마케팅" in data["tags"] and "바이럴" in data["tags"]
    assert data["thumbnail_url"] == _THUMB_URL
    assert "{{" not in data["content"]
    assert "본문 첫 문단입니다." in data["content"]
    # 변경 전과 동일한 키 집합
    assert set(data.keys()) == {
        "id", "agent_id", "title", "slug", "content", "thumbnail_url",
        "tags", "published", "trending_topic", "published_at", "costs",
    }


# B. SEO ON 정상 — 마커 파싱 + 본문 잔존 없음 + 4키 존재
def test_blog_post_seo_on():
    data, system = _run_blog_post("buzz", _BODY_FULL + _SEO_TAIL, seo_markers=True)
    assert "{{SEO_TITLE}}" in system  # 규칙 주입됨
    assert data["seo_title"] == "먹태깡 마케팅이 바이럴된 진짜 이유"
    assert data["summary"].startswith("먹태깡 품귀는 FOMO")
    assert data["seo_description"].startswith("먹태깡 바이럴")
    assert data["content_type"] == "MARKETING"
    assert data["title"] == "먹태깡은 왜 품절일까"
    assert "마케팅" in data["tags"] and "먹태깡" in data["tags"]
    assert data["thumbnail_url"] == _THUMB_URL
    assert "{{" not in data["content"]              # SEO/THUMBNAIL/TAGS 마커 모두 제거
    assert "본문 첫 문단입니다." in data["content"]


# C. content_type 매핑 6종 (LLM 반복 없이 mock으로)
import pytest


@pytest.mark.parametrize("agent_id,expected", [
    ("buzz", "MARKETING"),
    ("over", "ESSAY"),
    ("ka", "DATA"),
    ("pixel", "DESIGN"),
    ("ping", "IDEA"),
    ("wiki", "WIKI"),
])
def test_blog_post_content_type_mapping(agent_id, expected):
    data, _ = _run_blog_post(agent_id, _BODY_FULL + _SEO_TAIL, seo_markers=True)
    assert data["content_type"] == expected


# D. fallback — SEO_TITLE 누락 / SUMMARY 존재 / SEO_DESCRIPTION 누락
def test_blog_post_seo_fallback():
    tail = (
        "\n\n{{THUMBNAIL: x}}\n{{TAGS: a, b}}\n"
        "{{SUMMARY}}\n핵심 요약 문장입니다 충분히 긴 길이로 작성한 요약 데이터입니다\n{{/SUMMARY}}"
    )
    data, _ = _run_blog_post("wiki", _BODY_FULL + tail, seo_markers=True)
    assert data["seo_title"] == "먹태깡은 왜 품절일까"        # seo_title → title 폴백
    assert data["summary"].startswith("핵심 요약 문장입니다")
    assert data["seo_description"] == data["summary"]        # seo_description → summary 폴백


# E. 불완전 마커 — SUMMARY 닫기 누락. 전체 본문을 summary로 삼지 않고, 글 생성도 안 깨짐
def test_blog_post_incomplete_marker():
    tail = "\n\n{{THUMBNAIL: x}}\n{{TAGS: a, b}}\n{{SUMMARY}}닫는 태그가 없는 요약"
    data, _ = _run_blog_post("ka", _BODY_FULL + tail, seo_markers=True)
    assert data["summary"] is None                          # 짝 없는 마커는 값으로 캡처 안 함
    assert data["seo_title"] == "먹태깡은 왜 품절일까"        # title 폴백
    assert "{{" not in data["content"]                       # 마커 잔존 없음
    assert "본문 첫 문단입니다." in data["content"]            # 본문 보존


# F. over 보충 지시 — ON일 때만 에세이 전용 SEO 보충 지시가 system에 들어감
def test_blog_post_over_guidance():
    _, system_on = _run_blog_post("over", _BODY_FULL + _SEO_TAIL, seo_markers=True)
    assert "summary는 감정적인 한 문장만" in system_on
    _, system_off = _run_blog_post("over", _BODY_FULL, seo_markers=False)
    assert "summary는 감정적인 한 문장만" not in system_off
    assert "{{SEO_TITLE}}" not in system_off


# G. 시그니처/배선 — generate_blog_post·수동 API의 기본값이 False인지 (라우터 앱 없이 inspect)
def test_seo_wiring_defaults():
    sig = inspect.signature(blog_generator.generate_blog_post)
    assert sig.parameters["seo_markers"].default is False
    # 수동 API 라우터의 seo 쿼리 기본값 False
    from routers import blog as blog_router
    rsig = inspect.signature(blog_router.trigger_generate)
    assert rsig.parameters["seo"].default is False


# ── 5D-1 discovery 비공개 생성 옵션 (외부 호출 전부 mock) ──────────────────────
_DISCOVERY_BODY = (
    "# 페트리코르의 과학\n\n"
    "비가 내릴 때 흙과 식물 주변에서 나는 냄새는 페트리코르라고 부른다.\n\n"
    "{{THUMBNAIL: rain drops on warm soil}}\n"
    "{{TAGS: discovery, 페트리코르, 비냄새, 과학}}\n"
)


def test_discovery_signature_defaults():
    sig = inspect.signature(blog_generator.generate_discovery_post)
    assert sig.parameters["seo_markers"].default is False
    assert sig.parameters["published"].default is True

    from routers import blog as blog_router
    rsig = inspect.signature(blog_router.trigger_generate_discovery)
    assert rsig.parameters["seo"].default is False
    assert rsig.parameters["published"].default is True


def test_discovery_published_default_true():
    data, system = _run_discovery_post(_DISCOVERY_BODY, seo_markers=False)
    assert data["published"] is True
    assert "{{SEO_TITLE}}" not in system
    for k in ("seo_title", "summary", "seo_description", "content_type"):
        assert k not in data


def test_discovery_published_false_seo_off():
    data, _ = _run_discovery_post(_DISCOVERY_BODY, seo_markers=False, published=False)
    assert data["published"] is False


def test_discovery_seo_on_published_false():
    data, system = _run_discovery_post(_DISCOVERY_BODY + SEO_BLOCK, seo_markers=True, published=False)
    assert data["published"] is False
    assert "{{SEO_TITLE}}" in system
    assert data["seo_title"] == "먹태깡 마케팅이 바이럴된 진짜 이유"
    assert data["summary"].startswith("먹태깡 품귀는 FOMO")
    assert data["seo_description"].startswith("먹태깡 바이럴")
    assert data["content_type"] == "SCIENCE"


def test_manual_generate_published_default_unchanged():
    from routers import blog as blog_router
    rsig = inspect.signature(blog_router.trigger_generate)
    assert rsig.parameters["published"].default is True


# ── 5D-2 discovery 라우터 언팩 회귀 (외부 호출 전부 mock) ─────────────────────

class _FakeQuery:
    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return None


class _FakeDB:
    def __init__(self):
        self.added = []
        self.flushed = False
        self.committed = False
        self.refreshed = None

    def query(self, *args, **kwargs):
        return _FakeQuery()

    def add(self, obj):
        self.added.append(obj)

    def flush(self):
        self.flushed = True

    def commit(self):
        self.committed = True

    def refresh(self, obj):
        self.refreshed = obj


class _FakeBlogPost:
    slug = "slug-column"

    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)


def _route_discovery_data(published: bool):
    return {
        "id": "route-test-id",
        "agent_id": "pocke",
        "title": "페트리코르의 과학",
        "slug": "route-test-discovery",
        "content": "비 오는 날 흙냄새가 나는 이유를 설명한 본문입니다.",
        "thumbnail_url": _THUMB_URL,
        "tags": "[]",
        "published": published,
        "trending_topic": "비 오는 날 흙냄새가 나는 이유",
        "published_at": "2026-06-30T00:00:00",
        "seo_title": "페트리코르의 과학",
        "summary": "비 냄새의 핵심 원리를 짧게 요약합니다.",
        "seo_description": "비 오는 날 흙냄새가 나는 이유와 페트리코르의 과학을 설명합니다.",
        "content_type": "SCIENCE",
        "costs": [],
    }


def _run_discovery_route(topic="비 오는 날 흙냄새가 나는 이유", seo=True, published=False):
    from routers import blog as blog_router

    captured = {}

    async def _fake_generate_discovery_post(topic_arg, **kwargs):
        captured["topic"] = topic_arg
        captured.update(kwargs)
        return _route_discovery_data(published=kwargs["published"])

    async def _fake_generate_comments(*args, **kwargs):
        captured["comments_args"] = args
        return []

    fake_db = _FakeDB()
    with patch.object(blog_router, "_recent_post_context", return_value=(
        ["recent title"],
        ["frequent-tag"],
        [{"title": "recent post"}],
        ["agent-tag"],
    )), patch.object(blog_router, "generate_discovery_post", _fake_generate_discovery_post), \
         patch.object(blog_router, "attach_embedding", lambda data: data), \
         patch.object(blog_router, "BlogPost", _FakeBlogPost), \
         patch.object(blog_router, "record_post_costs", lambda *args, **kwargs: None), \
         patch.object(blog_router, "generate_comments", _fake_generate_comments):
        result = asyncio.run(
            blog_router.trigger_generate_discovery(
                request=SimpleNamespace(),
                topic=topic,
                seo=seo,
                published=published,
                db=fake_db,
                _=None,
            )
        )

    return result, captured, fake_db


def test_discovery_route_unpacks_four_recent_context_values_and_forwards_flags():
    result, captured, fake_db = _run_discovery_route(seo=True, published=False)

    assert captured["topic"] == "비 오는 날 흙냄새가 나는 이유"
    assert captured["recent_titles"] == ["recent title"]
    assert captured["seo_markers"] is True
    assert captured["published"] is False
    assert result["post_id"] == "route-test-id"
    assert result["slug"] == "route-test-discovery"
    assert fake_db.flushed is True
    assert fake_db.committed is True


def test_discovery_route_defaults_forwarded_to_generator():
    _, captured, _ = _run_discovery_route(topic=None, seo=False, published=True)

    assert captured["topic"] is None
    assert captured["recent_titles"] == ["recent title"]
    assert captured["seo_markers"] is False
    assert captured["published"] is True


def test_recent_post_context_call_sites_match_four_value_contract():
    from routers import blog as blog_router

    source = inspect.getsource(blog_router)
    assert "recent_titles, frequent_tags, recent_posts, agent_recent_tags = _recent_post_context" in source
    assert "recent_titles, _, _, _ = _recent_post_context" in source
    assert "recent_titles, _, _ = _recent_post_context" not in source


# ── 4B-2D grounding 최소 보완 (system 프롬프트 조립만 검사, 외부 호출 없음) ─────────
# 공통 grounding 규칙 핵심 문구(전체 문자열이 아니라 의미 식별용 키 문구)
_GROUNDING_KEYS = [
    "사실·출처 제한",                  # 헤더(본문·SEO 모두 적용 명시)
    "인명·연도·기관",                  # 구체적 고유명사·수치 생성 금지
    "존재하지 않는 기사·논문",          # 가짜 참고자료 생성 금지
    "추론·가능성·예시",                # 추론은 추론으로 표현
]
_WIKI_GROUNDING_KEY = "명명자·최초 사용 연도"
_BUZZ_GROUNDING_KEY = "효과 배수·전환율·매출 수치"


# A. 공통 grounding 규칙 ON — 임의 일반 에이전트에서 핵심 문구 주입 확인
def test_grounding_rules_on():
    _, system = _run_blog_post("ka", _BODY_FULL + _SEO_TAIL, seo_markers=True)
    for key in _GROUNDING_KEYS:
        assert key in system


# B. 공통 grounding 규칙 OFF — SEO OFF면 grounding 문구 없음
def test_grounding_rules_off():
    _, system = _run_blog_post("ka", _BODY_FULL, seo_markers=False)
    for key in _GROUNDING_KEYS:
        assert key not in system


# C. wiki ON — 공통 grounding + wiki 전용 문구 + 기존 WIKI SEO 지시 모두 존재
def test_wiki_grounding_on():
    _, system = _run_blog_post("wiki", _BODY_FULL + _SEO_TAIL, seo_markers=True)
    for key in _GROUNDING_KEYS:
        assert key in system
    assert _WIKI_GROUNDING_KEY in system
    assert "'이것의 모든 것'" in system  # 기존 WIKI 지시 유지


# D. wiki OFF — wiki 강화 문구 없음
def test_wiki_grounding_off():
    _, system = _run_blog_post("wiki", _BODY_FULL, seo_markers=False)
    assert _WIKI_GROUNDING_KEY not in system
    assert "'이것의 모든 것'" not in system


# E. buzz ON — 수치 grounding 문구 + 기존 MARKETING 지시 유지
def test_buzz_grounding_on():
    _, system = _run_blog_post("buzz", _BODY_FULL + _SEO_TAIL, seo_markers=True)
    assert _BUZZ_GROUNDING_KEY in system
    assert "마케팅 현상·전략·사례" in system  # 기존 MARKETING 지시 유지


# F. 다른 4종 회귀 — 기존 보충 지시 불변 + 타 에이전트 전용 문구 미혼입
@pytest.mark.parametrize("agent_id,existing_phrase", [
    ("over",  "summary는 감정적인 한 문장만"),
    ("ka",    "기준 시점이 불명확한 수치를"),
    ("pixel", "감성 표현만으로 제목과 설명을 구성하지"),
    ("ping",  "아이디어·가정·제안이라는 성격을"),
])
def test_other_agents_guidance_unchanged(agent_id, existing_phrase):
    _, system = _run_blog_post(agent_id, _BODY_FULL + _SEO_TAIL, seo_markers=True)
    assert existing_phrase in system            # 기존 유형별 지시 그대로
    assert _WIKI_GROUNDING_KEY not in system    # wiki 전용 문구 미혼입
    assert _BUZZ_GROUNDING_KEY not in system    # buzz 전용 문구 미혼입
