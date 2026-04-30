import { db } from "@/db";
import { reports } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const [row] = await db.select().from(reports).where(eq(reports.id, id));
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(row);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json() as { topic?: string; content?: string };
  const updates: { topic?: string; content?: string } = {};
  if (typeof body.topic === "string") updates.topic = body.topic;
  if (typeof body.content === "string") updates.content = body.content;
  if (Object.keys(updates).length === 0)
    return Response.json({ error: "no fields to update" }, { status: 400 });
  await db.update(reports).set(updates).where(eq(reports.id, id));
  const [updated] = await db.select().from(reports).where(eq(reports.id, id));
  return Response.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await db.delete(reports).where(eq(reports.id, id));
  return Response.json({ ok: true });
}
