import asyncio
import json
import os
import shutil
from pathlib import Path
from typing import Callable

# claude.exe 위치 찾기 — web/node_modules 안에 있음
def find_claude() -> str:
    backend_dir = Path(__file__).parent.parent
    web_dir = backend_dir.parent / "web"

    candidates = [
        web_dir / "node_modules" / "@anthropic-ai" / "claude-code-win32-x64" / "claude.exe",
        web_dir / "node_modules" / "@anthropic-ai" / "claude-code" / "bin" / "claude.exe",
        web_dir / "node_modules" / ".bin" / "claude.exe",
    ]
    for p in candidates:
        if p.exists():
            return str(p)

    found = shutil.which("claude") or shutil.which("claude.exe")
    return found or "claude"

CLAUDE_BIN = find_claude()
WIKI_DIR = str(Path(__file__).parent.parent.parent / "wiki-llm")

print(f"[agent_runner] claude binary: {CLAUDE_BIN}")


def format_tool_use(name: str, input_data: dict) -> str:
    mapping = {
        "WebSearch": lambda i: f"\n🔍 검색: \"{i.get('query', '')}\"\n",
        "WebFetch":  lambda i: f"\n🌐 페이지 읽는 중: {i.get('url', '')}\n",
        "Read":      lambda i: f"\n📖 파일 읽는 중: {i.get('file_path', '')}\n",
        "Write":     lambda i: f"\n✏️ 파일 작성: {i.get('file_path', '')}\n",
        "Grep":      lambda i: f"\n🔎 검색: \"{i.get('pattern', '')}\"\n",
        "Glob":      lambda i: f"\n📂 파일 탐색: {i.get('pattern', '')}\n",
    }
    fn = mapping.get(name)
    return fn(input_data) if fn else f"\n⚙️ {name}\n"


async def run_agent(
    prompt: str,
    allowed_tools: list[str] | None = None,
    no_tools: bool = False,
    add_dirs: list[str] | None = None,
    cwd: str | None = None,
    max_turns: int | None = None,
    on_stream: Callable[[str], None] | None = None,
) -> tuple[str, str]:
    """Claude CLI를 asyncio 서브프로세스로 실행. stdout을 실시간 라인 단위로 읽어 on_stream 호출."""
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
    async for raw_line in proc.stdout:
        line = raw_line.decode("utf-8", errors="replace").strip()
        if not line:
            continue
        try:
            event = json.loads(line)
            etype = event.get("type")

            if etype == "result" and event.get("subtype") == "success":
                final_result = event.get("result", "")

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
                for block in event.get("message", {}).get("content", []):
                    if block.get("type") == "text":
                        last_text = block.get("text", "")
                    elif block.get("type") == "tool_use":
                        tool_line = format_tool_use(block.get("name", ""), block.get("input", {}))
                        if tool_line:
                            stream_chunks.append(tool_line)
                            if on_stream:
                                on_stream(tool_line)
        except Exception:
            pass

    await proc.wait()
    return final_result or last_text, "".join(stream_chunks)


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
