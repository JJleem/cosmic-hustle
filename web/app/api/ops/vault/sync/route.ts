import { execFile } from "child_process";
import { promisify } from "util";
import { obsidianVaultPath } from "@/lib/ops/obsidian";
import { isLocalRequest } from "@/lib/ops/hermes";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

const ALLOWED = /^(logs|projects|knowledge|agents|reports|inbox)\//;
const DENIED = /(\.obsidian\/|\.DS_Store|\.canvas$)/;

export type VaultSyncStatus = {
  vaultPath: string;
  available: boolean;
  pendingFiles: string[];
  canSync: boolean;
};

export type VaultSyncResult = {
  committed: string[];
  pushed: boolean;
  commitMessage: string;
};

function parseGitStatus(output: string): string[] {
  return output
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3).trim())
    .filter((f) => ALLOWED.test(f) && !DENIED.test(f) && f.endsWith(".md"));
}

function buildCommitMessage(files: string[]): string {
  const counts: Record<string, number> = {};
  for (const f of files) {
    const dir = f.split("/")[0];
    counts[dir] = (counts[dir] ?? 0) + 1;
  }
  const parts = Object.entries(counts).map(([dir, n]) => `${dir}(${n})`);
  return `vault sync: ${parts.join(", ")}`;
}

export async function GET(request: Request) {
  if (!isLocalRequest(request)) {
    return Response.json({ error: "local_only" }, { status: 403 });
  }
  try {
    const { stdout } = await execFileAsync("git", ["status", "--porcelain"], {
      cwd: obsidianVaultPath,
    });
    const pendingFiles = parseGitStatus(stdout);
    return Response.json({
      vaultPath: obsidianVaultPath,
      available: true,
      pendingFiles,
      canSync: pendingFiles.length > 0,
    } satisfies VaultSyncStatus);
  } catch {
    return Response.json({
      vaultPath: obsidianVaultPath,
      available: false,
      pendingFiles: [],
      canSync: false,
    } satisfies VaultSyncStatus);
  }
}

export async function POST(request: Request) {
  if (!isLocalRequest(request)) {
    return Response.json({ error: "local_only" }, { status: 403 });
  }

  let pendingFiles: string[];
  try {
    const { stdout } = await execFileAsync("git", ["status", "--porcelain"], {
      cwd: obsidianVaultPath,
    });
    pendingFiles = parseGitStatus(stdout);
  } catch (err) {
    return Response.json(
      { error: "git_status_failed", message: err instanceof Error ? err.message : "git status 실패" },
      { status: 500 },
    );
  }

  if (pendingFiles.length === 0) {
    return Response.json({ error: "nothing_to_sync" }, { status: 400 });
  }

  const commitMessage = buildCommitMessage(pendingFiles);

  try {
    await execFileAsync("git", ["add", "--", ...pendingFiles], { cwd: obsidianVaultPath });
    await execFileAsync("git", ["commit", "-m", commitMessage], { cwd: obsidianVaultPath });
    await execFileAsync("git", ["push"], { cwd: obsidianVaultPath });
    return Response.json({ committed: pendingFiles, pushed: true, commitMessage } satisfies VaultSyncResult);
  } catch (err) {
    const message = err instanceof Error ? err.message : "sync 실패";
    return Response.json({ error: "sync_failed", message }, { status: 500 });
  }
}
