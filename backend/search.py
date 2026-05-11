import asyncio
import os
import httpx


def _api_key() -> str:
    return os.getenv("TAVILY_API_KEY", "")


async def tavily_search(query: str, max_results: int = 5) -> list[dict]:
    """Call Tavily search API. Returns list of {title, url, content, score} dicts."""
    api_key = _api_key()
    if not api_key:
        return []
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.tavily.com/search",
            json={
                "api_key": api_key,
                "query": query,
                "max_results": max_results,
                "include_answer": False,
                "include_raw_content": False,
                "include_images": False,
            },
        )
        resp.raise_for_status()
        return resp.json().get("results", [])


async def search_topic(topic: str, keywords: list[str] | None = None) -> list[dict]:
    """Run 3 parallel searches and deduplicate by URL."""
    queries = [topic]
    if keywords:
        kw = " ".join(keywords[:3])
        queries.append(f"{topic} {kw}")
    queries.append(f"{topic} 최신 동향 2024 2025")

    results_list = await asyncio.gather(
        *[tavily_search(q, max_results=5) for q in queries[:3]],
        return_exceptions=True,
    )

    seen: set[str] = set()
    merged: list[dict] = []
    for batch in results_list:
        if isinstance(batch, Exception):
            continue
        for r in batch:
            url = r.get("url", "")
            if url and url not in seen:
                seen.add(url)
                merged.append(r)

    return merged[:12]


def format_search_results(results: list[dict]) -> str:
    """Format Tavily results into a text block for the pocke prompt."""
    if not results:
        return "(검색 결과 없음)"
    lines = []
    for r in results:
        title = r.get("title", "제목 없음")
        url = r.get("url", "")
        content = r.get("content", "").strip()[:400]
        lines.append(f"[{title}]\nURL: {url}\n{content}\n")
    return "\n---\n".join(lines)
