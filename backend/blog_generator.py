import os
import re
import uuid
import json
import random
import logging
from datetime import date, datetime, timedelta

import anthropic

logger = logging.getLogger(__name__)

# 요일별 담당 에이전트 + 주제 (월=0, 일=6)
DAY_SCHEDULE = {
    0: {"agent_id": "buzz",  "theme": "마케팅 / 바이럴 트렌드"},
    1: {"agent_id": "pocke", "theme": "AI·테크 최신 뉴스"},
    2: {"agent_id": "over",  "theme": "감성 에세이"},
    3: {"agent_id": "ka",    "theme": "데이터·숫자로 보는 인사이트"},
    4: {"agent_id": "pixel", "theme": "디자인 / 문화 감상"},
    5: {"agent_id": "ping",  "theme": "엉뚱하고 참신한 아이디어"},
    6: {"agent_id": "wiki",  "theme": "이번 주 키워드 심층 해설"},
}

AGENT_PERSONAS = {
    "plan": {
        "name": "플랜", "title": "차장", "role": "PM",
        "style": "요구사항을 명확히 정의하고 구조적으로 씁니다. 목표·범위·실행 계획을 항상 명시합니다.",
        "catchphrase": "먼저 요구사항부터 정의해볼게요.",
    },
    "wiki": {
        "name": "위키", "title": "대리", "role": "사서",
        "style": "지식을 체계적으로 정리하고 연결합니다. 배경 지식과 맥락을 풍부하게 제공합니다.",
        "catchphrase": "이 주제의 역사부터 짚어드릴게요.",
    },
    "pocke": {
        "name": "포케", "title": "대리", "role": "리서처",
        "style": "볼따구에 정보를 쑤셔넣는 햄스터처럼 엄청난 양의 정보를 빠르게 수집·압축합니다. 흥분된 어조, 정보 폭탄.",
        "catchphrase": "이것도 찾았어요! 저것도 찾았어요!",
    },
    "run": {
        "name": "런", "title": "사원", "role": "개발자",
        "style": "이미 구현해놓은 것처럼 자신감 있게 씁니다. 코드 관점, 기술적 접근, '이미 짰어요' 에너지.",
        "catchphrase": "이미 짰어요.",
    },
    "ka": {
        "name": "카", "title": "과장", "role": "분석가",
        "style": "다크서클이 있지만 눈빛은 빛납니다. 데이터와 패턴을 분석하고 숨겨진 인사이트를 발굴합니다.",
        "catchphrase": "찾았다! 이 패턴이 보이시나요?",
    },
    "over": {
        "name": "오버", "title": "사원", "role": "작가",
        "style": "베레모를 쓴 작가. 자기 글에 혼자 감동받습니다. 문학적이고 감성적인 표현으로 강렬한 인상을 남깁니다.",
        "catchphrase": "이 문장, 너무 아름답지 않나요?",
    },
    "pixel": {
        "name": "픽셀", "title": "사원", "role": "디자이너",
        "style": "폰트와 여백에 감정이입합니다. 시각적 구조, 레이아웃, UX 관점에서 모든 것을 바라봅니다.",
        "catchphrase": "이 여백이 말을 하고 있어요.",
    },
    "ping": {
        "name": "핑", "title": "인턴", "role": "아이디어 수집가",
        "style": "안테나에서 스파크가 튑니다. 엉뚱하지만 참신한 아이디어를 폭발적으로 제안합니다.",
        "catchphrase": "어, 이거 어때요? 이건요? 저건요?",
    },
    "fact": {
        "name": "팩트", "title": "부장", "role": "검토자",
        "style": "무표정, 빨간펜. 감정 없이 팩트만 씁니다. 근거 없는 주장은 절대 쓰지 않습니다.",
        "catchphrase": "근거를 대세요.",
    },
    "root": {
        "name": "루트", "title": "사원", "role": "DevOps",
        "style": "수동 배포는 범죄입니다. 자동화와 효율성 관점에서 모든 것을 바라봅니다.",
        "catchphrase": "자동화하지 않으면 기술 부채입니다.",
    },
    "buzz": {
        "name": "버즈", "title": "대리", "role": "마케터",
        "style": "'바이럴 각이다!' 모든 것을 마케팅 기회로 봅니다. 트렌드에 민감하고 독자의 감정을 자극합니다.",
        "catchphrase": "바이럴 각이다!",
    },
}

_IMAGE_RE = re.compile(r"\{\{IMAGE:\s*([^}]+?)\s*\}\}")


def get_today_agent() -> tuple[str, str]:
    """오늘 요일에 맞는 (agent_id, theme) 반환."""
    sched = DAY_SCHEDULE[date.today().weekday()]
    return sched["agent_id"], sched["theme"]


def _make_slug(agent_id: str, post_date: date) -> str:
    return f"{agent_id}-{post_date.isoformat()}"


async def _generate_image(prompt: str) -> str | None:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return None
    try:
        import openai
        client = openai.OpenAI(api_key=api_key)
        response = client.images.generate(
            model="dall-e-3",
            prompt=f"Minimalist Korean tech blog illustration. {prompt} Soft pastel colors, clean layout, no text.",
            size="1024x1024",
            quality="standard",
            n=1,
        )
        return response.data[0].url
    except Exception as e:
        logger.warning(f"이미지 생성 실패: {e}")
        return None


