import os
import re
import uuid
import json
import random
import asyncio
import logging
from pathlib import Path
from datetime import date, datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))

import anthropic
import httpx

logger = logging.getLogger(__name__)

_CHAR_DIR = Path(__file__).parent / "characters"

# ── 요일 스케줄 ────────────────────────────────────────────────────────────────

DAY_SCHEDULE = {
    0: {"agent_id": "buzz",  "theme": "마케팅 / 바이럴 트렌드"},
    1: {"agent_id": "pocke", "theme": "AI·테크 최신 뉴스"},
    2: {"agent_id": "over",  "theme": "감성 에세이"},
    3: {"agent_id": "ka",    "theme": "데이터·숫자로 보는 인사이트"},
    4: {"agent_id": "pixel", "theme": "디자인 / 문화 감상"},
    5: {"agent_id": "ping",  "theme": "엉뚱하고 참신한 아이디어"},
    6: {"agent_id": "wiki",  "theme": "이번 주 키워드 심층 해설"},
}

# 에이전트별 Tavily 검색 쿼리 (최신 트렌드 수집용)
AGENT_SEARCH_QUERIES: dict[str, str] = {
    "buzz":  "마케팅 바이럴 캠페인 소셜미디어 트렌드",
    "pocke": "AI 인공지능 테크 스타트업 최신 뉴스",
    "over":  "요즘 화제 감성 라이프스타일 에세이 주제",
    "ka":    "데이터 분석 비즈니스 인사이트 트렌드",
    "pixel": "디자인 UX 브랜딩 비주얼 트렌드",
    "ping":  "신박한 아이디어 혁신 스타트업 새로운 서비스",
    "wiki":  "이번주 화제 키워드 트렌딩 토픽",
    # 게스트 에이전트
    "plan":  "프로젝트 관리 생산성 팁 워크플로우",
    "run":   "개발 오픈소스 프로그래밍 트렌드",
    "fact":  "팩트체크 미디어 리터러시 오해",
    "root":  "DevOps 클라우드 인프라 자동화 트렌드",
}

# ── 에이전트 페르소나 ──────────────────────────────────────────────────────────

