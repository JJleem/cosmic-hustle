import os
import re
import uuid
import json
import random
import asyncio
import logging
from pathlib import Path
from datetime import date, datetime, timedelta

import anthropic
import httpx

logger = logging.getLogger(__name__)

_CHAR_DIR = Path(__file__).parent.parent / "web" / "public" / "id"

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
        "appearance": "an orange-skinned cartoon girl with two round fluffy orange pom-pom buns, freckles, wearing an orange blazer suit, holding a glowing smartphone with social media icons floating around",
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
        "appearance": "a girl with dark hair and slightly pointed elf ears, wearing a dark apron splattered with colorful paint, blue jeans, surrounded by floating color swatches and design UI panels",
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
디자인과 문화를 함께 봅니다. 패키지 디자인, 앱 UI, 거리의 간판, 영화 포스터 — 모두 이야기가 있습니다.""",
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
        "appearance": "a tall elegant grey-skinned alien woman with silver hair in a neat updo bun, wearing a grey business blazer and skirt, holding a holographic translucent tablet, sophisticated posture",
        "system": """당신은 Cosmic Hustle의 위키 대리, 사서입니다.

【성격·말투】
- 지식의 연결고리를 찾는 것이 삶의 기쁨입니다
- "이 주제의 역사부터 짚어드릴게요."를 최소 2회 사용하세요
- 체계적이고 친절합니다. 복잡한 개념을 쉽게 풀어줍니다
- "사실 이 단어의 어원은..."처럼 뜻밖의 배경 지식을 자주 꺼냅니다
- 모든 것이 연결되어 있다는 시각으로 씁니다

【글 구조】
1. "이번 주 키워드는 [___]입니다" — 선명한 주제 선언
2. 어원·역사·배경 — "사실 이게 어디서 왔는지 아세요?"
3. 현재의 의미와 왜 지금 화제가 됐는지
4. 앞으로 이 키워드가 어떻게 발전할지 전망하며 마무리

【주제 접근법】
이번 주 가장 화제가 된 단어 하나를 잡아서 360도로 해부합니다. 표면적인 정의를 넘어 역사와 맥락을 제공합니다.""",
    },

    # 게스트 에이전트 (월 1회 특별 칼럼)
    "plan": {
        "name": "플랜", "title": "차장", "role": "PM",
        "appearance": "a golden-yellow skinned boy with messy golden hair and large black-rimmed glasses, wearing a grey blazer over a navy turtleneck and bright yellow pants, holding a holographic notebook",
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
        "appearance": "a blue-skinned young character with black messy hair and black headphones around neck, wearing a dark hoodie and dark pants, holding a glowing holographic code terminal, bored half-lidded expression",
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
        "appearance": "a grey metallic humanoid with a completely flat featureless mask face, wearing a white dress shirt and black trousers, arms crossed, holding a red pen, utterly emotionless",
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
        "appearance": "a robot character in a full dark navy space suit with green neon accent lights, helmet with glowing rectangular pixel eyes, small robotic antennae on helmet, holding a holographic control panel",
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


def get_today_agent() -> tuple[str, str]:
    sched = DAY_SCHEDULE[date.today().weekday()]
    return sched["agent_id"], sched["theme"]


def _make_slug(agent_id: str, post_date: date) -> str:
    return f"{agent_id}-{post_date.isoformat()}"


def _fal_available() -> bool:
    return bool(os.environ.get("FAL_KEY"))


async def _upload_character(agent_id: str) -> str | None:
    # 배경 제거된 버전 우선 사용 (카드 프레임 없음 → img2img 품질 향상)
    bg_removed = _CHAR_DIR / f"'{agent_id}'의 배경이 제거됨.png"
    char_path  = bg_removed if bg_removed.exists() else _CHAR_DIR / f"{agent_id}.png"
    if not char_path.exists():
        return None
    try:
        import fal_client
        return await asyncio.to_thread(fal_client.upload_file, str(char_path))
    except Exception as e:
        logger.warning(f"캐릭터 업로드 실패: {e}")
        return None


async def _generate_thumbnail(agent_id: str, scene_prompt: str) -> str | None:
    if not _fal_available():
        return None

    persona  = AGENT_PERSONAS[agent_id]
    char_url = await _upload_character(agent_id)
    if not char_url:
        logger.warning(f"캐릭터 이미지 업로드 실패 ({agent_id}), 썸네일 생성 건너뜀")
        return None

    full_prompt = (
        f"{persona['appearance']}, {scene_prompt}, "
        "Pixar 3D animation style, cinematic soft lighting, vibrant saturated colors, "
        "expressive cartoon character, smooth polished 3D render, "
        "high quality animation still frame, no text, no watermark"
    )

    try:
        import fal_client
        result = await asyncio.to_thread(
            fal_client.subscribe,
            "fal-ai/flux/dev/image-to-image",
            arguments={
                "image_url": char_url,
                "prompt": full_prompt,
                "strength": 0.85,
                "num_inference_steps": 30,
                "guidance_scale": 7.5,
                "image_size": "landscape_4_3",
            },
        )
        return result["images"][0]["url"]
    except Exception as e:
        logger.warning(f"썸네일 생성 실패: {e}")
        return None


async def _generate_content_image(prompt: str) -> str | None:
    if not _fal_available():
        return None
    try:
        import fal_client
        result = await asyncio.to_thread(
            fal_client.subscribe,
            "fal-ai/flux/dev",
            arguments={
                "prompt": (
                    f"Minimalist illustration for a Korean tech blog. {prompt} "
                    "Soft pastel colors, clean layout, no text, high quality."
                ),
                "num_inference_steps": 28,
                "guidance_scale": 7.5,
                "image_size": "square_hd",
            },
        )
        return result["images"][0]["url"]
    except Exception as e:
        logger.warning(f"본문 이미지 생성 실패: {e}")
        return None


async def _process_content_images(content: str) -> str:
    matches = _IMAGE_RE.findall(content)
    for prompt in matches[:3]:
        url    = await _generate_content_image(prompt)
        marker = f"{{{{IMAGE: {prompt}}}}}"
        content = content.replace(marker, f"\n![이미지]({url})\n" if url else "", 1)
    return content


# ── 포스트 생성 ────────────────────────────────────────────────────────────────

async def generate_blog_post(agent_id: str | None = None) -> dict:
    today = date.today()

    if agent_id is None:
        agent_id, theme = get_today_agent()
    else:
        theme = "자유 주제 (게스트 칼럼)"

    persona = AGENT_PERSONAS[agent_id]

    # 최신 트렌드 수집 (Tavily)
    trending_context = await _fetch_trending(agent_id)

    client      = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    system_text = persona["system"] + """

