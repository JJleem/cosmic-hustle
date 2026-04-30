import { spawn, execSync } from "child_process";
import path from "path";
import fs from "fs";

function findClaude(): string {
  const isWindows = process.platform === "win32";
  const localBin = path.join(process.cwd(), "node_modules", ".bin", isWindows ? "claude.exe" : "claude");
  const pkgBin = path.join(
    process.cwd(), "node_modules", "@anthropic-ai", "claude-code", "bin",
    isWindows ? "claude.exe" : "claude",
  );
  const platformPkg = path.join(
    process.cwd(), "node_modules", "@anthropic-ai",
    `claude-code-${process.platform}-${process.arch}`,
    isWindows ? "claude.exe" : "claude",
  );
  for (const p of [pkgBin, platformPkg, localBin]) {
    if (fs.existsSync(p)) return p;
  }
  try {
    const lines = execSync(isWindows ? "where claude" : "which claude", { encoding: "utf8" })
      .trim().split("\n");
    const exe = isWindows ? lines.find((l) => l.trim().toLowerCase().endsWith(".exe")) : undefined;
    return (exe ?? lines[0]).trim();
  } catch {
    return isWindows ? "claude.exe" : "claude";
  }
}

export const CLAUDE_BIN = findClaude();
console.log("[findClaude]", CLAUDE_BIN, "| exists:", fs.existsSync(CLAUDE_BIN));

export const WIKI_DIR = path.resolve(process.cwd(), "../../wiki-llm");

// CEO 응답 대기 — 세션별 Promise resolver 저장
export const pendingResponses = new Map<string, (r: string) => void>();

// 취소된 세션 ID 집합
export const cancelledSessions = new Set<string>();

export type RunAgentOptions = {
  allowedTools?: string[];
  noTools?: boolean;
  addDirs?: string[];
  cwd?: string;
  maxTurns?: number;
};

function formatToolUse(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "WebSearch": return `\n🔍 검색: "${input.query ?? ""}"\n`;
    case "WebFetch":  return `\n🌐 페이지 읽는 중: ${input.url ?? ""}\n`;
    case "Read":      return `\n📖 파일 읽는 중: ${input.file_path ?? ""}\n`;
    case "Write":     return `\n✏️ 파일 작성: ${input.file_path ?? ""}\n`;
    case "Edit":      return `\n✂️ 파일 수정: ${input.file_path ?? ""}\n`;
    case "Grep":      return `\n🔎 검색: "${input.pattern ?? ""}"\n`;
    case "Glob":      return `\n📂 파일 탐색: ${input.pattern ?? ""}\n`;
    default:          return `\n⚙️ ${name}\n`;
  }
}

export async function runAgent(
  prompt: string,
  options: RunAgentOptions = {},
  onProgress?: (text: string) => void,
  onThinking?: (text: string) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      "-p",
      "--verbose",
      "--output-format", "stream-json",
      "--include-partial-messages",
      "--dangerously-skip-permissions",
    ];
    if (options.maxTurns != null) {
      args.push("--max-turns", String(options.maxTurns));
    }
    if (options.noTools) {
      args.push("--tools", "");
    } else if (options.allowedTools?.length) {
      args.push("--allowedTools", options.allowedTools.join(","));
    }
    for (const dir of options.addDirs ?? []) {
      if (fs.existsSync(dir)) args.push("--add-dir", dir);
    }

    const proc = spawn(CLAUDE_BIN, args, {
      cwd: options.cwd ?? process.cwd(),
      env: process.env,
    });

    proc.stdin.write(prompt);
    proc.stdin.end();

    let buffer = "";
    let finalResult = "";
    let lastText = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line.trim());
          if (event.type === "result" && event.subtype === "success") {
            finalResult = event.result ?? "";
          } else if (event.type === "stream_event") {
            const se = event.event;
            if (se?.type === "content_block_delta") {
              const delta = se.delta;
              if (delta?.type === "text_delta" && delta.text && onProgress) {
                onProgress(delta.text as string);
              } else if (delta?.type === "thinking_delta" && delta.thinking && onThinking) {
                onThinking(delta.thinking as string);
              }
            }
          } else if (event.type === "assistant" && event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === "text" && block.text) {
                lastText = block.text as string;
              } else if (block.type === "tool_use" && onProgress) {
                const toolLine = formatToolUse(block.name as string, block.input as Record<string, unknown>);
                if (toolLine) onProgress(toolLine);
              }
            }
          }
        } catch { /* ignore malformed lines */ }
      }
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      console.error("[claude stderr]", chunk.toString());
    });

    proc.on("error", (err) => {
      console.error("[claude spawn error]", err.message, "| bin:", CLAUDE_BIN);
      reject(err);
    });

    proc.on("close", (code) => {
      const result = finalResult || lastText;
      if (code === 0 || result) resolve(result);
      else reject(new Error(`Agent process exited with code ${code}`));
    });
    proc.on("error", reject);
  });
}

export function parseJSON<T>(text: string, fallback: T): T {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/);
  try {
    return JSON.parse(match?.[1] ?? text) as T;
  } catch {
    return fallback;
  }
}
