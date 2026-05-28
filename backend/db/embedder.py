import re
from sentence_transformers import SentenceTransformer

_model: SentenceTransformer | None = None


def get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer("jhgan/ko-sroberta-multitask")
    return _model


def _clean_for_embedding(text: str) -> str:
    """마크다운 구조(frontmatter/헤더/표/글머리)를 제거하고 순수 텍스트만 반환."""
    # YAML frontmatter 제거
    text = re.sub(r"^---\n.*?\n---\n?", "", text, flags=re.DOTALL)
    # 마크다운 헤더 제거
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)
    # 표(|) 행 제거
    text = re.sub(r"^\|.*\|$", "", text, flags=re.MULTILINE)
    # 글머리 기호 제거 (·, -, *, >)
    text = re.sub(r"^[·\-\*>\s]+", "", text, flags=re.MULTILINE)
    # 볼드/이탤릭 마커 제거
    text = re.sub(r"\*{1,2}(.+?)\*{1,2}", r"\1", text)
    # 인라인 코드 제거
    text = re.sub(r"`[^`]+`", "", text)
    # 마크다운 링크 → 텍스트만
    text = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", text)
    # 빈 줄 정리
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def embed(text: str) -> list[float]:
    return get_model().encode(_clean_for_embedding(text), convert_to_numpy=True).tolist()
