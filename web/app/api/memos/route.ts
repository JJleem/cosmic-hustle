import { db } from "@/db";
import { memos } from "@/db/schema";
import { desc } from "drizzle-orm";

export async function GET() {
  const rows = await db.select().from(memos).orderBy(desc(memos.createdAt)).limit(200);
  return Response.json(rows);
}

export async function POST(request: Request) {
  const body = await request.json() as { text?: string };
  const text = body.text?.trim();
  if (!text) return Response.json({ error: "text required" }, { status: 400 });

  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(memos).values({ id, text, createdAt: now });
  return Response.json({ id, text, createdAt: Math.floor(now.getTime() / 1000) });
}
