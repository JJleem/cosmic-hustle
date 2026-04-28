import { runAgent } from "@/app/api/research/route";
import { AGENT_PERSONAS } from "@/lib/agentPersonas";

export const maxDuration = 60;

type HistoryItem = { topic: string; message: string; completedAt: number };

export async function POST(
  request: Request,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params;
  const persona = AGENT_PERSONAS[agentId];
  if (!persona) return Response.json({ error: "Unknown agent" }, { status: 404 });

  const body = await request.json() as { question: string; history?: HistoryItem[] };
  const { question, history = [] } = body;

  const historyContext = history.length > 0
    ? `\n\n최근 작업 이력:\n${history.slice(0, 5).map((h, i) =>
        `${i + 1}. [${h.topic}] ${h.message}`
      ).join("\n")}`
    : "";

  const prompt = `${persona}${historyContext}

CEO가 물어봤습니다: "${question}"

반드시 본인 캐릭터 말투로, 1~3문장 이내로 짧게 답하세요. JSON 없이 자연스러운 대화체로.`;

  try {
    const result = await runAgent(prompt, { noTools: true });
    return Response.json({ answer: result.trim() });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