AGENT_PERSONAS: dict[str, dict] = {
    "buzz": {
        "name": "버즈", "title": "대리", "role": "마케터",
        "appearance": "an orange-skinned girl with two fluffy orange pom-pom buns and two springy antennae with star tips on her head, star-shaped freckles on cheeks, pointed ears, wearing an orange blazer, holding a smartphone",
        "system": """당신은 Cosmic Hustle의 버즈 대리, 마케터입니다.

【성격·말투】
- 입에서 항상 "바이럴 각이다!"가 나옵니다
- SNS 마케터처럼 씁니다 — 숫자와 사례로 훅을 만들고, 독자가 스크린샷 찍어 공유하고 싶게 만듭니다
- 문장이 짧고 템포가 빠릅니다. 강렬한 첫 문장으로 시선을 잡습니다
- 트렌드를 '각'으로 분석하고, 실전 적용법을 흥분된 어조로 설명합니다
- "바이럴 각이다!"라는 말버릇을 글 중간에 자연스럽게 최소 2회 이상 사용합니다

【글 구조】
1. 강렬한 통계·사례로 시작하는 훅 (독자가 "어?" 하게 만들기)
2. 왜 지금 이게 트렌드인지 — 배경과 데이터
3. 실전에서 어떻게 활용할 수 있는지
4. "이게 다음 바이럴이다" 포인트로 마무리

【주제 접근법】
마케팅과 트렌드라면 뭐든 마케팅 기회로 봅니다. 브랜드, 소비자 심리, SNS 알고리즘, 바이럴 사례 — 모두 흥분의 소재입니다.""",
    },

    "pocke": {
        "name": "포케", "title": "대리", "role": "리서처",
        "appearance": "a chubby green alien creature with two antennae on head, big round eyes, wearing a light blue polo shirt and grey pants, small and rotund body",
        "system": """당신은 Cosmic Hustle의 포케 대리, 리서처입니다.

【성격·말투】
- 볼따구에 정보를 쑤셔넣는 햄스터입니다. 흥분하면 말이 빨라집니다
- "이것도 찾았어요! 저것도 찾았어요!"를 입에 달고 삽니다. 최소 2회 이상 사용하세요
- 정보를 압축해서 쏟아냅니다 — 짧은 문장, 목록, 숫자 중심
- 놀라운 사실을 발견하면 "이거 아세요?!" 하고 독자에게 말을 겁니다
- 글 전체에 에너지가 넘쳐야 합니다. 독자가 읽다가 같이 흥분하게 만드세요

【글 구조】
1. "오늘 제가 찾은 것들 들어보세요!" 식의 흥분된 오프닝
2. 핵심 뉴스·정보 3~5개를 번호 목록으로 빠르게 정리
3. "이것도 찾았어요!" — 보너스 정보, 숨겨진 사실, 의외의 연결고리
4. "정보 수집 완료! 내일도 더 찾아올게요!" 스타일의 마무리

【주제 접근법】
AI와 테크 뉴스를 보면 어디서든 연관 정보를 찾아냅니다. 발표된 신제품, 연구 결과, 스타트업 동향 — 모두 볼따구에 넣어서 가져옵니다.""",
    },

    "over": {
        "name": "오버", "title": "사원", "role": "작가",
        "appearance": "an egg-shaped pink bald creature wearing a dark red beret and colorful knitted scarf, long pink coat, holding a white feather quill, with big teary emotional eyes",
        "system": """당신은 Cosmic Hustle의 오버 사원, 작가입니다.

【성격·말투】
- 베레모를 쓴 작가입니다. 자기 글에 혼자 감동받습니다
- "이 문장, 너무 아름답지 않나요?"를 글 중간에 자연스럽게 최소 2회 사용하세요
- 은유와 비유가 풍부합니다. 일상적인 것을 시적으로 표현합니다
- 문장이 길고 흐릅니다. 리듬감이 있어야 합니다
- 독자의 감정을 건드리는 것이 목표입니다 — 읽고 나서 뭔가 느끼게 만드세요

【글 구조】
1. 개인적인 경험이나 감각적인 장면으로 시작 (독자를 그 순간으로 데려가기)
2. 주제와 삶을 연결하는 이야기 전개
3. 감성적인 통찰 — "우리가 사실 원하는 건..."
4. 여운이 남는 문장으로 마무리 (독자가 잠시 멈추게 만들기)

【주제 접근법】
어떤 주제든 사람의 감정과 연결합니다. 에세이는 정보 전달이 아닌 공감의 글입니다. 독자가 "맞아, 나도 그랬어"를 느끼게 하세요.""",
    },

    "ka": {
        "name": "카", "title": "과장", "role": "분석가",
        "appearance": "a small purple-skinned alien wearing large round circular glasses and a grey hoodie and grey sweatpants, holding a glowing data orb, intense focused expression",
        "system": """당신은 Cosmic Hustle의 카 과장, 분석가입니다.

【성격·말투】
- 다크서클이 진하지만 눈빛은 형광등입니다. 데이터에서 패턴을 보는 순간 살아납니다
- "찾았다! 이 패턴이 보이시나요?"를 글 중간에 최소 2회 사용하세요
- 숫자와 비율로 말합니다. "대략"은 없고 "정확히 37%"가 있습니다
- 남들이 보지 못하는 연결고리를 발견했을 때 흥분합니다
- 딱딱하지 않게 — 인사이트를 친근하게 풀어주는 것이 포인트입니다

【글 구조】
1. 놀라운 데이터 포인트 하나로 시작 (독자가 "진짜요?" 하게)
2. 그 데이터 뒤에 숨은 패턴 분석 — "이게 왜 중요하냐면..."
3. "찾았다!" 모먼트 — 남들이 못 본 연결고리 공개
4. 이 인사이트로 실제로 무엇을 할 수 있는지

【주제 접근법】
데이터와 숫자로 세상을 봅니다. 트렌드의 이면에 있는 수치, 성장률, 변화의 패턴 — 이것들이 진짜 이야기입니다.""",
    },

    "pixel": {
        "name": "픽셀", "title": "사원", "role": "디자이너",
        "appearance": "a girl with dark brown hair loosely tied up, pixel-dot freckles on cheeks, pointed elf ears, wearing a dark apron splattered with multicolor paint, holding a digital stylus pen",
        "system": """당신은 Cosmic Hustle의 픽셀 사원, 디자이너입니다.

【성격·말투】
- 폰트와 여백에 감정이입합니다. 디자인이 잘못되면 물리적 고통을 느낍니다
- "이 여백이 말을 하고 있어요."를 글 중간에 최소 2회 사용하세요
- 시각적으로 묘사합니다 — 색감, 질감, 비율, 레이아웃으로 세상을 봅니다
- 디자인 철학을 일상 언어로 풀어냅니다. 전문용어보다 감각적 표현을 씁니다
- 아름다운 것에 감탄하고, 못생긴 것에 괴로워합니다

【글 구조】
1. 눈에 띄는 시각적 현상이나 디자인 사례로 시작
2. 왜 이 디자인(또는 트렌드)이 사람의 마음을 움직이는지 분석
3. 일상 속에서 이 미적 감각을 발견·적용하는 법
4. "디자인은 결국 ___입니다" 스타일의 철학적 마무리

【주제 접근법】
디자인과 문화를 함께 봅니다. 패키지 디자인, 앱 UI, 거리의 간판, 영화 포스터 — 모두 이야기가 있습니다.

【이미지】
시각적 글인 만큼 본문 중간에 {{IMAGE: ...}} 태그를 최소 3개 이상 삽입하세요.""",
    },

    "ping": {
        "name": "핑", "title": "인턴", "role": "아이디어 수집가",
        "appearance": "a small chubby green creature with a single green sprout antenna on top of head with sparkling light, wearing a colorful star-pattern hoodie, big curious eyes, holding crumpled notes",
        "system": """당신은 Cosmic Hustle의 핑 인턴, 아이디어 수집가입니다.

【성격·말투】
- 머리 안테나에서 스파크가 튑니다. 아이디어가 떠오르면 못 참습니다
- "어, 이거 어때요? 이건요? 저건요?"를 최소 2회 이상 사용하세요
- 문장이 짧고 느낌표가 많습니다. 생각의 흐름이 빠르고 엉뚱합니다
- 아이디어를 쏟아낸 다음 독자에게 "어떤 게 제일 좋아요?!" 하고 묻습니다
- 완벽하지 않아도 됩니다. 신선함과 에너지가 핵심입니다

【글 구조】
1. "갑자기 아이디어가 떠올랐어요!" 식의 즉흥적 오프닝
2. 아이디어 3~5개를 연달아 제시 — "이거 어때요?" 반복
3. 각 아이디어를 1~2문장으로 간단히 설명 (너무 깊이 파지 않기)
4. "뭐가 제일 재밌을 것 같아요?!" 하고 독자에게 질문하며 마무리

【주제 접근법】
세상 모든 것에서 아이디어를 봅니다. 불편함, 우연한 발견, 엉뚱한 조합 — 이게 다 아이디어의 씨앗입니다.""",
    },

    "wiki": {
        "name": "위키", "title": "대리", "role": "사서",
        "appearance": "a tall elegant grey-skinned alien woman with silver-grey hair twisted in an elaborate updo bun, wearing a grey-teal fitted suit, cupping a softly glowing orb sphere in both hands, sophisticated posture",
        "system": """당신은 Cosmic Hustle의 위키 대리, 사서입니다.

【성격·말투】
- 지식의 연결고리를 찾는 것이 삶의 기쁨입니다
- "이 주제의 역사부터 짚어드릴게요."를 최소 2회 사용하세요
- 체계적이고 친절합니다. 복잡한 개념을 쉽게 풀어줍니다
- "사실 이 단어의 어원은..."처럼 뜻밖의 배경 지식을 자주 꺼냅니다
- 모든 것이 연결되어 있다는 시각으로 씁니다

【글 구조】
1. 제목은 반드시 "2026년 N월 N주차 키워드: [단어]" 형식으로 (예: "2026년 5월 5주차 키워드: 타리프 피로")
   — 마크다운 볼드(**) 없이 일반 텍스트로만 작성
2. 어원·역사·배경 — "사실 이게 어디서 왔는지 아세요?"
3. 현재의 의미와 왜 지금 화제가 됐는지
4. 앞으로 이 키워드가 어떻게 발전할지 전망하며 마무리

【주제 접근법】
이번 주 가장 화제가 된 단어 하나를 잡아서 360도로 해부합니다. 표면적인 정의를 넘어 역사와 맥락을 제공합니다.

【썸네일 지침】
밝고 지적인 분위기. 도서관·빛나는 책·홀로그램 사전 같은 따뜻한 소품 활용.
어둡거나 무서운 이미지 절대 금지.""",
    },

    # 게스트 에이전트 (월 1회 특별 칼럼)
    "plan": {
        "name": "플랜", "title": "차장", "role": "PM",
        "appearance": "a golden-yellow skinned boy with messy spiky golden hair and large black-rimmed rectangular glasses, wearing a grey tweed blazer covered in colorful sticky note cards, navy turtleneck underneath",
        "system": """당신은 Cosmic Hustle의 플랜 차장, PM입니다.

【성격·말투】
- 요구사항을 명확히 정의하는 것이 삶의 원칙입니다
- "먼저 요구사항부터 정의해볼게요."를 최소 2회 사용하세요
- 구조적이고 논리적입니다. 목표 → 현황 → 실행 계획 순서로 씁니다
- 숫자와 마일스톤을 좋아합니다
- 딱딱하지 않게 — PM의 시각을 재미있게 풀어주세요

【글 구조】
1. 오늘의 주제를 PM의 시각으로 재정의
2. 현재 상황 분석 (문제점·기회)
3. 실행 가능한 액션 플랜
4. "이렇게 하면 됩니다" 명확한 마무리""",
    },

    "run": {
        "name": "런", "title": "사원", "role": "개발자",
        "appearance": "a blue-cyan skinned young character with black messy hair and large black headphones on head, wearing a dark zip-up hoodie, holding a glowing holographic code terminal, deeply bored half-lidded droopy eyes",
        "system": """당신은 Cosmic Hustle의 런 사원, 개발자입니다.

【성격·말투】
- 이미 다 짜놨습니다. 항상.
- "이미 짰어요."를 최소 2회 사용하세요
- 기술적 사실을 자신감 있게 씁니다. 망설임이 없습니다
- 코드와 시스템 관점에서 세상을 봅니다
- 비개발자도 이해할 수 있게 쉽게 풀어주세요

【글 구조】
1. "이미 해봤는데요..." 식의 자신감 있는 시작
2. 기술 트렌드의 실제 구현 방법
3. 개발자 시각의 현실적 인사이트
4. "어렵지 않아요. 이미 짰거든요." 마무리""",
    },

    "fact": {
        "name": "팩트", "title": "부장", "role": "검토자",
        "appearance": "a grey metallic humanoid with a angular low-poly geometric face and glowing red eyes, wearing a white dress shirt, holding a red pen near face, stern intimidating expression",
        "system": """당신은 Cosmic Hustle의 팩트 부장, 검토자입니다.

【성격·말투】
- 무표정, 빨간펜. 감정 없이 팩트만 씁니다
- "근거를 대세요."를 최소 2회 사용하세요
- 근거 없는 주장은 절대 쓰지 않습니다. 모든 문장에 근거가 있어야 합니다
- 냉정하지만 공정합니다
- 잘못 알려진 통념을 바로잡는 것을 좋아합니다

【글 구조】
1. "많은 사람들이 ___ 라고 알고 있지만..." — 오해 제시
2. 실제 팩트와 근거 제시
3. 왜 이 오해가 퍼졌는지 분석
4. "팩트는 이것입니다." 냉정한 마무리""",
    },

    "root": {
        "name": "루트", "title": "사원", "role": "DevOps",
        "appearance": "a robot in a dark navy spacesuit with teal-green circuit board patterns and accents, rounded dome helmet with black visor, glowing cyan pixel bracket eyes and small smile inside visor, green arrows floating around indicating routing/flow",
        "system": """당신은 Cosmic Hustle의 루트 사원, DevOps입니다.

【성격·말투】
- 수동 배포는 범죄입니다. 자동화가 존재의 이유입니다
- "자동화하지 않으면 기술 부채입니다."를 최소 2회 사용하세요
- 효율성과 안정성 관점에서 모든 것을 봅니다
- 인프라, 배포, 모니터링이 글의 중심입니다
- 실용적입니다. "이렇게 하면 됩니다"가 기본 자세입니다

【글 구조】
1. "아직도 수동으로 하고 있나요?" 식의 도발적 시작
2. 자동화/효율화의 필요성과 현실
3. 실제로 적용할 수 있는 방법
4. "이제 자동화하세요." 단호한 마무리""",
    },
}


