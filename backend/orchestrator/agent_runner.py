import asyncio
import json
import os
import shutil
import sys
from pathlib import Path
from typing import Callable


def find_claude() -> str:
    backend_dir = Path(__file__).parent.parent
    web_dir = backend_dir.parent / "web"
    nm = web_dir / "node_modules"

    if sys.platform == "win32":
        candidates = [
            nm / "@anthropic-ai" / "claude-code-win32-x64" / "claude.exe",
            nm / "@anthropic-ai" / "claude-code" / "bin" / "claude.exe",
            nm / ".bin" / "claude.exe",
        ]
        fallback = shutil.which("claude.exe") or shutil.which("claude") or "claude.exe"
    else:
        candidates = [
            nm / ".bin" / "claude",
            nm / "@anthropic-ai" / "claude-code" / "bin" / "claude",
            nm / "@anthropic-ai" / "claude-code-darwin-arm64" / "bin" / "claude",
            nm / "@anthropic-ai" / "claude-code-darwin-x64" / "bin" / "claude",
            nm / "@anthropic-ai" / "claude-code-linux-x64" / "bin" / "claude",
        ]
        fallback = shutil.which("claude") or "claude"

    for p in candidates:
        if p.exists():
            return str(p)
    return fallback


CLAUDE_BIN = find_claude()
WIKI_DIR = str(Path(__file__).parent.parent.parent / "wiki-llm")

print(f"[agent_runner] claude binary: {CLAUDE_BIN}")


def format_tool_use(name: str, input_data: dict) -> str:
    mapping = {
        "WebSearch": lambda i: f"\n🔍 검색: \"{i.get('query', '')}\"\n",
        "WebFetch": lambda i: f"\n🌐 페이지 읽는 중: {i.get('url', '')}\n",
        "Read": lambda i: f"\n📖 파일 읽는 중: {i.get('file_path', '')}\n",
        "Write": lambda i: f"\n✏️ 파일 작성: {i.get('file_path', '')}\n",
        "Grep": lambda i: f"\n🔎 검색: \"{i.get('pattern', '')}\"\n",
        "Glob": lambda i: f"\n📂 파일 탐색: {i.get('pattern', '')}\n",
    }
    fn = mapping.get(name)
    return fn(input_data) if fn else f"\n⚙️ {name}\n"


async def _drain_stderr(proc) -> None:
    """stderr 버퍼를 비워 subprocess 블로킹 방지."""
    if proc.stderr:
        try:
            await proc.stderr.read()
        except Exception:
            pass


async def run_agent(
    prompt: str,
    allowed_tools: list[str] | None = None,
    no_tools: bool = False,
    add_dirs: list[str] | None = None,
    cwd: str | None = None,
    max_turns: int | None = None,
    on_stream: Callable[[str], None] | None = None,
    should_stop: Callable[[], bool] | None = None,
) -> tuple[str, str]:
    """Claude CLI를 asyncio 서브프로세스로 실행. stdout을 실시간 라인 단위로 읽어 on_stream 호출.
    should_stop()이 True를 반환하면 subprocess를 즉시 kill하고 지금까지 받은 결과를 반환."""
    args = [
        CLAUDE_BIN, "-p",
        "--verbose",
        "--output-format", "stream-json",
        "--include-partial-messages",
        "--dangerously-skip-permissions",
    ]
    if max_turns is not None:
        args += ["--max-turns", str(max_turns)]
    if no_tools:
        args += ["--tools", ""]
    elif allowed_tools:
        args += ["--allowedTools", ",".join(allowed_tools)]
    for d in (add_dirs or []):
        if os.path.exists(d):
            args += ["--add-dir", d]

    work_dir = cwd or str(Path(__file__).parent.parent)

    proc = await asyncio.create_subprocess_exec(
        *args,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=work_dir,
    )

    assert proc.stdin is not None
    proc.stdin.write(prompt.encode("utf-8"))
    await proc.stdin.drain()
    proc.stdin.close()

    final_result = ""
    last_text = ""
    stream_chunks: list[str] = []

    assert proc.stdout is not None
    try:
        async with asyncio.timeout(600):
            async for raw_line in proc.stdout:
                line = raw_line.decode("utf-8", errors="replace").strip()
                if not line:
                    continue
                try:
                    event = json.loads(line)
                    etype = event.get("type")

                    if etype == "result":
                        r = event.get("result", "") or ""
                        if r:
                            final_result = r

                    elif etype == "stream_event":
                        se = event.get("event", {})
                        if se.get("type") == "content_block_delta":
                            delta = se.get("delta", {})
                            if delta.get("type") == "text_delta":
                                chunk = delta.get("text", "")
                                if chunk:
                                    stream_chunks.append(chunk)
                                    if on_stream:
                                        on_stream(chunk)

                    elif etype == "assistant":
                        # 한 메시지 내 텍스트 블록 전부 합산 (마지막 블록만 유지하면 중간 JSON 유실)
                        texts = [
                            b.get("text", "")
                            for b in event.get("message", {}).get("content", [])
                            if b.get("type") == "text"
                        ]
                        combined = "\n".join(t for t in texts if t)
                        if combined:
                            last_text = combined
                        for block in event.get("message", {}).get("content", []):
                            if block.get("type") == "tool_use":
                                tool_line = format_tool_use(block.get("name", ""), block.get("input", {}))
                                if tool_line:
                                    stream_chunks.append(tool_line)
                                    if on_stream:
                                        on_stream(tool_line)
                except Exception:
                    pass

                if should_stop and should_stop():
                    proc.kill()
                    break
    except TimeoutError:
        proc.kill()

    await asyncio.gather(proc.wait(), _drain_stderr(proc))
    # stream_chunks는 tool-use 에이전트의 신뢰할 수 있는 fallback
    return final_result or last_text or "".join(stream_chunks), "".join(stream_chunks)


def parse_json(text: str, fallback):
    import re
    # 마지막 ```json 코드블록 우선
    blocks = list(re.finditer(r"```(?:json)?\s*([\s\S]*?)```", text))
    if blocks:
        try:
            return json.loads(blocks[-1].group(1).strip())
        except Exception:
            pass
    # 마지막 { 위치부터 시도
    last_brace = text.rfind("{")
    if last_brace != -1:
        try:
            return json.loads(text[last_brace:])
        except Exception:
            pass
    # greedy {…} 추출
    match = re.search(r"(\{[\s\S]*\})", text)
    try:
        return json.loads(match.group(1) if match else text)
    except Exception:
        return fallback
