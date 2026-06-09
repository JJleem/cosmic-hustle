import { existsSync } from "fs";
import { mkdir, readdir, stat, writeFile } from "fs/promises";
import { homedir } from "os";
import path from "path";
import type { HermesRunResult, HermesWorkflowResult } from "@/lib/ops/hermesAgents";

const defaultVaultCandidates = [
  process.env.COSMIC_HUSTLE_VAULT_PATH,
  path.join(homedir(), "Desktop/molt_repository/cosmic-hustle-vault"),
  path.join(homedir(), "Desktop/repository/cosmic-hustle-vault"),
  "/Users/carima_mac/Desktop/repository/cosmic-hustle-vault",
].filter((candidate): candidate is string => Boolean(candidate));

export const obsidianVaultPath =
  defaultVaultCandidates.find((candidate) => existsSync(candidate)) ?? defaultVaultCandidates[0];

export type ObsidianStatus = {
  path: string;
  available: boolean;
  latestHandoffPath: string | null;
};

export async function getObsidianStatus(): Promise<ObsidianStatus> {
  const available = await directoryExists(obsidianVaultPath);
  return {
    path: obsidianVaultPath,
    available,
    latestHandoffPath: available ? await findLatestHandoffPath() : null,
  };
}

export async function writeHermesRunHandoff(run: HermesRunResult): Promise<string> {
  const logsDir = path.join(obsidianVaultPath, "logs");
  const slug = slugify(`${run.agentId}-${run.command}`) || `${run.agentId}-run`;
  const date = formatKstDate(new Date(run.createdAt));
  const fileName = `${date}-${slug}-${run.id.slice(0, 8)}.md`;
  const absolutePath = path.join(logsDir, fileName);
  const relativePath = path.join("logs", fileName);

  await mkdir(logsDir, { recursive: true });
  await writeFile(absolutePath, renderHandoff(run, relativePath), "utf8");
  return relativePath;
}

export async function writeHermesWorkflowHandoff(workflow: HermesWorkflowResult): Promise<string> {
  const logsDir = path.join(obsidianVaultPath, "logs");
  const slug = slugify(`workflow-${workflow.goal}`) || "workflow-run";
  const date = formatKstDate(new Date(workflow.createdAt));
  const fileName = `${date}-${slug}-${workflow.id.slice(0, 8)}.md`;
  const absolutePath = path.join(logsDir, fileName);
  const relativePath = path.join("logs", fileName);

  await mkdir(logsDir, { recursive: true });
  await writeFile(absolutePath, renderWorkflowHandoff(workflow, relativePath), "utf8");
  return relativePath;
}

async function directoryExists(targetPath: string): Promise<boolean> {
  try {
    return (await stat(targetPath)).isDirectory();
  } catch {
    return false;
  }
}

async function findLatestHandoffPath(): Promise<string | null> {
  const logsDir = path.join(obsidianVaultPath, "logs");
  try {
    const entries = await readdir(logsDir, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md")
        .map(async (entry) => {
          const absolutePath = path.join(logsDir, entry.name);
          return {
            name: entry.name,
            mtimeMs: (await stat(absolutePath)).mtimeMs,
          };
        }),
    );
    const latest = files.sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
    return latest ? path.join("logs", latest.name) : null;
  } catch {
    return null;
  }
}

function renderHandoff(run: HermesRunResult, relativePath: string): string {
  const timestamp = formatKstTimestamp(new Date(run.createdAt));
  const title = `Hermes ${run.agentId} Dashboard Run`;

  return [
    "---",
    `title: ${title}`,
    `timestamp: ${timestamp}`,
    `agent: ${run.agentId}`,
    "trigger: dashboard Hermes command launcher",
    "status: success",
    "---",
    "",
    `# ${title}`,
    "",
    "## Trigger",
    "",
    "Dashboard에서 Hermes employee command가 실행됨.",
    "",
    "## CEO Request Or Run Topic",
    "",
    run.command.trim(),
    "",
    "## Agents Involved",
    "",
    `- ${run.agentId}`,
    "",
    "## What Was Done",
    "",
    "Hermes CLI를 통해 단일 employee agent가 실행되었고, 결과가 dashboard local log와 Obsidian handoff note로 기록됨.",
    "",
    "## Result",
    "",
    "````text",
    run.response.trim() || "(empty response)",
    "````",
    "",
    "## Files Or Notes Changed",
    "",
    `- ${relativePath}`,
    "- web/.ops/hermes-runs.jsonl",
    "",
    "## Decisions Made",
    "",
    "- 없음.",
    "",
    "## Open Questions",
    "",
    "- 없음.",
    "",
    "## Next Actions",
    "",
    "- dashboard-managed multi-agent loop로 확장.",
    "- 최종 wiki cleanup step을 자동화.",
    "",
    "## Verification Status",
    "",
    `- Hermes command completed in ${run.durationMs}ms.`,
    run.sessionId ? `- Hermes session: ${run.sessionId}` : "- Hermes session id unavailable.",
    "",
    "## Git Commit Or Push Status",
    "",
    "- Not committed by dashboard run.",
    "",
  ].join("\n");
}

function renderWorkflowHandoff(workflow: HermesWorkflowResult, relativePath: string): string {
  const timestamp = formatKstTimestamp(new Date(workflow.completedAt));
  const title = "Hermes Team Workflow Run";
  const stepLines = workflow.steps.flatMap((step) => [
    `### ${step.agentId} - ${step.status}`,
    "",
    step.error ? `Error: ${step.error}` : "",
    step.run?.response ? "````text" : "",
    step.run?.response?.trim() ?? "",
    step.run?.response ? "````" : "",
    "",
  ]);

  return [
    "---",
    `title: ${title}`,
    `timestamp: ${timestamp}`,
    "trigger: dashboard Hermes workflow",
    `status: ${workflow.status}`,
    "---",
    "",
    `# ${title}`,
    "",
    "## Trigger",
    "",
    "Dashboard에서 팀 실행 workflow가 시작됨.",
    "",
    "## CEO Request Or Run Topic",
    "",
    workflow.goal.trim(),
    "",
    "## Agents Involved",
    "",
    ...workflow.steps.map((step) => `- ${step.agentId}: ${step.status}`),
    "",
    "## What Was Done",
    "",
    "`plan -> run -> wiki` 순서로 앞 단계 결과를 다음 단계 프롬프트에 포함해 전달함.",
    "",
    "## Step Outputs",
    "",
    ...stepLines,
    "## Decisions Made",
    "",
    "- 팀 실행은 dashboard workflow 단위로 기록함.",
    "",
    "## Open Questions",
    "",
    workflow.status === "done" ? "- 없음." : "- 실패한 step의 원인 확인 필요.",
    "",
    "## Next Actions",
    "",
    workflow.nextAction.trim() || "- 다음 action 없음.",
    "",
    "## Files Or Notes Changed",
    "",
    `- ${relativePath}`,
    "- web/.ops/hermes-workflows.jsonl",
    "- web/.ops/hermes-runs.jsonl",
    "",
    "## Verification Status",
    "",
    `- Workflow status: ${workflow.status}`,
    `- Duration: ${workflow.durationMs}ms`,
    "",
    "## Git Commit Or Push Status",
    "",
    "- Not committed by dashboard workflow.",
    "",
  ].join("\n");
}

function formatKstDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatKstTimestamp(date: Date): string {
  return `${new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)} ${new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date)} KST`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}