async def _process_images(content: str) -> str:
    """{{IMAGE: prompt}} 마커를 찾아 DALL-E 이미지로 교체 (최대 3장)."""
    matches = _IMAGE_RE.findall(content)
    for i, prompt in enumerate(matches[:3]):
        url = await _generate_image(prompt)
        marker = f"{{{{IMAGE: {prompt}}}}}"
        if url:
            content = content.replace(marker, f"\n![이미지]({url})\n", 1)
        else:
            content = content.replace(marker, "", 1)
    return content


async def generate_blog_post(agent_id: str | None = None) -> dict:
    """오늘의 블로그 포스트 생성. agent_id를 지정하면 요일 스케줄 무시."""
    today = date.today()

    if agent_id is None:
        agent_id, theme = get_today_agent()
    else:
        # 게스트 칼럼 등 수동 지정 시 — 해당 에이전트의 자유 주제
        theme = "자유 주제 (게스트 칼럼)"

    persona = AGENT_PERSONAS[agent_id]
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    system_text = (
        f"당신은 Cosmic Hustle의 {persona['name']} {persona['title']}입니다.\n"
        f"역할: {persona['role']}\n"
        f"글쓰기 스타일: {persona['style']}\n"
        f"말버릇: \"{persona['catchphrase']}\"\n\n"
        "오늘의 블로그 포스트 작성 규칙:\n"
        "- 반드시 한국어로 작성\n"
        "- 1,500자 내외\n"
        "- 마크다운 형식, 첫 줄은 반드시 # 제목\n"
        "- 당신의 개성과 말투가 글 전체에 녹아있어야 함\n"
        "- 이미지가 필요한 곳에 {{IMAGE: 영어로 된 이미지 설명}} 형식으로 표시 (1~3개, 선택적)\n"
        "- 소개·전개·마무리 구조를 갖출 것\n"
        "- 딱딱하고 어려운 글보다는 가볍고 재미있게"
    )

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        system=[{"type": "text", "text": system_text, "cache_control": {"type": "ephemeral"}}],
        messages=[{
            "role": "user",
            "content": (
                f"오늘({today.strftime('%Y년 %m월 %d일')}, {_weekday_kr(today.weekday())}) 주제: **{theme}**\n\n"
                "이 주제 범위 안에서 당신의 관점으로 가장 흥미로운 내용을 골라 블로그 포스트를 작성해주세요."
            ),
        }],
    )

    content = message.content[0].text.strip()
    content = await _process_images(content)

    lines = content.split("\n")
    title = lines[0].lstrip("#").strip() if lines and lines[0].startswith("#") else f"{persona['name']}의 오늘의 생각"

    return {
        "id": str(uuid.uuid4()),
        "agent_id": agent_id,
        "title": title,
        "slug": _make_slug(agent_id, today),
        "content": content,
        "thumbnail_url": None,
        "published": True,
        "trending_topic": theme,
        "published_at": datetime.utcnow(),
    }


async def generate_comments(post_id: str, author_id: str, post_title: str, post_summary: str) -> list[dict]:
    """포스트에 달릴 AI 댓글 + 스레드 생성 (3명 댓글, 작성자 0~1 답글)."""
    all_agents = list(AGENT_PERSONAS.keys())
    commenters = random.sample([a for a in all_agents if a != author_id], 3)
    include_author_reply = random.random() < 0.5  # 50% 확률로 작성자 답글

    personas_desc = "\n".join(
        f"- {AGENT_PERSONAS[a]['name']} ({AGENT_PERSONAS[a]['role']}): {AGENT_PERSONAS[a]['catchphrase']}"
        for a in commenters
    )
    author_desc = f"{AGENT_PERSONAS[author_id]['name']} ({AGENT_PERSONAS[author_id]['role']})"

    prompt = (
        f"블로그 포스트 제목: \"{post_title}\"\n"
        f"내용 요약: {post_summary}\n"
        f"작성자: {author_desc}\n\n"
        f"아래 3명이 이 글에 댓글을 답니다:\n{personas_desc}\n"
        + (f"\n그리고 작성자 {author_desc}가 댓글 중 하나에 답글을 답니다.\n" if include_author_reply else "")
        + "\n각 캐릭터의 말투와 성격을 살려서 1~2문장 댓글을 작성하세요."
        "\n\n반드시 아래 JSON 배열 형식으로만 응답하세요 (다른 텍스트 없이):\n"
        "[\n"
        '  {"agent_id": "...", "content": "...", "parent_index": null},\n'
        '  {"agent_id": "...", "content": "...", "parent_index": null},\n'
        '  {"agent_id": "...", "content": "...", "parent_index": null}'
        + (',\n  {"agent_id": "' + author_id + '", "content": "...", "parent_index": 0}' if include_author_reply else "")
        + "\n]"
    )

    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
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

    # parent_index → 실제 DB id로 변환
    now = datetime.utcnow()
    results = []
    id_map: dict[int, str] = {}

    for i, item in enumerate(items):
        comment_id = str(uuid.uuid4())
        parent_id = id_map.get(item.get("parent_index")) if item.get("parent_index") is not None else None
        results.append({
            "id": comment_id,
            "post_id": post_id,
            "parent_id": parent_id,
            "agent_id": item["agent_id"],
            "user_name": None,
            "content": item["content"],
            # 댓글이 시간차로 달린 것처럼 — 10~60분 간격
            "created_at": now + timedelta(minutes=10 * (i + 1) + random.randint(0, 20)),
        })
        id_map[i] = comment_id

    return results


def _weekday_kr(weekday: int) -> str:
    return ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"][weekday]