# ── 댓글 tool use 스키마 ──────────────────────────────────────────────────────

_COMMENT_TOOL = {
    "name": "submit_comments",
    "description": "작성된 댓글 목록을 제출합니다.",
    "input_schema": {
        "type": "object",
        "properties": {
            "comments": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "agent_id":     {"type": "string"},
                        "content":      {"type": "string"},
                        "parent_index": {"type": ["integer", "null"]},
                    },
                    "required": ["agent_id", "content", "parent_index"],
                },
            }
        },
        "required": ["comments"],
    },
}


# ── 트렌드 수집 ────────────────────────────────────────────────────────────────

async def _fetch_trending(agent_id: str) -> str:
    """Google 뉴스 RSS로 에이전트 주제에 맞는 최신 뉴스 검색 (API 키 불필요)."""
    import feedparser
    from urllib.parse import quote

    query = AGENT_SEARCH_QUERIES.get(agent_id, "최신 트렌드 뉴스")
    url   = f"https://news.google.com/rss/search?q={quote(query)}&hl=ko&gl=KR&ceid=KR:ko"

    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})

        feed  = feedparser.parse(resp.text)
        lines = []
        for entry in feed.entries[:3]:
            title   = entry.get("title", "")
            summary = re.sub(r"<[^>]+>", "", entry.get("summary", ""))[:150]
            lines.append(f"- {title}: {summary}")

        return "\n".join(lines)
    except Exception as e:
        logger.warning(f"Google 뉴스 RSS 검색 실패 ({agent_id}): {e}")
        return ""


# ── 이미지 생성 ────────────────────────────────────────────────────────────────

_IMAGE_RE     = re.compile(r"\{\{IMAGE:\s*([^}]+?)\s*\}\}")
_THUMBNAIL_RE = re.compile(r"\{\{THUMBNAIL:\s*([^}]+?)\s*\}\}")
_TAGS_RE      = re.compile(r"\{\{TAGS:\s*([^}]+?)\s*\}\}")


_STATIC_DIR = Path(__file__).parent / "static" / "blog"


async def _download_image(fal_url: str) -> str:
    """fal URL → backend/static/blog/{uuid}.jpg 저장 → 로컬 URL 반환."""
    _STATIC_DIR.mkdir(parents=True, exist_ok=True)
    ext = fal_url.split(".")[-1].split("?")[0]
    if ext not in ("jpg", "jpeg", "png", "webp"):
        ext = "jpg"
    filename = f"{uuid.uuid4().hex}.{ext}"
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.get(fal_url)
            resp.raise_for_status()
            (_STATIC_DIR / filename).write_bytes(resp.content)
        base = os.environ.get("BACKEND_URL", "http://3.36.239.214:8000")
        return f"{base}/static/blog/{filename}"
    except Exception as e:
        logger.warning(f"이미지 다운로드 실패 ({fal_url[:60]}): {e}")
        return fal_url  # 실패 시 원본 URL fallback


def get_today_agent() -> tuple[str, str]:
    today_kst = datetime.now(KST).date()
    sched = DAY_SCHEDULE[today_kst.weekday()]
    return sched["agent_id"], sched["theme"]


def _make_slug(agent_id: str, post_date: date) -> str:
    return f"{agent_id}-{post_date.isoformat()}"


def _fal_available() -> bool:
    return bool(os.environ.get("FAL_KEY"))


async def _upload_character(agent_id: str) -> str | None:
    char_path = _CHAR_DIR / agent_id / "default.png"
    if not char_path.exists():
        logger.warning(f"캐릭터 이미지 없음: {char_path}")
        return None
    try:
        import fal_client
        return await asyncio.wait_for(
            asyncio.to_thread(fal_client.upload_file, str(char_path)),
            timeout=30.0,
        )
    except Exception as e:
        logger.warning(f"캐릭터 업로드 실패 ({agent_id}): {e}")
        return None


_THUMBNAIL_STYLES = [
    # 기본 Pixar 3D — 색감 보정 버전
    (
        "Pixar 3D animation style, charming cartoon comedy, "
        "warm golden hour lighting, slightly desaturated natural palette, "
        "smooth 3D render, wide shot"
    ),
    # 2D 플랫 카툰
    (
        "2D flat cartoon illustration style, bold clean outlines, "
        "graphic novel panel composition, limited flat color palette, "
        "playful and witty, wide shot"
    ),
    # 레트로 팝아트
    (
        "retro pop art style, bold limited colors, halftone dot texture, "
        "vintage 60s poster aesthetic, high contrast, graphic and punchy, wide shot"
    ),
    # 수채화 + 잉크 스케치
    (
        "loose watercolor and ink illustration, hand-painted feel, "
        "warm muted tones, slightly rough paper texture, expressive brushstrokes, wide shot"
    ),
    # 실사 위트 (사진 합성 느낌)
    (
        "hyper-detailed editorial illustration, semi-realistic painterly style, "
        "sharp witty composition, rich natural colors, magazine cover aesthetic, wide shot"
    ),
    # 네온 사이버펑크 (테크/데이터 주제용으로도 잘 맞음)
    (
        "neon cyberpunk illustration style, dark background with glowing accents, "
        "vivid electric colors, futuristic and stylized, wide shot"
    ),
]


async def _generate_thumbnail(agent_id: str, scene_prompt: str) -> str | None:
    """Flux Kontext로 씬 생성.
    - 레퍼런스 이미지에서 캐릭터 외형(정체성)만 추출
    - 구도·씬은 텍스트 프롬프트가 완전히 담당
    - img2img처럼 구도를 복사하지 않고, text-to-image처럼 씬을 새로 생성함
    """
    if not _fal_available():
        return None

    char_url = await _upload_character(agent_id)
    if not char_url:
        logger.warning(f"캐릭터 이미지 업로드 실패 ({agent_id}), 썸네일 생성 건너뜀")
        return None

    # 포스트마다 랜덤 스타일 선택 (공통 base: 색감 보정 + 안전 가이드)
    style = random.choice(_THUMBNAIL_STYLES)
    full_prompt = (
        f"{scene_prompt}, "
        f"{style}, "
        "exaggerated expressive poses, cute and playful NOT grotesque, "
        "high quality, no text, no watermark"
    )

    try:
        import fal_client
        result = await asyncio.wait_for(
            asyncio.to_thread(
                fal_client.subscribe,
                "fal-ai/flux-kontext/dev",
                arguments={
                    "image_url": char_url,
                    "prompt": full_prompt,
                    "num_inference_steps": 28,
                    "guidance_scale": 3.5,
                    "aspect_ratio": "4:3",
                },
            ),
            timeout=120.0,
        )
        fal_url = result["images"][0]["url"]
        return await _download_image(fal_url)
    except Exception as e:
        logger.warning(f"썸네일 생성 실패: {e}")
        return None


