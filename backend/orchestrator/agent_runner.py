import asyncio
import json
import os
import shutil
from pathlib import Path
from typing import Callable, Awaitable

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


def _run_agent_sync(
    prompt: str,
    args: list[str],
    cwd: str,
) -> tuple[str, str]:
    """동기 방식으로 claude.exe 실행 — 스레드풀에서 호출됨."""
    import subprocess
    proc = subprocess.Popen(
        args,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd=cwd,
    )
    stdout_bytes, _ = proc.communicate(input=prompt.encode("utf-8"))
    return stdout_bytes.decode("utf-8", errors="replace")


def _parse_output(raw: str) -> tuple[str, str]:
    """stdout JSON 스트림에서 최종 결과와 스트림 텍스트 추출."""
    final_result = ""
    last_text = ""
    stream_chunks: list[str] = []

    for line in raw.split("\n"):
        line = line.strip()
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
                        stream_chunks.append(delta.get("text", ""))

            elif etype == "assistant":
                for block in event.get("message", {}).get("content", []):
                    if block.get("type") == "text":
                        last_text = block.get("text", "")
                    elif block.get("type") == "tool_use":
                        tool_line = format_tool_use(block.get("name", ""), block.get("input", {}))
                        if tool_line:
                            stream_chunks.append(tool_line)
        except Exception:
            pass

    return final_result or last_text, "".join(stream_chunks)


async def run_agent(
    prompt: str,
    allowed_tools: list[str] | None = None,
    no_tools: bool = False,
    add_dirs: list[str] | None = None,
    cwd: str | None = None,
    max_turns: int | None = None,
    on_progress: Callable[[str], Awaitable[None]] | None = None,
    on_thinking: Callable[[str], Awaitable[None]] | None = None,
) -> str:
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

    # 스레드풀에서 동기 subprocess 실행 (Windows asyncio 호환)
    raw = await asyncio.to_thread(_run_agent_sync, prompt, args, work_dir)
    result, stream_text = _parse_output(raw)
    return result


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
