import { execFile } from "child_process";
import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import { homedir } from "os";
import path from "path";
import { promisify } from "util";
import {
  HERMES_AGENT_IDS,
  type HermesAgentId,
  type HermesRunRequest,
  type HermesRunResult,
} from "@/lib/ops/hermesAgents";

const execFileAsync = promisify(execFile);

export type { HermesRunRequest, HermesRunResult };

type ExecError = Error & {
  stdout?: string;
  stderr?: string;
  code?: number;
  signal?: NodeJS.Signals;
};

const repoRoot = path.resolve(process.cwd(), "..");
const logDir = path.join(process.cwd(), ".ops");
const runLogPath = path.join(logDir, "hermes-runs.jsonl");

export function isHermesAgentId(value: unknown): value is HermesAgentId {
  return typeof value === "string" && HERMES_AGENT_IDS.includes(value as HermesAgentId);
}

export function isLocalRequest(request: Request): boolean {
  const host = request.headers.get("host") ?? "";
  const forwardedHost = request.headers.get("x-forwarded-host") ?? "";
  const target = forwardedHost || host;
  return (
    target.startsWith("localhost:") ||
    target.startsWith("127.0.0.1:") ||
    target.startsWith("[::1]:") ||
    target === "localhost" ||
    target === "127.0.0.1" ||
    target === "::1"
  );
}

export async function runHermesAgent(input: HermesRunRequest): Promise<HermesRunResult> {
  const startedAt = Date.now();
  const agentPrompt = await readAgentPrompt(input.agentId);
  const prompt = buildPrompt(agentPrompt, input);
  const hermesBin = process.env.HERMES_BIN ?? path.join(homedir(), ".local/bin/hermes");

  let stdout = "";
  try {
    const result = await execFileAsync(
      hermesBin,
      [
        "chat",
        "-q",
        prompt,
        "-Q",
        "--source",
        `cosmic-hustle-${input.agentId}`,
      ],
      {
        cwd: repoRoot,
        timeout: Number(process.env.HERMES_RUN_TIMEOUT_MS ?? 180_000),
        maxBuffer: 1024 * 1024 * 4,
      },
    );
    stdout = result.stdout;
  } catch (error) {
    const err = error as ExecError;
    const detail = [err.message, err.stderr, err.stdout].filter(Boolean).join("\n\n");
    throw new Error(detail || "Hermes command failed");
  }

  const parsed = parseHermesOutput(stdout);
  const run: HermesRunResult = {
    id: randomUUID(),
    agentId: input.agentId,
    command: input.command,
    response: parsed.response,
    sessionId: parsed.sessionId,
    createdAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
  };

  await appendRunLog(run);
  return run;
}

async function readAgentPrompt(agentId: HermesAgentId): Promise<string> {
  const promptPath = path.join(repoRoot, "backend", "agents", agentId, "CLAUDE.md");
  return readFile(promptPath, "utf8");
}

function buildPrompt(agentPrompt: string, input: HermesRunRequest): string {
  return [
    "You are being invoked by the Cosmic Hustle local operations dashboard.",
    "Use the following employee role instructions for this run.",
    "",
    "```markdown",
    agentPrompt.trim(),
    "```",
    "",
    "Dashboard command:",
    input.command.trim(),
    "",
    "Return the best useful result for this command. Do not modify files unless the command explicitly asks you to.",
  ].join("\n");
}

function parseHermesOutput(stdout: string): { sessionId: string | null; response: string } {
  const lines = stdout.replace(/\r\n/g, "\n").split("\n");
  let sessionId: string | null = null;
  const responseLines: string[] = [];

  for (const line of lines) {
    const match = line.match(/^session_id:\s*(.+)$/);
    if (match) {
      sessionId = match[1].trim();
      continue;
    }
    responseLines.push(line);
  }

  return {
    sessionId,
    response: responseLines.join("\n").trim(),
  };
}

async function appendRunLog(run: HermesRunResult): Promise<void> {
  await mkdir(logDir, { recursive: true });
  let existing = "";
  try {
    existing = await readFile(runLogPath, "utf8");
  } catch {
    existing = "";
  }
  await writeFile(runLogPath, `${existing}${JSON.stringify(run)}\n`, "utf8");
}
