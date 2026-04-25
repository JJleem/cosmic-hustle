import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { WIKI_DIR } from "../research/route";

const WIKI_PAGES_DIR = path.join(WIKI_DIR, "wiki");

export type WikiFile = {
  name: string;
  path: string; // relative to wiki pages dir
  category: string;
  size: number;
  updatedAt: number;
};

export type WikiTree = {
  files: WikiFile[];
  totalFiles: number;
};

function safeReadDir(dir: string): string[] {
  try { return fs.readdirSync(dir); } catch { return []; }
}

// GET /api/wiki — wiki 파일 트리 반환
export async function GET() {
  const files: WikiFile[] = [];

  const rootFiles = safeReadDir(WIKI_PAGES_DIR);
  for (const name of rootFiles) {
    if (!name.endsWith(".md") || name.startsWith(".")) continue;
    const fullPath = path.join(WIKI_PAGES_DIR, name);
    const stat = fs.statSync(fullPath);
    files.push({ name, path: name, category: "root", size: stat.size, updatedAt: Math.floor(stat.mtimeMs / 1000) });
  }

  const subDirs = ["concepts", "sources"];
  for (const dir of subDirs) {
    const dirPath = path.join(WIKI_PAGES_DIR, dir);
    for (const name of safeReadDir(dirPath)) {
      if (!name.endsWith(".md") || name.startsWith(".")) continue;
      const fullPath = path.join(dirPath, name);
      const stat = fs.statSync(fullPath);
      files.push({ name, path: `${dir}/${name}`, category: dir, size: stat.size, updatedAt: Math.floor(stat.mtimeMs / 1000) });
    }
  }

  files.sort((a, b) => b.updatedAt - a.updatedAt);

  return NextResponse.json({ files, totalFiles: files.length } satisfies WikiTree);
}
