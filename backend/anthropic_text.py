"""Anthropic 응답에서 본문 텍스트만 뽑는다.

Sonnet 5부터는 `thinking` 파라미터를 넘기지 않아도 adaptive thinking이 기본으로 켜져,
`content[0]`이 TextBlock이 아니라 ThinkingBlock인 경우가 있다. ThinkingBlock에는
`.text`가 없어(`.thinking`만 있음) `content[0].text`는 AttributeError로 터진다.
블록을 순회해 text 타입만 이어 붙이면 모델·thinking 설정과 무관하게 안전하다.
"""


def text_of(message) -> str:
    """응답의 모든 text 블록을 이어 붙여 반환한다. text 블록이 없으면 빈 문자열."""
    return "".join(
        b.text for b in message.content if getattr(b, "type", "") == "text"
    ).strip()
