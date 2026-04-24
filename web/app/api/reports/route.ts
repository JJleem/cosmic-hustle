import { db } from "@/db";
import { reports } from "@/db/schema";
import { desc } from "drizzle-orm";

export async function GET() {
  const rows = await db.select().from(reports).orderBy(desc(reports.createdAt)).limit(100);
  return Response.json(rows);
}
