import { db } from "@/db";
import { sessions, sessionEvents } from "@/db/schema";
import { eq, gt, and, asc } from "drizzle-orm";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const sinceStr = new URL(request.url).searchParams.get("since");
  const sinceSeq = parseInt(sinceStr ?? "0");

  const [session] = await db
    .select({ status: sessions.status })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!session) return Response.json({ error: "session not found" }, { status: 404 });

  const rows = await db
    .select({ seq: sessionEvents.seq, payload: sessionEvents.payload })
    .from(sessionEvents)
    .where(
      sinceSeq > 0
        ? and(eq(sessionEvents.sessionId, sessionId), gt(sessionEvents.seq, sinceSeq))
        : eq(sessionEvents.sessionId, sessionId),
    )
    .orderBy(asc(sessionEvents.seq));

  return Response.json({
    status: session.status,
    events: rows.map((r) => ({ seq: r.seq, event: JSON.parse(r.payload) as unknown })),
  });
}
