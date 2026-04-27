import { spawn, execSync } from "child_process";
import path from "path";
import fs from "fs";
import { db } from "@/db";
import { sessions, reports } from "@/db/schema";
import { eq } from "drizzle-orm";
import { DEFAULT_PROMPTS, fillPrompt, type PromptVars } from "@/lib/agentPrompts";
import { TASK_TYPE_MAP, DEFAULT_TASK_TYPE } from "@/lib/taskTypes";

export const maxDuration = 300;

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
const CLAUDE_BIN = findClaude();
console.log("[findClaude]", CLAUDE_BIN, "| exists:", fs.existsSync(CLAUDE_BIN));

export const WIKI_DIR = path.resolve(
  process.cwd(),
  "../../wiki-llm",
);

type SSEEvent =
  | { type: "agent_start"; agentId: string; message: string }
  | { type: "agent_message"; agentId: string; message: string }
  | { type: "agent_stream"; agentId: string; chunk: string }
  | { type: "agent_thinking"; agentId: string; chunk: string }
  | { type: "agent_done"; agentId: string; message: string }
  | { type: "agent_expression"; agentId: string; expression: string | null }
  | { type: "report"; agentId: string; topic: string; content: string; reportId: string }
  | { type: "ping_ideas"; ideas: Array<{ title: string; spark: string }> }
  | { type: "clarify_request"; sessionId: string; questions: string[] }
  | { type: "ceo_checkin"; sessionId: string; summary: string; keyFacts: string[] }
  | { type: "complete" }
  | { type: "error"; message: string };

// CEO 응답 대기 — 세션별 Promise resolver 저장
export const pendingResponses = new Map<string, (r: string) => void>();

function waitForCEO(sessionId: string, timeoutMs = 90_000): Promise<string> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingResponses.delete(sessionId);
      resolve(""); // 타임아웃 → 자동 승인
    }, timeoutMs);
    pendingResponses.set(sessionId, (r) => {
      clearTimeout(timer);
      pendingResponses.delete(sessionId);
      resolve(r);
    });
  });
}

export type RunAgentOptions = {
  allowedTools?: string[];
  noTools?: boolean;
  addDirs?: string[];
  cwd?: string;
  maxTurns?: number;
};

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

export function parseJSON<T>(text: string, fallback: T): T {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/);
  try {
    return JSON.parse(match?.[1] ?? text) as T;
  } catch {
    return fallback;
  }
}

type AgentConfig = { agentId: string; enabled: boolean; basePrompt?: string; instruction: string; maxTurns?: number };

function agentEnabled(configs: AgentConfig[], id: string): boolean {
  const cfg = configs.find((c) => c.agentId === id);
  return cfg ? cfg.enabled : true;
}

function agentInstruction(configs: AgentConfig[], id: string): string {
  return configs.find((c) => c.agentId === id)?.instruction?.trim() ?? "";
}

function agentMaxTurns(configs: AgentConfig[], id: string): number | undefined {
  return configs.find((c) => c.agentId === id)?.maxTurns;
}

