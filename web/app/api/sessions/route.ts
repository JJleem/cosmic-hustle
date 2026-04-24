import { db } from "@/db";
import { sessions } from "@/db/schema";
import { desc } from "drizzle-orm";

export async function GET() {
  const rows = await db.select().from(sessions).orderBy(desc(sessions.createdAt)).limit(50);
  return Response.json(rows);
}
