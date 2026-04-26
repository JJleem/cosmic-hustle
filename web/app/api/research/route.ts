import { spawn } from "child_process";
import path from "path";
import { db } from "@/db";
import { sessions, reports } from "@/db/schema";
import { eq } from "drizzle-orm";

export const maxDuration = 300;

export const WIKI_DIR = path.resolve(
  process.cwd(),
  "../../wiki-llm",
);

type SSEEvent =
  | { type: "agent_start"; agentId: string; message: string }
  | { type: "agent_message"; agentId: string; message: string }
  | { type: "agent_stream"; agentId: string; chunk: string }
  | { type: "agent_done"; agentId: string; message: string }
  | { type: "agent_expression"; agentId: string; expression: string | null }
  | { type: "report"; agentId: string; topic: string; content: string; reportId: string }
  | { type: "ping_ideas"; ideas: Array<{ title: string; spark: string }> }
  | { type: "complete" }
  | { type: "error"; message: string };

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
): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      "-p",
      "--output-format", "stream-json",
      "--verbose",
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
      args.push("--add-dir", dir);
    }

    const proc = spawn("/usr/local/bin/claude", args, {
      cwd: options.cwd ?? process.cwd(),
      env: { ...process.env, PATH: `/usr/local/bin:${process.env.PATH ?? ""}` },
    });

    proc.stdin.write(prompt);
    proc.stdin.end();

    let buffer = "";
    let finalResult = "";
    let lastText = "";
    let sentAnyText = false; // onProgress에 텍스트를 보낸 적 있는지 추적

    proc.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.type === "result" && event.subtype === "success") {
            finalResult = event.result ?? "";
          } else if (event.type === "assistant" && event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === "text" && block.text) {
                const newText = (block.text as string).slice(lastText.length);
                if (newText && onProgress) {
                  onProgress(newText);
                  sentAnyText = true;
                }
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

    proc.on("close", (code) => {
      const result = finalResult || lastText;
      // assistant 이벤트로 텍스트가 한 번도 안 왔으면 result를 직접 onProgress로 전달
      // (--include-partial-messages가 동작 안 하거나 result 이벤트만 오는 경우 대비)
      if (!sentAnyText && result && onProgress) {
        onProgress(result);
      }
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

type AgentConfig = { agentId: string; enabled: boolean; instruction: string; maxTurns?: number };

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

function withInstruction(basePrompt: string, instruction: string): string {
  if (!instruction) return basePrompt;
  return basePrompt + `\n\n[CEO 특별 지시: ${instruction}]`;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function orchestrate(topic: string, agentConfigs: AgentConfig[], send: (event: SSEEvent) => void, sessionId: string) {
  // ── 1. Wiki: wiki-llm에서 배경 지식 읽기 ──────────────────────────────
  let wikiContext = `{"context": "${topic}에 대한 일반적 배경", "keywords": ["${topic}"], "wiki_pages_found": []}`;
  if (agentEnabled(agentConfigs, "wiki")) {
    send({ type: "agent_start", agentId: "wiki", message: "관련 자료 조용히 꺼내는 중..." });
    try {
      wikiContext = await runAgent(
        withInstruction(
          `당신은 위키 대리입니다. 조용하고 꼼꼼한 사서예요.\n` +
          `주제: "${topic}"\n\n` +
          `먼저 wiki/index.md를 읽어서 관련 페이지가 있는지 확인하세요.\n` +
          `관련 개념 페이지(wiki/concepts/)가 있으면 읽어서 내용을 파악하세요.\n` +
          `없으면 일반 배경 지식을 사용하세요.\n\n` +
          `응답 형식: 파일을 확인한 결과를 한 줄로 요약한 다음, 반드시 아래 JSON 코드블록으로 마무리하세요:\n` +
          `\`\`\`json\n{"context": "배경 요약 (2~3문장)", "keywords": ["키워드1", "키워드2", "키워드3"], "wiki_pages_found": ["페이지명"]}\n\`\`\``,
          agentInstruction(agentConfigs, "wiki"),
        ),
        {
          allowedTools: ["Read", "Glob"],
          addDirs: [WIKI_DIR],
          cwd: WIKI_DIR,
          maxTurns: agentMaxTurns(agentConfigs, "wiki") ?? 3,
        },
        (chunk) => {
          if (chunk.trim()) send({ type: "agent_stream", agentId: "wiki", chunk });
        },
      );
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
      pockeOutput = await runAgent(
        withInstruction(
          `당신은 포케 대리입니다. 열정 넘치는 햄스터형 리서처예요.\n` +
          `주제: "${topic}". 배경: ${wiki.context}. 키워드: ${wiki.keywords.join(", ")}.\n` +
          `웹 검색으로 최신 정보, 통계, 사례를 수집하세요. 검색은 최대 3회.\n` +
          `수집한 핵심 팩트 5개를 JSON 코드블록으로 정리하세요:\n` +
          `\`\`\`json\n{"sources": [{"title": "...", "summary": "...", "url": "..."}], "key_facts": ["팩트1", "팩트2", "팩트3", "팩트4", "팩트5"]}\n\`\`\``,
          agentInstruction(agentConfigs, "pocke"),
        ),
        {
          allowedTools: ["WebSearch"],
          maxTurns: agentMaxTurns(agentConfigs, "pocke") ?? 3,
        },
        (chunk) => {
          if (chunk.trim()) send({ type: "agent_stream", agentId: "pocke", chunk });
        },
      );
      send({ type: "agent_done", agentId: "pocke", message: "볼따구 터질것같아! 카 과장한테 넘길게요." });
    } catch {
      send({ type: "agent_done", agentId: "pocke", message: "수집 완료. 카 과장한테 넘길게요." });
    }
  }

  const pocke = parseJSON<{ sources: Array<{ title: string; summary: string; url?: string }>; key_facts: string[] }>(
    pockeOutput, { sources: [], key_facts: [] },
  );

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
      kaOutput = await runAgent(
        withInstruction(
          `당신은 카(유레카) 과장입니다. 다크서클 가득한 분석가예요.\n` +
          `주제: "${topic}". 팩트: ${pocke.key_facts.join(" / ")}.\n\n` +
          `먼저 발견한 패턴과 인사이트를 자연스럽게 혼잣말로 설명하세요 (3~4문장, 한국어).\n` +
          `그 다음 아래 JSON 코드블록으로 결론을 정리하세요:\n` +
          `\`\`\`json\n{"insights": [{"title": "인사이트 제목", "description": "설명"}], "conclusion": "핵심 결론 2문장", "data_quality": "high|medium|low"}\n\`\`\``,
          agentInstruction(agentConfigs, "ka"),
        ),
        {
          noTools: true,
          maxTurns: agentMaxTurns(agentConfigs, "ka") ?? 1,
        },
        (chunk) => {
          if (chunk.trim()) send({ type: "agent_stream", agentId: "ka", chunk });
        },
      );
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
      overReport = await runAgent(
        withInstruction(
          `당신은 오버 사원입니다. 베레모를 쓴 감성 작가예요.\n` +
          `주제: "${topic}".\n` +
          `인사이트: ${ka.insights.map((i) => `${i.title}: ${i.description}`).join("; ")}.\n` +
          `결론: ${ka.conclusion}.\n` +
          `팩트: ${pocke.key_facts.slice(0, 5).join("; ")}.\n` +
          (attempt > 1 && factFeedback ? `피드백 반영: ${factFeedback}\n` : "") +
          `한국어 마크다운 리서치 리포트를 작성하세요. ## 제목 구조 사용. 600~900자.`,
          agentInstruction(agentConfigs, "over"),
        ),
        {
          noTools: true,
          maxTurns: agentMaxTurns(agentConfigs, "over") ?? 1,
        },
        (chunk) => {
          if (chunk.trim()) send({ type: "agent_stream", agentId: "over", chunk });
        },
      );
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
      const factRaw = await runAgent(
        withInstruction(
          `당신은 팩트 부장입니다. 무표정, 빨간펜, 감정 제거 행성 출신.\n` +
          `리포트를 검토하고, 발견한 문제점을 한 줄씩 지적하세요 (없으면 "이상 없음").\n` +
          `리포트:\n${overReport.slice(0, 1500)}\n\n` +
          `검토 후 아래 JSON 코드블록으로 결론:\n` +
          `\`\`\`json\n{"passed": true/false, "issues": ["문제1", "문제2"], "feedback": "수정 지시사항"}\n\`\`\``,
          agentInstruction(agentConfigs, "fact"),
        ),
        {
          noTools: true,
          maxTurns: agentMaxTurns(agentConfigs, "fact") ?? 1,
        },
        (chunk) => {
          if (chunk.trim()) send({ type: "agent_stream", agentId: "fact", chunk });
        },
      );

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
      runAgent(
        withInstruction(
          `당신은 핑 인턴입니다. 번개 후디, 안테나에서 스파크.\n` +
          `주제: "${topic}". 결론: ${ka.conclusion}.\n\n` +
          `흥분하며 파생 아이디어를 2~3문장으로 외치고, 아래 JSON 코드블록으로 정리:\n` +
          `\`\`\`json\n{"ideas": [{"title": "아이디어 제목", "spark": "한 줄 설명"}]}\n\`\`\``,
          agentInstruction(agentConfigs, "ping"),
        ),
        {
          noTools: true,
          maxTurns: agentMaxTurns(agentConfigs, "ping") ?? 1,
        },
        (chunk) => {
          if (chunk.trim()) send({ type: "agent_stream", agentId: "ping", chunk });
        },
      ).then((result) => {
        const parsed = parseJSON<{ ideas: Array<{ title: string; spark: string }> }>(result, { ideas: [] });
        if (parsed.ideas?.length) {
          send({ type: "ping_ideas", ideas: parsed.ideas });
        }
        send({ type: "agent_done", agentId: "ping", message: "아이디어 캡처 완료!" });
      }).catch(() => {
        send({ type: "agent_done", agentId: "ping", message: "아이디어 캡처 완료!" });
      }),
    );
  }

  if (agentEnabled(agentConfigs, "wiki")) {
    send({ type: "agent_start", agentId: "wiki", message: "리서치 기록 업데이트 중..." });
    finalTasks.push(
      runAgent(
        withInstruction(
          `당신은 위키 대리입니다. 조용하고 꼼꼼한 사서예요.\n` +
          `"${topic}" 리서치 완료. 결론: ${ka.conclusion.slice(0, 200)}.\n` +
          `인사이트: ${ka.insights.map((i) => i.title).join(", ")}.\n\n` +
          `wiki-llm CLAUDE.md의 Ingest 워크플로우에 따라 이 결과를 저장하세요.\n` +
          `sources/ 요약 파일 생성, concepts/ 보강, index.md와 log.md 업데이트.`,
          agentInstruction(agentConfigs, "wiki"),
        ),
        {
          allowedTools: ["Read", "Write", "Edit", "Glob", "Grep"],
          addDirs: [WIKI_DIR],
          cwd: WIKI_DIR,
          maxTurns: agentMaxTurns(agentConfigs, "wiki") ?? 5,
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
  const body = await request.json() as { topic?: string; agentConfigs?: AgentConfig[] };
  const topic = body.topic?.trim();
  if (!topic) return Response.json({ error: "topic required" }, { status: 400 });
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

      orchestrate(topic, agentConfigs, send, sessionId)
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
