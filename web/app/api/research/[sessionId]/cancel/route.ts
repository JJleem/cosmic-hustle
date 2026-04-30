import { db } from "@/db";
import { sessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { cancelledSessions, pendingResponses } from "@/lib/agentRunner";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;

  cancelledSessions.add(sessionId);

  // CEO 대기 중이면 빈 응답으로 언블록
  const resolver = pendingResponses.get(sessionId);
  if (resolver) resolver("");

  await db
    .update(sessions)
    .set({ status: "cancelled" })
    .where(eq(sessions.id, sessionId));

  return Response.json({ ok: true });
}
