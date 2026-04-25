import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { WIKI_DIR } from "../../research/route";

const WIKI_PAGES_DIR = path.join(WIKI_DIR, "wiki");

// GET /api/wiki/content?path=concepts/foo.md
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filePath = searchParams.get("path");

  if (!filePath) return NextResponse.json({ error: "path required" }, { status: 400 });

  // path traversal 방지
  const resolved = path.resolve(WIKI_PAGES_DIR, filePath);
  if (!resolved.startsWith(WIKI_PAGES_DIR)) {
    return NextResponse.json({ error: "invalid path" }, { status: 400 });
  }

  if (!resolved.endsWith(".md")) {
    return NextResponse.json({ error: "only .md files allowed" }, { status: 400 });
  }

  try {
    const content = fs.readFileSync(resolved, "utf-8");
    const stat = fs.statSync(resolved);
    return NextResponse.json({ content, updatedAt: Math.floor(stat.mtimeMs / 1000) });
  } catch {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }
}