function buildPrompt(
  configs: AgentConfig[],
  id: string,
  vars: Record<string, string>,
  promptVariants: Record<string, string> = {},
): string {
  const cfg = configs.find((c) => c.agentId === id);
  const variantKey = promptVariants[id];
  const template = cfg?.basePrompt?.trim() || DEFAULT_PROMPTS[variantKey ?? id] || "";
  const base = fillPrompt(template, vars as Parameters<typeof fillPrompt>[1]);
  const instruction = cfg?.instruction?.trim() ?? "";
  return instruction ? `${base}\n\n[CEO 특별 지시: ${instruction}]` : base;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 결과 텍스트를 작은 조각으로 나눠 딜레이와 함께 전송 — 클라이언트에서 타이핑 효과 가시화
async function streamChunked(agentId: string, text: string, send: (e: SSEEvent) => void): Promise<void> {
  if (!text.trim()) return;
  const CHUNK = 55;
  for (let i = 0; i < text.length; i += CHUNK) {
    send({ type: "agent_stream", agentId, chunk: text.slice(i, i + CHUNK) });
    await delay(18); // 18ms 간격 ≈ 3000자/초
  }
}

async function orchestrate(topicInput: string, agentConfigs: AgentConfig[], send: (event: SSEEvent) => void, sessionId: string, taskTypeId = "research") {
  let topic = topicInput;
  let promptVariants: Record<string, string> = TASK_TYPE_MAP[taskTypeId]?.promptVariants ?? {};

  // ── 0. 플랜 차장 — 의도 파악 + 태스크 정의 + 팀 구성 ────────────────────
  if (agentEnabled(agentConfigs, "plan")) {
    send({ type: "agent_start", agentId: "plan", message: "요구사항 파악 중. 티켓 열게요." });
    try {
      let planStreamed = false;
      const planRaw = await runAgent(
        buildPrompt(agentConfigs, "plan", { topic }, {}),
        { noTools: true, maxTurns: 1 },
        (chunk) => { if (chunk.trim()) { planStreamed = true; send({ type: "agent_stream", agentId: "plan", chunk }); } },
      );
      if (!planStreamed && planRaw.trim()) await streamChunked("plan", planRaw, send);

      const plan = parseJSON<{
        task_type: string;
        objective: string;
        scope: string;
        output_format: string;
        needs_clarification: boolean;
        clarify_questions: string[];
        plan_note: string;
      }>(planRaw, {
        task_type: taskTypeId,
        objective: topic,
        scope: "",
        output_format: "리포트",
        needs_clarification: false,
        clarify_questions: [],
        plan_note: "",
      });

      // 플랜이 결정한 task_type으로 promptVariants 교체
      promptVariants = TASK_TYPE_MAP[plan.task_type]?.promptVariants ?? promptVariants;

      // topic을 플랜의 명확화된 objective로 보강
      if (plan.objective && plan.objective !== topic) {
        topic = `${topic} (목표: ${plan.objective}${plan.scope ? ` / 범위: ${plan.scope}` : ""})`;
      }

      // 모호한 경우 CEO에게 확인 요청
      if (plan.needs_clarification && plan.clarify_questions.length > 0) {
        send({ type: "clarify_request", sessionId, questions: plan.clarify_questions });
        const ceoAnswer = await waitForCEO(sessionId);
        if (ceoAnswer.trim()) topic += ` (CEO 보충: ${ceoAnswer})`;
      }

      send({ type: "agent_done", agentId: "plan", message: plan.plan_note || "기획 완료. 팀 투입할게요." });
    } catch {
      send({ type: "agent_done", agentId: "plan", message: "기획 완료." });
    }
    await delay(400);
  }

  // ── 1. Wiki: wiki-llm에서 배경 지식 읽기 ──────────────────────────────
  let wikiContext = `{"context": "${topic}에 대한 일반적 배경", "keywords": ["${topic}"], "wiki_pages_found": []}`;
  if (agentEnabled(agentConfigs, "wiki")) {
    send({ type: "agent_start", agentId: "wiki", message: "관련 자료 조용히 꺼내는 중..." });
    try {
      let wikiStreamed = false;
      wikiContext = await runAgent(
        buildPrompt(agentConfigs, "wiki", { topic }, promptVariants),
        {
          allowedTools: ["Read", "Glob"],
          addDirs: [WIKI_DIR],
          cwd: WIKI_DIR,
          maxTurns: agentMaxTurns(agentConfigs, "wiki") ?? 2,
        },
        (chunk) => {
          if (chunk.trim()) { wikiStreamed = true; send({ type: "agent_stream", agentId: "wiki", chunk }); }
        },
      );
      if (!wikiStreamed && wikiContext.trim()) await streamChunked("wiki", wikiContext, send);
      send({ type: "agent_done", agentId: "wiki", message: "이전 리서치 연결됐어요. 포케한테 넘길게요." });
    } catch {
      send({ type: "agent_done", agentId: "wiki", message: "기본 자료 준비됐어요." });
    }
  }

  const wiki = parseJSON<{ context: string; keywords: string[]; wiki_pages_found: string[] }>(wikiContext, {
    context: topic,
    keywords: [topic],
    wiki_pages_found: [],
  });

  // 위키→포케 커뮤니케이션
  if (agentEnabled(agentConfigs, "pocke")) {
    await delay(400);
    send({ type: "agent_message", agentId: "pocke", message: "위키야 고마워! 바로 달려갈게 🐹" });
    await delay(600);
  }

  // ── 2. Pocke: 웹 리서치 ─────────────────────────────────────────────
  let pockeOutput = `{"sources": [], "key_facts": ["${topic} 관련 기본 정보"]}`;
  if (agentEnabled(agentConfigs, "pocke")) {
    send({ type: "agent_start", agentId: "pocke", message: "볼따구에 정보 쑤셔넣는 중..." });
    try {
      let pockeStreamed = false;
      pockeOutput = await runAgent(
        buildPrompt(agentConfigs, "pocke", {
          topic,
          context: wiki.context,
          keywords: wiki.keywords.join(", "),
        }, promptVariants),
        {
          allowedTools: ["WebSearch"],
          maxTurns: agentMaxTurns(agentConfigs, "pocke") ?? 3,
        },
        (chunk) => {
          if (chunk.trim()) { pockeStreamed = true; send({ type: "agent_stream", agentId: "pocke", chunk }); }
        },
      );
      if (!pockeStreamed && pockeOutput.trim()) await streamChunked("pocke", pockeOutput, send);
      send({ type: "agent_done", agentId: "pocke", message: "볼따구 터질것같아! 카 과장한테 넘길게요." });
    } catch {
      send({ type: "agent_done", agentId: "pocke", message: "수집 완료. 카 과장한테 넘길게요." });
    }
  }

  const pocke = parseJSON<{ sources: Array<{ title: string; summary: string; url?: string }>; key_facts: string[] }>(
    pockeOutput, { sources: [], key_facts: [] },
  );

  // ── CEO 체크인 — 포케 결과 확인 후 방향 승인 ──────────────────────────
  let ceoNotes = "";
  if (agentEnabled(agentConfigs, "ka")) {
    const unverified = pocke.sources.filter((s) => s.url === "검증불가" || !s.url).length;
    const summary = pocke.sources.length > 0
      ? `소스 ${pocke.sources.length}개 수집${unverified > 0 ? ` (검증불가 ${unverified}개 포함)` : ""}`
      : `팩트 ${pocke.key_facts.length}개 수집`;
    send({ type: "ceo_checkin", sessionId, summary, keyFacts: pocke.key_facts.slice(0, 4) });
    const ceoResponse = await waitForCEO(sessionId);
    if (ceoResponse.trim()) {
      ceoNotes = `[CEO 추가 지시: ${ceoResponse}]\n`;
    }
  }

  // 포케→카 커뮤니케이션
  if (agentEnabled(agentConfigs, "ka")) {
    await delay(400);
    send({ type: "agent_message", agentId: "ka", message: `포케가 팩트 ${pocke.key_facts.length}개 넘겼어. ...흥미롭네.` });
    await delay(600);
  }

  // ── 3. Ka: 분석 ─────────────────────────────────────────────────────
  let kaOutput = `{"insights": [{"title": "주요 동향", "description": "${topic}의 핵심 흐름"}], "conclusion": "${topic}에 대한 분석 결과입니다.", "data_quality": "medium"}`;
  if (agentEnabled(agentConfigs, "ka")) {
    send({ type: "agent_start", agentId: "ka", message: "패턴 분석 시작. 데이터 하나만 더..." });
    try {
      let kaStreamed = false;
      kaOutput = await runAgent(
        buildPrompt(agentConfigs, "ka", {
          topic,
          facts: pocke.key_facts.join(" / "),
          ceo_notes: ceoNotes,
        }, promptVariants),
        { noTools: true, maxTurns: agentMaxTurns(agentConfigs, "ka") ?? 1 },
        (chunk) => { if (chunk.trim()) { kaStreamed = true; send({ type: "agent_stream", agentId: "ka", chunk }); } },
        (thinking) => { if (thinking.trim()) send({ type: "agent_thinking", agentId: "ka", chunk: thinking }); },
      );
      if (!kaStreamed && kaOutput.trim()) await streamChunked("ka", kaOutput, send);
      await delay(1200);
      send({ type: "agent_done", agentId: "ka", message: "찾았다!!! 핵심 인사이트 잡음. 오버한테 넘길게." });
    } catch {
      send({ type: "agent_done", agentId: "ka", message: "분석 완료. 오버한테 넘길게." });
    }
  }

  const ka = parseJSON<{ insights: Array<{ title: string; description: string }>; conclusion: string; data_quality: string }>(
    kaOutput, { insights: [], conclusion: "", data_quality: "medium" },
  );

  // 카→오버 커뮤니케이션
  if (agentEnabled(agentConfigs, "over")) {
    await delay(400);
    send({ type: "agent_message", agentId: "over", message: "카 과장님 인사이트 받았어요... 이거 좋은 이야기가 될 것 같은데요?" });
    await delay(600);
  }

  // ── 4. Over + 5. Fact: 작성 → 검토 루프 ────────────────────────────
  let overReport = "";
  let factPassed = false;
  let attempt = 0;
  let factFeedback = "";

  if (!agentEnabled(agentConfigs, "over")) {
    overReport = `# ${topic} 리서치 리포트\n\n${ka.conclusion}\n\n${pocke.key_facts.join("\n")}`;
    factPassed = true;
  }

  while (!factPassed && attempt < 2) {
    attempt++;

    send({ type: "agent_start", agentId: "over", message: attempt === 1 ? "이 숫자 뒤에 얼마나 많은 이야기가..." : "...알겠습니다. 수정할게요." });
    if (attempt === 2) send({ type: "agent_expression", agentId: "over", expression: null });

    try {
      let overStreamed = false;
      overReport = await runAgent(
        buildPrompt(agentConfigs, "over", {
          topic,
          insights: ka.insights.map((i) => `${i.title}: ${i.description}`).join("; "),
          conclusion: ka.conclusion,
          facts: pocke.key_facts.slice(0, 4).join("; "),
          feedback: attempt > 1 && factFeedback ? `피드백: ${factFeedback}\n` : "",
        }, promptVariants),
        { noTools: true, maxTurns: agentMaxTurns(agentConfigs, "over") ?? 1 },
        (chunk) => { if (chunk.trim()) { overStreamed = true; send({ type: "agent_stream", agentId: "over", chunk }); } },
        (thinking) => { if (thinking.trim()) send({ type: "agent_thinking", agentId: "over", chunk: thinking }); },
      );
      if (!overStreamed && overReport.trim()) await streamChunked("over", overReport, send);
      await delay(1800);
      send({ type: "agent_done", agentId: "over", message: "리포트 완성. 걸작이에요. 팩트 부장님께." });
    } catch {
      overReport = `# ${topic} 리서치 리포트\n\n${ka.conclusion}\n\n${pocke.key_facts.join("\n")}`;
      send({ type: "agent_done", agentId: "over", message: "초안 완성. 팩트 부장님께." });
    }

    if (!agentEnabled(agentConfigs, "fact")) {
      factPassed = true;
      break;
    }

    // 오버→팩트 커뮤니케이션
    await delay(400);
    send({ type: "agent_message", agentId: "fact", message: "...검토 시작." });
    await delay(500);

    send({ type: "agent_start", agentId: "fact", message: "..." });
    try {
      let factStreamed = false;
      const sourcesJson = JSON.stringify(pocke.sources.slice(0, 5));
      const factRaw = await runAgent(
        buildPrompt(agentConfigs, "fact", { report: overReport.slice(0, 800), sources: sourcesJson }, promptVariants),
        { noTools: true, maxTurns: agentMaxTurns(agentConfigs, "fact") ?? 1 },
        (chunk) => { if (chunk.trim()) { factStreamed = true; send({ type: "agent_stream", agentId: "fact", chunk }); } },
        (thinking) => { if (thinking.trim()) send({ type: "agent_thinking", agentId: "fact", chunk: thinking }); },
      );
      if (!factStreamed && factRaw.trim()) await streamChunked("fact", factRaw, send);
      await delay(800);

      const fact = parseJSON<{ passed: boolean; issues: string[]; feedback: string }>(
        factRaw, { passed: true, issues: [], feedback: "" },
      );

      factPassed = fact.passed;
      factFeedback = fact.feedback;

      if (!factPassed) {
        send({ type: "agent_message", agentId: "fact", message: `오류 ${fact.issues.length}건. 수정 후 재검토.` });
        send({ type: "agent_expression", agentId: "fact", expression: "err" });
        send({ type: "agent_expression", agentId: "over", expression: "sad" });
        await delay(400);
        send({ type: "agent_message", agentId: "over", message: "...다시요? (상처받음)" });
        await delay(800);
        send({ type: "agent_expression", agentId: "fact", expression: null });
      } else {
        send({ type: "agent_expression", agentId: "fact", expression: null });
        send({ type: "agent_done", agentId: "fact", message: "통과." });
        await delay(300);
        send({ type: "agent_done", agentId: "over", message: "통과라고 했다... 역시 걸작." });
      }
    } catch {
      factPassed = true;
      send({ type: "agent_done", agentId: "fact", message: "검토 완료." });
    }
  }

  if (!factPassed) {
    send({ type: "agent_expression", agentId: "fact", expression: null });
    send({ type: "agent_done", agentId: "fact", message: "통과 처리." });
    send({ type: "agent_done", agentId: "over", message: "...감사합니다." });
  }

  const reportId = crypto.randomUUID();
  await db.insert(reports).values({
    id: reportId,
    sessionId,
    agentId: "over",
    topic,
    content: overReport,
    createdAt: new Date(),
  });

  send({ type: "report", agentId: "over", topic, content: overReport, reportId });

  // ── 6. Ping + Wiki 동시 ──────────────────────────────────────────────
  await delay(300);
  const finalTasks: Promise<void>[] = [];

  if (agentEnabled(agentConfigs, "ping")) {
    send({ type: "agent_start", agentId: "ping", message: "이거랑 저거 합치면?! ✨ 안테나 반짝!" });
    finalTasks.push(
      (async () => {
        try {
          const result = await runAgent(
            buildPrompt(agentConfigs, "ping", {
              topic,
              conclusion: ka.conclusion.slice(0, 150),
            }, promptVariants),
            { noTools: true, maxTurns: agentMaxTurns(agentConfigs, "ping") ?? 1 },
          );
          await streamChunked("ping", result, send);
          await delay(600);
          const parsed = parseJSON<{ ideas: Array<{ title: string; spark: string }> }>(result, { ideas: [] });
          if (parsed.ideas?.length) send({ type: "ping_ideas", ideas: parsed.ideas });
          send({ type: "agent_done", agentId: "ping", message: "아이디어 캡처 완료!" });
        } catch {
          send({ type: "agent_done", agentId: "ping", message: "아이디어 캡처 완료!" });
        }
      })(),
    );
  }

  if (agentEnabled(agentConfigs, "wiki")) {
    send({ type: "agent_start", agentId: "wiki", message: "리서치 기록 업데이트 중..." });
    finalTasks.push(
      runAgent(
        buildPrompt(agentConfigs, "wiki", {
          topic,
          conclusion: ka.conclusion.slice(0, 150),
          insights: ka.insights.map((i) => i.title).join(", "),
        }, promptVariants) + `\nsources/ 요약 파일 생성, concepts/ 보강, index.md와 log.md 업데이트.`,
        {
          allowedTools: ["Read", "Write", "Edit", "Glob", "Grep"],
          addDirs: [WIKI_DIR],
          cwd: WIKI_DIR,
          maxTurns: agentMaxTurns(agentConfigs, "wiki") ?? 4,
        },
        (chunk) => {
          if (chunk.trim()) send({ type: "agent_stream", agentId: "wiki", chunk });
        },
      ).then(() => {
        send({ type: "agent_done", agentId: "wiki", message: "위키 업데이트 완료. 다음에 쓸 수 있어요." });
      }).catch(() => {
        send({ type: "agent_done", agentId: "wiki", message: "기록 완료." });
      }),
    );
  }

  await Promise.allSettled(finalTasks);

  send({ type: "complete" });
}

export async function POST(request: Request) {
  const body = await request.json() as { topic?: string; taskTypeId?: string; agentConfigs?: AgentConfig[] };
  const topic = body.topic?.trim();
  if (!topic) return Response.json({ error: "topic required" }, { status: 400 });
  const taskTypeId = body.taskTypeId ?? "research";
  const agentConfigs: AgentConfig[] = body.agentConfigs ?? [];

  const sessionId = crypto.randomUUID();
  const now = new Date();

  await db.insert(sessions).values({
    id: sessionId,
    topic,
    status: "working",
    createdAt: now,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: SSEEvent) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)); } catch { /* closed */ }
      };

      orchestrate(topic, agentConfigs, send, sessionId, taskTypeId)
        .then(async () => {
          await db.update(sessions)
            .set({ status: "done", completedAt: new Date() })
            .where(eq(sessions.id, sessionId));
        })
        .catch(async (err: Error) => {
          try { send({ type: "error", message: err.message }); } catch { /* ignore */ }
          await db.update(sessions)
            .set({ status: "error" })
            .where(eq(sessions.id, sessionId));
        })
        .finally(() => { try { controller.close(); } catch { /* ignore */ } });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
