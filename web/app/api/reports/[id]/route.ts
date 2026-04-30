import { db } from "@/db";
import { reports } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await db.delete(reports).where(eq(reports.id, id));
  return Response.json({ ok: true });
}