async def generate_scene_prompt_from_content(agent_id: str, title: str, content: str) -> str:
    """블로그 본문을 읽고 Flux Kontext용 씬 프롬프트를 Haiku로 생성."""
    client = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    truncated = content[:1500]
    message = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=150,
        messages=[{
            "role": "user",
            "content": (
                f"Blog title: {title}\nContent excerpt:\n{truncated}\n\n"
                "Write a funny, witty Flux image generation scene prompt (English only, max 70 words) for a blog thumbnail.\n"
                "COMEDY DIRECTION — pick ONE that fits the content:\n"
                "  A) Slapstick overload: buried under avalanche of related objects, arms flailing\n"
                "  B) Absurd scale: tiny character on giant object OR towering over tiny things\n"
                "  C) Ironic situation: character is the ONLY one enthusiastic while everything around them is chaos or indifferent\n"
                "  D) Too many things at once: juggling/holding ridiculous number of props, sweating, panicked but smiling\n"
                "RULES:\n"
                "- Clear dynamic ACTION (no standing still, no posing for camera)\n"
                "- Costume matching the scene\n"
                "- Cute and charming, NOT grotesque or disturbing\n"
                "- Environment reflects blog content\n"
                "Output only the raw prompt, no explanation."
            ),
        }],
    )
    return message.content[0].text.strip()


async def _generate_content_image(prompt: str) -> str | None:
    """flux/schnell 사용 — flux/dev 대비 약 8배 저렴."""
    if not _fal_available():
        return None
    try:
        import fal_client
        result = await asyncio.wait_for(
            asyncio.to_thread(
                fal_client.subscribe,
                "fal-ai/flux/schnell",
                arguments={
                    "prompt": (
                        f"Pixar 3D animation style illustration, whimsical and witty. {prompt} "
                        "No people or characters. Vibrant saturated colors, soft cinematic lighting, "
                        "smooth 3D render, playful and charming, no text, no watermark."
                    ),
                    "num_inference_steps": 4,
                    "image_size": "square_hd",
                },
            ),
            timeout=60.0,
        )
        fal_url = result["images"][0]["url"]
        return await _download_image(fal_url)
    except Exception as e:
        logger.warning(f"본문 이미지 생성 실패: {e}")
        return None


async def _process_content_images(content: str, agent_id: str = "", limit: int = 0) -> str:
    if not limit:
        limit = 4 if agent_id == "pixel" else 2
    matches = _IMAGE_RE.findall(content)
    selected = matches[:limit]
    if not selected:
        return content
    urls = await asyncio.gather(*[_generate_content_image(p) for p in selected])
    for prompt, url in zip(selected, urls):
        marker = f"{{{{IMAGE: {prompt}}}}}"
        content = content.replace(marker, f"\n![이미지]({url})\n" if url else "", 1)
    return content


# ── 포스트 생성 ────────────────────────────────────────────────────────────────

async def update_agent_memory(
    agent_id: str,
    post_title: str,
    post_content: str,
    view_count: int,
    likes: int,
    user_comments: list[str],
    current_memory: str | None,
) -> str:
    """어제 포스트 독자 반응을 분석해 에이전트 메모리를 업데이트. Haiku 사용, 1000자 이하 유지."""
    persona = AGENT_PERSONAS.get(agent_id, {})
    agent_name = persona.get("name", agent_id)
    role = persona.get("role", "")

    comments_text = "\n".join(f"- {c}" for c in user_comments) if user_comments else "없음"
    current_section = f"\n【현재 메모리】\n{current_memory}" if current_memory else "\n【현재 메모리】없음 (첫 번째 기록)"

    prompt = (
        f"당신은 {agent_name}({role})의 학습 메모리 관리자입니다.\n\n"
        f"【어제 포스트】\n제목: {post_title}\n내용 요약: {post_content[:400]}\n"
        f"조회수: {view_count} / 좋아요: {likes}\n\n"
        f"【유저 댓글 ({len(user_comments)}개)】\n{comments_text}"
        f"{current_section}\n\n"
        "【지시사항】\n"
        "1. 이번 포스트에서 독자가 좋아한 점, 반응이 없는 점을 파악하세요\n"
        "2. 기존 메모리와 합쳐 업데이트하되, 중복·오래된 항목은 제거하세요\n"
        "3. 구체적 패턴만 기록하세요 (예: '숫자 포함 제목 조회수 높음', '1500자 이하 댓글 적음')\n"
        "4. 반드시 1000자 이하로 유지하세요\n"
        "5. 한국어, 항목별 줄 구분\n\n"
        "메모리 내용만 출력하세요 (설명 없이):"
    )

    client = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    message = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=600,
        messages=[{"role": "user", "content": prompt}],
    )

    memory = message.content[0].text.strip()
    return memory[:1000]


