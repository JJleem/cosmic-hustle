import { db } from "@/db";
import { sessionEvents, sessions } from "@/db/schema";
import { sql, desc, inArray } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params;

  // 해당 에이전트의 agent_done 이벤트 최근 10개
  const events = db
    .select({
      sessionId: sessionEvents.sessionId,
      payload:   sessionEvents.payload,
      createdAt: sessionEvents.createdAt,
    })
    .from(sessionEvents)
    .where(
      sql`json_extract(${sessionEvents.payload}, '$.agentId') = ${agentId}
       AND json_extract(${sessionEvents.payload}, '$.type') = 'agent_done'`,
    )
    .orderBy(desc(sessionEvents.createdAt))
    .limit(10)
    .all();

  if (events.length === 0) {
    return Response.json({ history: [], totalCount: 0 });
  }

  // sessionId로 topic 조회
  const sessionIds = [...new Set(events.map((e) => e.sessionId))];
  const sessionRows = db
    .select({ id: sessions.id, topic: sessions.topic })
    .from(sessions)
    .where(inArray(sessions.id, sessionIds))
    .all();

  const topicMap = Object.fromEntries(sessionRows.map((s) => [s.id, s.topic]));

  const history = events.map((e) => {
    let message = "";
    try {
      const payload = JSON.parse(e.payload) as { message?: string };
      message = payload.message ?? "";
    } catch {
      console.error("[history] payload parse failed, sessionId:", e.sessionId);
    }
    return {
      sessionId:   e.sessionId,
      topic:       topicMap[e.sessionId] ?? "알 수 없는 프로젝트",
      message,
      completedAt: e.createdAt instanceof Date ? e.createdAt.getTime() : Number(e.createdAt) * 1000,
    };
  });

  // 전체 작업 횟수
  const countRow = db
    .select({ count: sql<number>`count(*)` })
    .from(sessionEvents)
    .where(
      sql`json_extract(${sessionEvents.payload}, '$.agentId') = ${agentId}
       AND json_extract(${sessionEvents.payload}, '$.type') = 'agent_done'`,
    )
    .get();

  return Response.json({ history, totalCount: countRow?.count ?? 0 });
}
