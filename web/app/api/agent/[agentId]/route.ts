import { runAgent, parseJSON, WIKI_DIR, type RunAgentOptions } from "@/lib/agentRunner";

export const maxDuration = 300;

const AGENT_CONFIGS: Record<string, { persona: string; options: RunAgentOptions }> = {
  wiki: {
    persona: "당신은 위키 대리입니다. 조용하고 꼼꼼한 사서예요. wiki-llm의 지식 베이스를 읽고 쓸 수 있어요.",
    options: { allowedTools: ["Read", "Write", "Edit", "Glob", "Grep"], addDirs: [WIKI_DIR], cwd: WIKI_DIR },
  },
  pocke: {
    persona: "당신은 포케 대리입니다. 열정 넘치는 햄스터형 리서처예요. 웹 검색으로 정보를 수집해요.",
    options: { allowedTools: ["WebSearch", "WebFetch"] },
  },
  ka: {
    persona: "당신은 카(유레카) 과장입니다. 다크서클 가득한 분석가예요. 데이터를 분석하고 인사이트를 도출해요.",
    options: { noTools: true },
  },
  over: {
    persona: "당신은 오버 사원입니다. 베레모를 쓴 감성 작가예요. 감동적이고 명확한 글을 써요.",
    options: { noTools: true },
  },
  fact: {
    persona: "당신은 팩트 부장입니다. 무표정, 빨간펜, 감정 제거 행성 출신. 사실을 엄격하게 검토해요.",
    options: { noTools: true },
  },
  ping: {
    persona: "당신은 핑 인턴입니다. 번개 후디, 안테나에서 스파크. 새로운 아이디어를 번쩍번쩍 캡처해요.",
    options: { noTools: true },
  },
};

// POST /api/agent/:agentId
// body: { task: string, context?: string }
export async function POST(
  request: Request,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params;
  const config = AGENT_CONFIGS[agentId];
  if (!config) return Response.json({ error: `Unknown agent: ${agentId}` }, { status: 404 });

  const body = await request.json() as { task?: string; context?: string };
  const task = body.task?.trim();
  if (!task) return Response.json({ error: "task required" }, { status: 400 });

  const prompt = [
    config.persona,
    body.context ? `\n컨텍스트:\n${body.context}` : "",
    `\n\n지시사항:\n${task}`,
  ].join("");

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: Record<string, unknown>) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)); } catch { /* closed */ }
      };

      send({ type: "agent_start", agentId, message: "작업 시작..." });

      runAgent(prompt, config.options, (chunk) => {
        if (chunk.trim()) send({ type: "agent_message", agentId, message: chunk.slice(0, 100) });
      }).then((result) => {
        const parsed = parseJSON<Record<string, unknown>>(result, { result });
        send({ type: "agent_done", agentId, message: "완료.", result: parsed });
        send({ type: "complete", result: parsed });
      }).catch((err: Error) => {
        send({ type: "error", message: err.message });
      }).finally(() => {
        try { controller.close(); } catch { /* ignore */ }
      });
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
