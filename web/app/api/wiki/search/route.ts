import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { WIKI_DIR } from "@/lib/agentRunner";

const WIKI_PAGES_DIR = path.join(WIKI_DIR, "wiki");

export type SearchMatch = {
  name: string;
  path: string;
  category: string;
  snippet: string; // 매칭 전후 컨텍스트
  matchCount: number;
};

function safeReadDir(dir: string): string[] {
  try { return fs.readdirSync(dir); } catch { return []; }
}

function extractSnippet(content: string, query: string, contextLen = 80): string {
  const lower = content.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return content.slice(0, 120) + "...";
  const start = Math.max(0, idx - contextLen);
  const end = Math.min(content.length, idx + query.length + contextLen);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < content.length ? "..." : "";
  return prefix + content.slice(start, end) + suffix;
}

function countMatches(content: string, query: string): number {
  const lower = content.toLowerCase();
  const q = query.toLowerCase();
  let count = 0;
  let pos = 0;
  while ((pos = lower.indexOf(q, pos)) !== -1) { count++; pos += q.length; }
  return count;
}

// GET /api/wiki/search?q=keyword
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  if (!query || query.length < 2) {
    return NextResponse.json({ matches: [], query });
  }

  const matches: SearchMatch[] = [];
  const dirs = [
    { dir: WIKI_PAGES_DIR, category: "root", prefix: "" },
    { dir: path.join(WIKI_PAGES_DIR, "concepts"), category: "concepts", prefix: "concepts/" },
    { dir: path.join(WIKI_PAGES_DIR, "sources"),  category: "sources",  prefix: "sources/" },
  ];

  for (const { dir, category, prefix } of dirs) {
    for (const name of safeReadDir(dir)) {
      if (!name.endsWith(".md") || name.startsWith(".")) continue;
      try {
        const content = fs.readFileSync(path.join(dir, name), "utf-8");
        const matchCount = countMatches(content, query);
        if (matchCount === 0) continue;
        matches.push({
          name,
          path: `${prefix}${name}`,
          category,
          snippet: extractSnippet(content, query),
          matchCount,
        });
      } catch { /* skip */ }
    }
  }

  matches.sort((a, b) => b.matchCount - a.matchCount);

  return NextResponse.json({ matches, query });
}