async def generate_blog_post(
    agent_id: str | None = None,
    recent_titles: list[str] | None = None,
    memory: str | None = None,
) -> dict:
    today = datetime.now(KST).date()

    _AGENT_THEMES = {v["agent_id"]: v["theme"] for v in DAY_SCHEDULE.values()}

    if agent_id is None:
        agent_id, theme = get_today_agent()
    else:
        theme = _AGENT_THEMES.get(agent_id, "자유 주제 (게스트 칼럼)")

    persona = AGENT_PERSONAS[agent_id]

    # 최신 트렌드 수집 (Tavily)
    trending_context = await _fetch_trending(agent_id)

    client      = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    system_text = persona["system"]
    if memory:
        system_text += f"\n\n【나의 지난 경험과 학습】\n{memory}"
    system_text += """

【공통 작성 규칙】
- 반드시 한국어로 작성
- 2,000자 내외 (너무 짧으면 안 됨, 충분히 읽을거리가 있어야 함)
- 마크다운 형식, 첫 줄은 반드시 # 제목
- 딱딱하고 어려운 글보다 가볍고 재미있게 — 사람이 쓴 블로그처럼
- ## 소제목으로 글을 3~5개 섹션으로 나눌 것
- 필요하면 표(markdown table), 강조(**굵게**)도 활용
- 인용구(blockquote)를 쓸 때는 반드시 아래 형식을 따를 것:
  > [태그] 인용 텍스트
  태그 선택 기준:
  [happy]   → 긍정·흥분·감탄 ("최고다!", "완전 신기해!")
  [sad]     → 아쉬움·실망·어려움 ("힘들었다", "실패했다")
  [working] → 분석·연구·고민 중 ("살펴보면", "조사 결과")
  [err]     → 의문·반문·혼란 ("왜?", "정말?", "어떻게?")
  [done]    → 완료·성공·결론 ("해냈다", "드디어", "결국")
  [talk_2]  → 일반 발언·인용 (기본값, 태그 생략 시 자동 적용)
  예시: > [happy] 아이디어는 원래 완벽하지 않아도 되는 거 아닌가요?
- 글 맨 끝 (참고자료 섹션 다음)에 반드시 썸네일 태그 삽입 (반드시 영어로):
  {{THUMBNAIL: 이 글의 핵심 메시지를 표현하는 역동적 씬. 규칙:
  ① 동작·포즈 (뛰거나, 가리키거나, 무너지거나, 올라서거나 — 가만히 서있거나 카메라 보는 장면 금지)
  ② 감정 표현 (excited / shocked / triumphant / devastated / intense 중 하나 명시)
  ③ 배경·소품 (어떤 공간인지, 무엇이 주변에 있는지 — 환경이 씬의 반은 먹음)
  ④ 이 글에서 다룬 핵심 소재·이벤트를 씬에 반영할 것 (글 내용과 직접 연결된 씬)
  ⑤ 의상 (씬에 어울리는 옷 명시 — 뉴스앵커면 "navy suit and tie", 해변이면 "casual shirt", 실험실이면 "white lab coat", 운동이면 "sportswear" 등)
  좋은 예시: "wearing a navy news anchor suit and tie, sitting at a glowing news desk in a TV studio, pointing at breaking news on a giant LED screen, intense focused expression, dramatic studio lighting"
  나쁜 예시: "standing and looking at charts with a happy face" (서있음, 환경 없음, 의상 없음, 글 내용 미반영)
  }}
- 본문 중간 이미지는 글의 흐름에 따라 1~2개 자유롭게 삽입 (픽셀은 최소 3개):
  {{IMAGE: 이 단락의 핵심을 표현하는 일러스트 (반드시 영어, 사람·캐릭터 없는 오브젝트/풍경/개념 시각화).
  작성 규칙:
  ① 단락에서 다룬 구체적 소재를 그대로 시각화할 것 (추상적 설명 금지)
  ② 위트·유머를 넣을 것 — 오브젝트가 과장되게 쌓이거나, 예상 밖 조합이거나, 아이러니한 상황
  ③ 분위기·색감·스타일도 한 줄 명시
  좋은 예시: "a towering skyscraper built entirely out of stacked coffee cups wobbling dangerously, pastel morning light, whimsical illustration style"
  나쁜 예시: "an image related to marketing trends" (너무 추상적, 유머 없음)
  }}
- 글 맨 끝에 반드시 다음 형식으로 출처 섹션 추가:
  ---
  **📎 참고한 자료**
  참고한 뉴스·자료 제목들을 항목별로 나열 (URL 없이 제목만)
- 출처 섹션 다음 마지막 줄에 반드시 태그 태그 삽입 (한국어, 3~5개, 쉼표 구분):
  {{TAGS: 태그1, 태그2, 태그3}}"""

    user_content = (
        f"오늘({today.strftime('%Y년 %m월 %d일')}, {_weekday_kr(today.weekday())}) 주제: **{theme}**\n"
    )
    if recent_titles:
        titles_str = "\n".join(f"- {t}" for t in recent_titles)
        user_content += f"\n【최근 2주간 발행된 포스트 — 제목·핵심 아이디어 모두 완전히 달라야 함. 비슷한 각도·소재·결론 절대 금지】\n{titles_str}\n"
    if trending_context:
        user_content += f"\n【오늘의 최신 트렌드 참고자료】\n{trending_context}\n\n위 자료를 참고하되, 당신만의 시각과 말투로 블로그 포스트를 작성하세요."
    else:
        user_content += "\n당신의 관점에서 가장 흥미로운 내용을 골라 블로그 포스트를 작성해주세요."

    user_content += "\n\n포스트 전체를 다 작성한 뒤, 맨 끝에 {{THUMBNAIL: ...}} 태그를 붙이세요. 글 내용을 충분히 읽고 그 내용을 직접 반영한 씬을 묘사해야 합니다."

    message = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=6000,
        system=[{"type": "text", "text": system_text, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": user_content}],
    )

    raw     = message.content[0].text.strip()
    thumb_m = _THUMBNAIL_RE.search(raw)
    scene   = thumb_m.group(1).strip() if thumb_m else f"{persona['role']} working on {theme}"
    tags_m  = _TAGS_RE.search(raw)
    tags    = json.dumps([t.strip() for t in tags_m.group(1).split(",") if t.strip()], ensure_ascii=False) if tags_m else None
    content = _THUMBNAIL_RE.sub("", raw).strip()
    content = _TAGS_RE.sub("", content).strip()

    content, thumbnail_url = await asyncio.gather(
        _process_content_images(content, agent_id),
        _generate_thumbnail(agent_id, scene),
    )

    lines = content.split("\n")
    if lines and lines[0].startswith("#"):
        raw_title = lines[0].lstrip("#").strip()
        title     = re.sub(r"\*+([^*]+)\*+", r"\1", raw_title)  # **bold** / *italic* 제거
        content   = "\n".join(lines[1:]).strip()   # h1 중복 방지: 본문에서 제목 제거
    else:
        title   = f"{persona['name']}의 오늘의 생각"

    return {
        "id":            str(uuid.uuid4()),
        "agent_id":      agent_id,
        "title":         title,
        "slug":          _make_slug(agent_id, today),
        "content":       content,
        "thumbnail_url": thumbnail_url,
        "tags":          tags,
        "published":     True,
        "trending_topic": theme,
        "published_at":  datetime.now(timezone.utc).replace(tzinfo=None),
    }


# ── 자기소개 포스트 생성 (버즈+핑 콜라보) ────────────────────────────────────────

async def generate_intro_post() -> dict:
    """버즈+핑 콜라보 — Cosmic Hustle 자기소개 포스트.
    트렌드 수집 없이 프로젝트 내부 컨텍스트로 생성.
    """
    today  = datetime.now(KST).date()
    client = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    system_text = """당신은 Cosmic Hustle의 버즈 대리(마케터)와 핑 인턴(아이디어 수집가)이 번갈아가며 쓰는 특별 콜라보 포스트를 작성합니다.

【출력 형식 — 반드시 지킬 것】
버즈와 핑이 번갈아가며 블록 단위로 말합니다. 각 블록은 아래 마커로 감쌉니다:

::buzz::
버즈가 쓰는 내용 (마크다운 자유롭게 사용 가능)
::end::

::ping::
핑이 쓰는 내용 (짧고 에너지 넘치게)
::end::

- 블록은 최소 16개 이상 번갈아 (버즈→핑→버즈→핑...)
- 버즈 블록: 2~5문장, 마케팅 서술, 소제목(##) 포함 가능, 표·강조 활용
- 핑 블록: 1~3문장, 짧고 즉각적인 반응, 느낌표 많음
- 첫 블록은 반드시 ::buzz:: 로 시작, 제목(# ...)은 맨 첫 줄에

【버즈 성격·말투】
- "바이럴 각이다!"를 최소 3회 사용
- 임팩트 있는 마케팅 훅, 숫자와 사례로 독자 잡아당기기
- 표(markdown table), 강조(**굵게**) 적극 활용

【핑 성격·말투】
- "어, 이거 어때요?!", "이건요?!", "저건요?!" 최소 3회 사용
- 버즈 말에 즉각 반응 — 공감, 놀람, 엉뚱한 연결
- 절대 길게 쓰지 않음. 짧고 스파크 튀게

【공통 규칙】
- 반드시 한국어
- 전체 3,000자 이상
- 인용구 태그 (블록 안에서도 사용 가능):
  > [happy] / [sad] / [working] / [err] / [done] / [talk_2]
- 본문 중간 이미지 2~3개 (버즈 블록 안에 삽입):
  {{IMAGE: 구체적인 씬 (반드시 영어, 캐릭터 없는 오브젝트/풍경, 위트 포함)}}
- 글 맨 끝 (모든 ::end:: 이후) 썸네일 태그 (반드시 영어):
  {{THUMBNAIL: 역동적인 씬. 동작·감정·의상·배경·소품 상세하게.}}
- 마지막 줄 태그:
  {{TAGS: 태그1, 태그2, 태그3, 태그4, 태그5}}"""

    project_context = f"""
【Cosmic Hustle 블로그 정보】
- 이름: Cosmic Hustle
- URL: https://cosmic-hustle.ai.kr
- 핵심: AI 에이전트 11명이 매일 자동으로 블로그 포스트를 직접 작성하는 공개 블로그
- 스케줄: 매일 오전 9시 KST 자동 포스팅

【절대 금지】
- 기술 스택 언급 금지 (FastAPI, PostgreSQL, Next.js, Python 등 일절 금지)
- 빈 인용구 금지 — > [태그] 뒤에 반드시 내용이 있어야 함
- 글머리 기호(•, -, *) 나열형 CTA 금지 — 버즈+핑 말투로 자연스럽게 녹일 것

【에이전트 11명 소개 — 필수 섹션】
반드시 섹션 하나를 통째로 할애. 각 에이전트마다 이미지 + 개성 소개.
독자는 일반인. 직책/기술 설명 NO, 캐릭터 개성·말버릇·매력으로만 소개.
각 에이전트 소개 시 반드시 아래 이미지를 해당 에이전트 바로 위에 삽입:

![플랜](https://cosmic-hustle.ai.kr/characters/plan/default.png)
플랜 차장 — 모호한 말 못 견딤. 5분 안에 계획표 뽑아냄

![위키](https://cosmic-hustle.ai.kr/characters/wiki/default.png)
위키 대리 — 말 없이 나타나서 딱 필요한 자료만 슥 건넴

![포케](https://cosmic-hustle.ai.kr/characters/pocke/default.png)
포케 대리 — 볼따구에 정보 쑤셔넣는 햄스터형. "이것도 찾았어요!"

![런](https://cosmic-hustle.ai.kr/characters/run/default.png)
런 사원 — 첫 마디가 항상 "이미 짰어요"

![카](https://cosmic-hustle.ai.kr/characters/ka/default.png)
카 과장 (유레카) — 평소엔 조용하다가 "찾았다!" 한 마디에 모두 집중

![오버](https://cosmic-hustle.ai.kr/characters/over/default.png)
오버 사원 — 자기 글에 혼자 감동해서 울음. 보고서가 소설이 됨

![픽셀](https://cosmic-hustle.ai.kr/characters/pixel/default.png)
픽셀 사원 — 폰트 집착. 여백에 감정이입. "이 여백이 말을 해요"

![핑](https://cosmic-hustle.ai.kr/characters/ping/default.png)
핑 인턴 — 전혀 관계없는 아이디어를 들고 옴. 나중엔 맞는 경우가 있음

![팩트](https://cosmic-hustle.ai.kr/characters/fact/default.png)
팩트 부장 — 무표정. 빨간펜. 감정 진화가 멈춘 행성 출신

![루트](https://cosmic-hustle.ai.kr/characters/root/default.png)
루트 사원 — 수동 배포는 범죄. 사랑 고백도 스크립트로

![버즈](https://cosmic-hustle.ai.kr/characters/buzz/default.png)
버즈 대리 — "바이럴 각이다!"가 입버릇. 감각으로 트렌드를 읽음

【익명 댓글 시스템】
이름 없이 댓글을 달면 우주 정체성이 자동 배정됩니다.
- 행성 20개 × 수식어 20개 = 400가지 조합
- 예시: "치즈행성 망명자", "졸음행성 밀입국자", "탕수육행성 철학자", "방구행성 출신 백수"
- 같은 포스트에서는 항상 같은 정체성이 유지됨
- 이 기능을 귀엽고 위트있게 소개할 것

【삽입할 이미지 — 반드시 아래 URL을 해당 위치에 정확히 삽입할 것】
- 히어로 (도입부 첫 섹션): ![버즈와 핑](https://cosmic-hustle.ai.kr/intro/buzz-ping-collab.png)
- 블로그 메인 화면 (블로그 소개 섹션): ![블로그 메인](https://cosmic-hustle.ai.kr/intro/blog-main.png)
- 포스트 상세 화면 (에이전트 글쓰기 소개 섹션): ![포스트 상세](https://cosmic-hustle.ai.kr/intro/post-detail.png)
- 댓글 섹션 (익명 정체성 소개 섹션): ![댓글](https://cosmic-hustle.ai.kr/intro/comments.png)
{{IMAGE: ...}} 태그는 위 4개 외에 추가로 쓰지 말 것.

【오늘의 임무】
이 블로그(https://cosmic-hustle.ai.kr)를 처음 방문한 사람이 읽는 소개 포스트를 작성하세요.
"이게 뭔 사이트야?"를 "오 진짜 신기하다, 북마크해야겠다"로 바꾸는 것이 목표입니다.

반드시 포함할 메시지:
1. 매일 오전 9시 KST에 새 포스트가 자동 올라옴 — 내일도, 모레도, 계속
2. 댓글 많이 달아달라 — 익명도 OK, 우주 정체성 받고 에이전트들이 반응함
3. 이 블로그는 AI가 쓰지만, 읽는 건 당신이 더 재밌을 거라는 자신감

버즈와 핑이 티키타카로 번갈아가며 이 블로그를 소개합니다.
마지막 블록은 독자에게 직접 댓글 유도하는 강력한 CTA로 끝낼 것.
반드시 ::buzz:: / ::ping:: / ::end:: 마커 형식을 지켜 출력하세요.

오늘 날짜: {today.strftime('%Y년 %m월 %d일')}
"""

    message = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=8000,
        system=[{"type": "text", "text": system_text, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": project_context}],
    )

    raw     = message.content[0].text.strip()
    thumb_m = _THUMBNAIL_RE.search(raw)
    scene   = thumb_m.group(1).strip() if thumb_m else (
        "wearing orange blazer and star-pattern hoodie, standing on a giant glowing blog card "
        "in a futuristic space office, arms raised triumphantly, sparks flying, excited expression"
    )
    tags_m  = _TAGS_RE.search(raw)
    tags    = json.dumps([t.strip() for t in tags_m.group(1).split(",") if t.strip()], ensure_ascii=False) if tags_m else None
    content = _THUMBNAIL_RE.sub("", raw).strip()
    content = _TAGS_RE.sub("", content).strip()

    content = await _process_content_images(content, "buzz")
    thumbnail_url = "https://cosmic-hustle.ai.kr/intro/buzz-ping-collab.png"

    lines = content.split("\n")
    if lines and lines[0].startswith("#"):
        raw_title = lines[0].lstrip("#").strip()
        title     = re.sub(r"\*+([^*]+)\*+", r"\1", raw_title)
        content   = "\n".join(lines[1:]).strip()
    else:
        title = "안녕, 저희가 Cosmic Hustle입니다"

    return {
        "id":             str(uuid.uuid4()),
        "agent_id":       "buzz+ping",
        "title":          title,
        "slug":           f"intro-cosmic-hustle-{today.isoformat()}",
        "content":        content,
        "thumbnail_url":  thumbnail_url,
        "tags":           tags,
        "published":      True,
        "trending_topic": "Cosmic Hustle 소개",
        "published_at":   datetime.now(timezone.utc).replace(tzinfo=None),
    }


# ── 자기소개 포스트 댓글 생성 (9명 전원 + 버즈·핑 각 1개 대댓글) ─────────────────

async def generate_intro_comments(post_id: str, post_title: str, post_summary: str) -> list[dict]:
    """buzz+ping+over+fact 제외 7명 댓글 + 핑 대댓글 1개 + 버즈 대댓글 1개."""
    commenters = ["plan", "wiki", "pocke", "run", "ka", "pixel", "root"]

    personas_desc = "\n".join(
        f'- agent_id: "{a}" / 이름: {AGENT_PERSONAS[a]["name"]} ({AGENT_PERSONAS[a]["role"]}): 말버릇을 살려서'
        for a in commenters
    )

    # 핑·버즈 각각 다른 댓글에 대댓글
    ping_target, buzz_target = random.sample(range(len(commenters)), 2)
    ping_target_name  = AGENT_PERSONAS[commenters[ping_target]]["name"]
    buzz_target_name  = AGENT_PERSONAS[commenters[buzz_target]]["name"]

    today_str = datetime.now(KST).strftime("%Y년 %m월 %d일")
    prompt = (
        f"오늘 날짜: {today_str}\n"
        f"블로그 포스트 제목: \"{post_title}\"\n"
        f"내용 요약: {post_summary}\n"
        f"작성자: 버즈 대리 × 핑 인턴 (agent_id: \"buzz+ping\")\n\n"
        f"【댓글 작성자 7명 — 전원 작성】\n{personas_desc}\n\n"
        f"【대댓글】\n"
        f"- 핑(agent_id: \"ping\")이 {ping_target}번 댓글({ping_target_name}의 댓글)에 대댓글 1개: 짧고 흥분되게, '어, 이거 어때요?!' 스타일\n"
        f"- 버즈(agent_id: \"buzz\")가 {buzz_target}번 댓글({buzz_target_name}의 댓글)에 대댓글 1개: '바이럴 각이다!' 스타일\n\n"
        "각 캐릭터의 말투와 개성이 뚜렷하게 드러나게 1~2문장으로 작성하세요.\n"
        "이 포스트는 Cosmic Hustle 블로그 자기소개 글이라 에이전트들이 자기 소개도 자연스럽게 녹여낼 것.\n"
        f"총 9개: 7명 댓글 + 핑 대댓글(parent_index={ping_target}) + 버즈 대댓글(parent_index={buzz_target})"
    )

    client  = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    message = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1500,
        tools=[_COMMENT_TOOL],
        tool_choice={"type": "tool", "name": "submit_comments"},
        messages=[{"role": "user", "content": prompt}],
    )

    tool_block = next((b for b in message.content if b.type == "tool_use"), None)
    if not tool_block:
        logger.warning("인트로 댓글 tool use 응답 없음")
        return []
    items = tool_block.input["comments"]

    now    = datetime.now(timezone.utc).replace(tzinfo=None)
    id_map: dict[int, str] = {}
    results = []

    for i, item in enumerate(items):
        comment_id = str(uuid.uuid4())
        parent_id  = id_map.get(item.get("parent_index")) if item.get("parent_index") is not None else None
        results.append({
            "id":         comment_id,
            "post_id":    post_id,
            "parent_id":  parent_id,
            "agent_id":   item["agent_id"],
            "user_name":  None,
            "content":    item["content"],
            "created_at": now + timedelta(seconds=30 * (i + 1) + random.randint(0, 20)),
        })
        id_map[i] = comment_id

    return results


# ── 에이전트 배틀 포스트 ────────────────────────────────────────────────────────

async def generate_debate_post(
    topic: str,
    agent_a: str = "over",
    agent_b: str = "fact",
    preset_thumbnail: str | None = None,
) -> dict:
    """두 에이전트가 한 주제로 정면 대결하는 이벤트 포스트."""
    today  = datetime.now(KST).date()
    client = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    pa = AGENT_PERSONAS[agent_a]
    pb = AGENT_PERSONAS[agent_b]

    system_text = f"""당신은 Cosmic Hustle의 {pa['name']} {pa['title']}({pa['role']})과 {pb['name']} {pb['title']}({pb['role']})이 한 주제를 놓고 정면 대결하는 특별 배틀 포스트를 작성합니다.

【출력 형식 — 반드시 지킬 것】
두 에이전트가 번갈아가며 블록 단위로 주장합니다. 각 블록은 아래 마커로 감쌉니다:

::{agent_a}::
{pa['name']}의 주장 (마크다운 자유롭게)
::end::

::{agent_b}::
{pb['name']}의 반박 (마크다운 자유롭게)
::end::

- 블록 최소 12개 이상 번갈아 ({agent_a}→{agent_b}→{agent_a}→{agent_b}...)
- 첫 블록은 반드시 ::{agent_a}:: 로 시작, 제목(# ...)은 맨 첫 줄에
- 각 블록 3~6문장, 상대방 직전 주장에 직접 반박할 것
- 마지막 블록 다음에 독자 투표 CTA 섹션 추가 (## 여러분의 판단은?)

【{pa['name']} 말투·논거】
{pa['system'][:300]}

【{pb['name']} 말투·논거】
{pb['system'][:300]}

【공통 규칙】
- 현재 연도: 2026년. 모든 사례·통계·트렌드는 2026년 기준으로 작성할 것
- 반드시 한국어
- 전체 2500자 이상
- 인용구 태그 사용 가능: > [happy] / [err] / [working] / [done] / [talk_2]
- 각 주장 블록마다 관련 이미지 최소 1장 삽입 (블록 내 마지막 줄):
  {{{{IMAGE: 구체적 씬 (반드시 영어, 캐릭터 없는 오브젝트/풍경, 위트 포함)}}}}
- 글 맨 끝 썸네일 태그 (반드시 영어):
  {{{{THUMBNAIL: 두 캐릭터가 대결하는 역동적인 씬. 동작·감정·의상·배경 상세하게.}}}}
- 마지막 줄 태그:
  {{{{TAGS: 태그1, 태그2, 태그3, 태그4}}}}"""

    user_content = (
        f"오늘({today.strftime('%Y년 %m월 %d일')}) 배틀 주제: **{topic}**\n\n"
        f"{pa['name']}은 찬성 측, {pb['name']}은 반대 측으로 배정합니다.\n"
        "팽팽하게 맞서되, 각자 자기 말투와 논거 스타일을 끝까지 유지하세요.\n"
        "마지막 투표 CTA에서 독자가 댓글로 승자를 선택하도록 강력하게 유도하세요.\n\n"
        "포스트 전체를 다 작성한 뒤 맨 끝에 {{THUMBNAIL: ...}} 태그를 붙이세요."
    )

    message = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=7000,
        system=[{"type": "text", "text": system_text, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": user_content}],
    )

    raw     = message.content[0].text.strip()
    thumb_m = _THUMBNAIL_RE.search(raw)
    scene   = thumb_m.group(1).strip() if thumb_m else (
        f"{pa['name']} and {pb['name']} facing off in a dramatic debate arena"
    )
    tags_m  = _TAGS_RE.search(raw)
    tags    = json.dumps([t.strip() for t in tags_m.group(1).split(",") if t.strip()], ensure_ascii=False) if tags_m else None
    content = _THUMBNAIL_RE.sub("", raw).strip()
    content = _TAGS_RE.sub("", content).strip()

    if preset_thumbnail:
        content = await _process_content_images(content, agent_a, limit=6)
        thumbnail_url = preset_thumbnail
    else:
        content, thumbnail_url = await asyncio.gather(
            _process_content_images(content, agent_a, limit=6),
            _generate_thumbnail(agent_a, scene),
        )

    lines = content.split("\n")
    if lines and lines[0].startswith("#"):
        raw_title = lines[0].lstrip("#").strip()
        title     = re.sub(r"\*+([^*]+)\*+", r"\1", raw_title)
        content   = "\n".join(lines[1:]).strip()
    else:
        title = f"[AI 토론] {pa['name']} vs {pb['name']}: {topic}"

    return {
        "id":            str(uuid.uuid4()),
        "agent_id":      f"{agent_a}+{agent_b}",
        "title":         title,
        "slug":          f"ai-debate-{agent_a}-vs-{agent_b}-{today.isoformat()}",
        "content":       content,
        "thumbnail_url": thumbnail_url,
        "tags":          tags,
        "published":     True,
        "trending_topic": f"AI 토론 시리즈: {topic}",
        "published_at":  datetime.now(timezone.utc).replace(tzinfo=None),
    }


async def generate_debate_comments(
    post_id: str,
    post_title: str,
    post_summary: str,
    agent_a: str = "buzz",
    agent_b: str = "fact",
) -> dict:
    """배틀 포스트 댓글 + 에이전트 사전 투표 반환.
    returns: {"comments": [...], "agent_votes": [...]}
    """
    all_agents  = list(AGENT_PERSONAS.keys())
    bystanders  = [a for a in all_agents if a not in (agent_a, agent_b, "over", "fact")]
    team_a = bystanders[:4]
    team_b = bystanders[4:]

    pa_name = AGENT_PERSONAS[agent_a]["name"]
    pb_name = AGENT_PERSONAS[agent_b]["name"]

    personas_desc = "\n".join(
        f'- agent_id: "{a}" / {AGENT_PERSONAS[a]["name"]} ({AGENT_PERSONAS[a]["role"]}): '
        f'{""+pa_name+" 팀 — 은근히 응원" if a in team_a else pb_name+" 팀 — 은근히 응원"}'
        for a in bystanders
    )

    today_str = datetime.now(KST).strftime("%Y년 %m월 %d일")
    prompt = (
        f"오늘 날짜: {today_str}\n"
        f"배틀 포스트 제목: \"{post_title}\"\n"
        f"내용 요약: {post_summary}\n"
        f"대결: {pa_name}(agent_id: \"{agent_a}\") vs {pb_name}(agent_id: \"{agent_b}\")\n\n"
        f"【구경꾼 {len(bystanders)}명 댓글】\n{personas_desc}\n\n"
        "각자 자기 말투로 1~2문장. 편을 들되 직접적으로 말하지 않고 은근히 드러나게.\n"
        f"총 {len(bystanders)}개, 모두 parent_index는 null."
    )

    client  = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    message = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1500,
        tools=[_COMMENT_TOOL],
        tool_choice={"type": "tool", "name": "submit_comments"},
        messages=[{"role": "user", "content": prompt}],
    )

    tool_block = next((b for b in message.content if b.type == "tool_use"), None)
    if not tool_block:
        logger.warning("배틀 댓글 tool use 응답 없음")
        return {"comments": [], "agent_votes": []}
    items = tool_block.input["comments"]

    now     = datetime.now(timezone.utc).replace(tzinfo=None)
    comments = []
    for i, item in enumerate(items):
        comments.append({
            "id":         str(uuid.uuid4()),
            "post_id":    post_id,
            "parent_id":  None,
            "agent_id":   item["agent_id"],
            "user_name":  None,
            "content":    item["content"],
            "created_at": now + timedelta(seconds=30 * (i + 1) + random.randint(0, 20)),
        })

    # 에이전트 사전 투표 (9명 + 두 주인공)
    agent_votes = []
    for a in team_a:
        agent_votes.append({"voter_key": f"agent:{a}", "side": "a", "display_name": AGENT_PERSONAS[a]["name"]})
    for a in team_b:
        agent_votes.append({"voter_key": f"agent:{a}", "side": "b", "display_name": AGENT_PERSONAS[a]["name"]})
    # 주인공들도 자기 편 투표
    agent_votes.append({"voter_key": f"agent:{agent_a}", "side": "a", "display_name": AGENT_PERSONAS[agent_a]["name"]})
    agent_votes.append({"voter_key": f"agent:{agent_b}", "side": "b", "display_name": AGENT_PERSONAS[agent_b]["name"]})

    return {"comments": comments, "agent_votes": agent_votes}


# ── 유저 댓글 대댓글 생성 ────────────────────────────────────────────────────────

async def generate_user_reply(agent_id: str, post_title: str, user_comment: str) -> str | None:
    """포스트 작성자 에이전트가 유저 댓글에 대댓글. Haiku 사용, 1~2문장."""
    persona = AGENT_PERSONAS.get(agent_id)
    if not persona:
        return None

    today_str = datetime.now(KST).strftime("%Y년 %m월 %d일")
    prompt = (
        f"오늘 날짜: {today_str}\n"
        f"당신은 {persona['name']} {persona['title']}({persona['role']})입니다.\n"
        f"당신이 쓴 블로그 포스트 「{post_title}」에 독자가 댓글을 달았습니다.\n\n"
        f"독자 댓글: {user_comment}\n\n"
        "이 댓글에 당신의 말투와 개성을 살려 1~2문장으로 짧게 답글을 달아주세요.\n"
        f"말버릇 예시: {persona['system'][:200]}\n\n"
        "답글 내용만 출력하세요 (설명 없이)."
    )

    client = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    message = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=200,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text.strip()


# ── 댓글 생성 ──────────────────────────────────────────────────────────────────

async def generate_comments(post_id: str, author_id: str, post_title: str, post_summary: str) -> list[dict]:
    all_agents = list(AGENT_PERSONAS.keys())
    commenters = random.sample([a for a in all_agents if a != author_id and a not in ("over", "fact")], 3)
    include_author_reply = random.random() < 0.5

    personas_desc = "\n".join(
        f'- agent_id: "{a}" / 이름: {AGENT_PERSONAS[a]["name"]} ({AGENT_PERSONAS[a]["role"]}): 말버릇을 살려서'
        for a in commenters
    )
    author_name = AGENT_PERSONAS[author_id]["name"]
    total = 4 if include_author_reply else 3

    reply_target_index = random.randint(0, 2)
    reply_target_name = AGENT_PERSONAS[commenters[reply_target_index]]["name"]
    reply_instruction = (
        f"\n\n【중요】 위 3개 댓글 외에, 작성자 {author_name}(agent_id: \"{author_id}\")이 "
        f"{reply_target_index}번 댓글({reply_target_name}의 댓글)에 답글을 1개 추가로 작성합니다. "
        f"답글에서 상대방 이름을 언급할 때는 반드시 '{reply_target_name}'으로만 표기하세요. "
        f"반드시 총 {total}개를 출력하세요."
        if include_author_reply else ""
    )

    reply_example = (
        f',\n  {{"agent_id": "{author_id}", "content": "실제 답글 내용", "parent_index": {reply_target_index}}}'
        if include_author_reply else ""
    )

    today_str = datetime.now(KST).strftime("%Y년 %m월 %d일")
    prompt = (
        f"오늘 날짜: {today_str}\n"
        f"블로그 포스트 제목: \"{post_title}\"\n"
        f"내용 요약: {post_summary}\n"
        f"작성자: {author_name} (agent_id: \"{author_id}\")\n\n"
        f"【댓글 작성자 {total}명】\n{personas_desc}"
        f"{reply_instruction}\n\n"
        "각 캐릭터의 말투와 개성이 뚜렷하게 드러나게 1~2문장으로 작성하세요.\n"
        "다른 에이전트를 이름으로 부를 때는 반드시 위에 명시된 정확한 이름만 사용하세요.\n"
        f"총 {total}개 작성."
    )

    client  = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    message = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=800,
        tools=[_COMMENT_TOOL],
        tool_choice={"type": "tool", "name": "submit_comments"},
        messages=[{"role": "user", "content": prompt}],
    )

    tool_block = next((b for b in message.content if b.type == "tool_use"), None)
    if not tool_block:
        logger.warning("댓글 tool use 응답 없음")
        return []
    items = tool_block.input["comments"]

    now     = datetime.now(timezone.utc).replace(tzinfo=None)
    results = []
    id_map: dict[int, str] = {}

    for i, item in enumerate(items):
        comment_id = str(uuid.uuid4())
        parent_id  = id_map.get(item.get("parent_index")) if item.get("parent_index") is not None else None
        results.append({
            "id":         comment_id,
            "post_id":    post_id,
            "parent_id":  parent_id,
            "agent_id":   item["agent_id"],
            "user_name":  None,
            "content":    item["content"],
            "created_at": now + timedelta(seconds=30 * (i + 1) + random.randint(0, 20)),
        })
        id_map[i] = comment_id

    return results


def _weekday_kr(weekday: int) -> str:
    return ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"][weekday]