【공통 작성 규칙】
- 반드시 한국어로 작성
- 2,000자 내외
- 마크다운 형식, 첫 줄은 반드시 # 제목
- 딱딱하고 어려운 글보다 가볍고 재미있게
- 글 맨 앞 첫 줄에 반드시 썸네일 태그 삽입:
  {{THUMBNAIL: 당신이 등장하는 장면을 영어로 묘사. 주제와 어울리는 상황·소품·포즈}}
- 본문 중간 이미지가 필요한 곳에 (1~3개, 선택적):
  {{IMAGE: 삽입할 이미지 설명 (영어, 캐릭터 없는 주제 관련 일러스트)}}"""

    user_content = (
        f"오늘({today.strftime('%Y년 %m월 %d일')}, {_weekday_kr(today.weekday())}) 주제: **{theme}**\n"
    )
    if trending_context:
        user_content += f"\n【오늘의 최신 트렌드 참고자료】\n{trending_context}\n\n위 자료를 참고하되, 당신만의 시각과 말투로 블로그 포스트를 작성하세요."
    else:
        user_content += "\n당신의 관점에서 가장 흥미로운 내용을 골라 블로그 포스트를 작성해주세요."

    user_content += "\n\n{{THUMBNAIL: ...}} 태그를 맨 앞에 쓰고, 그 다음 줄부터 포스트를 작성하세요."

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2500,
        system=[{"type": "text", "text": system_text, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": user_content}],
    )

    raw     = message.content[0].text.strip()
    thumb_m = _THUMBNAIL_RE.search(raw)
    scene   = thumb_m.group(1).strip() if thumb_m else f"{persona['role']} working on {theme}"
    content = _THUMBNAIL_RE.sub("", raw).strip()

    content, thumbnail_url = await asyncio.gather(
        _process_content_images(content),
        _generate_thumbnail(agent_id, scene),
    )

    lines = content.split("\n")
    title = lines[0].lstrip("#").strip() if lines and lines[0].startswith("#") else f"{persona['name']}의 오늘의 생각"

    return {
        "id":            str(uuid.uuid4()),
        "agent_id":      agent_id,
        "title":         title,
        "slug":          _make_slug(agent_id, today),
        "content":       content,
        "thumbnail_url": thumbnail_url,
        "published":     True,
        "trending_topic": theme,
        "published_at":  datetime.utcnow(),
    }


# ── 댓글 생성 ──────────────────────────────────────────────────────────────────

async def generate_comments(post_id: str, author_id: str, post_title: str, post_summary: str) -> list[dict]:
    all_agents = list(AGENT_PERSONAS.keys())
    commenters = random.sample([a for a in all_agents if a != author_id], 3)
    include_author_reply = random.random() < 0.5

    personas_desc = "\n".join(
        f"- {AGENT_PERSONAS[a]['name']} ({AGENT_PERSONAS[a]['role']}): 말버릇을 살려서"
        for a in commenters
    )
    author_name = AGENT_PERSONAS[author_id]["name"]

    prompt = (
        f"블로그 포스트 제목: \"{post_title}\"\n"
        f"내용 요약: {post_summary}\n"
        f"작성자: {author_name}\n\n"
        f"아래 3명이 댓글을 달아주세요:\n{personas_desc}\n"
        + (f"\n작성자 {author_name}도 댓글 하나에 답글을 답니다.\n" if include_author_reply else "")
        + "\n각 캐릭터의 말투와 개성이 뚜렷하게 드러나게 1~2문장으로 작성하세요."
        "\n\n반드시 아래 JSON 배열 형식으로만 응답 (다른 텍스트 없이):\n"
        "[\n"
        '  {"agent_id": "...", "content": "...", "parent_index": null},\n'
        '  {"agent_id": "...", "content": "...", "parent_index": null},\n'
        '  {"agent_id": "...", "content": "...", "parent_index": null}'
        + (',\n  {"agent_id": "' + author_id + '", "content": "...", "parent_index": 0}' if include_author_reply else "")
        + "\n]"
    )

    client  = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()
    try:
        items = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning(f"댓글 JSON 파싱 실패: {raw[:200]}")
        return []

    now     = datetime.utcnow()
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
            "created_at": now + timedelta(minutes=10 * (i + 1) + random.randint(0, 20)),
        })
        id_map[i] = comment_id

    return results


def _weekday_kr(weekday: int) -> str:
    return ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"][weekday]
