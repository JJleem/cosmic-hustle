import { execFile } from "child_process";
import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import { homedir } from "os";
import path from "path";
import { promisify } from "util";
import type {
  HermesAgentId,
  HermesWorkflowJob,
  HermesWorkflowHistory,
  HermesWorkflowRequest,
  HermesWorkflowResult,
  HermesWorkflowStep,
} from "@/lib/ops/hermesAgents";
import { runHermesAgent } from "@/lib/ops/hermes";
import { getObsidianStatus, writeHermesWorkflowHandoff } from "@/lib/ops/obsidian";

const execFileAsync = promisify(execFile);
const hermesBin = process.env.HERMES_BIN ?? path.join(homedir(), ".local/bin/hermes");

const logDir = path.join(process.cwd(), ".ops");
const workflowLogPath = path.join(logDir, "hermes-workflows.jsonl");
const defaultWorkflowLogLimit = 50;

type HermesWorkflowRuntimeStore = {
  jobs: Map<string, HermesWorkflowJob>;
};

type HermesWorkflowRunOptions = {
  id?: string;
  onUpdate?: (workflow: HermesWorkflowResult) => void;
};

const runtimeStore = getRuntimeStore();

export type { HermesWorkflowHistory, HermesWorkflowJob, HermesWorkflowRequest, HermesWorkflowResult };

function getRuntimeStore(): HermesWorkflowRuntimeStore {
  const globalStore = globalThis as typeof globalThis & {
    __cosmicHermesWorkflowStore?: HermesWorkflowRuntimeStore;
  };
  globalStore.__cosmicHermesWorkflowStore ??= { jobs: new Map() };
  return globalStore.__cosmicHermesWorkflowStore;
}

function createWorkflowShell(
  input: HermesWorkflowRequest,
  id: string | undefined = undefined,
  createdAt = new Date().toISOString(),
  status: HermesWorkflowResult["status"],
): HermesWorkflowResult {
  return {
    id: id ?? randomUUID(),
    goal: input.goal.trim(),
    status,
    steps: [],
    createdAt,
    completedAt: "",
    durationMs: 0,
    nextAction: "",
    vaultNotePath: null,
  };
}

async function executeWorkflowJob(id: string, input: HermesWorkflowRequest): Promise<void> {
  const job = runtimeStore.jobs.get(id);
  if (!job) return;

  job.status = "running";
  job.updatedAt = new Date().toISOString();
  job.workflow.status = "running";

  try {
    const workflow = await runHermesWorkflow(input, {
      id,
      onUpdate: (nextWorkflow) => {
        const activeJob = runtimeStore.jobs.get(id);
        if (!activeJob) return;
        activeJob.workflow = nextWorkflow;
        activeJob.status = nextWorkflow.status;
        activeJob.updatedAt = new Date().toISOString();
        activeJob.currentAgentId = getCurrentAgentId(nextWorkflow.steps);
      },
    });
    job.workflow = workflow;
    job.status = workflow.status;
    job.currentAgentId = null;
    job.completedAt = workflow.completedAt;
    job.updatedAt = workflow.completedAt;
  } catch (error) {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : "Hermes workflow job failed";
    job.currentAgentId = null;
    job.completedAt = new Date().toISOString();
    job.updatedAt = job.completedAt;
    job.workflow.status = "failed";
    job.workflow.completedAt = job.completedAt;
    job.workflow.durationMs = Date.now() - new Date(job.createdAt).getTime();
    job.workflow.nextAction = "실패한 workflow job을 확인하고 같은 목표로 다시 실행한다.";
  }
}

function getActiveWorkflowJobs(): HermesWorkflowJob[] {
  return [...runtimeStore.jobs.values()]
    .filter((job) => job.status === "queued" || job.status === "running")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function createPendingStep(
  agentId: HermesAgentId,
  status: "queued" | "running",
): HermesWorkflowStep {
  return { agentId, status, run: null };
}

function getCurrentAgentId(steps: HermesWorkflowStep[]): HermesAgentId | null {
  return steps.find((step) => step.status === "running")?.agentId ?? null;
}

function cloneWorkflow(workflow: HermesWorkflowResult): HermesWorkflowResult {
  return {
    ...workflow,
    steps: workflow.steps.map((step) => ({ ...step })),
  };
}

export function startHermesWorkflowJob(input: HermesWorkflowRequest): HermesWorkflowJob {
  const id = randomUUID();
  const now = new Date().toISOString();
  const workflow = createWorkflowShell(input, id, now, "queued");
  const job: HermesWorkflowJob = {
    id,
    goal: workflow.goal,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    currentAgentId: null,
    workflow,
  };

  runtimeStore.jobs.set(id, job);
  void executeWorkflowJob(id, input);
  return job;
}

export function getHermesWorkflowJob(id: string): HermesWorkflowJob | null {
  return runtimeStore.jobs.get(id) ?? null;
}

export async function runHermesWorkflow(
  input: HermesWorkflowRequest,
  options: HermesWorkflowRunOptions = {},
): Promise<HermesWorkflowResult> {
  const startedAt = Date.now();
  const workflow = createWorkflowShell(input, options.id, new Date().toISOString(), "running");
  const notify = () => options.onUpdate?.(cloneWorkflow(workflow));

  // 시작 알림
  void sendSlackMessage(`⚙️ *Cosmic Hustle* 작업 시작\n목표: ${workflow.goal}`).catch(() => {});
  notify();

  try {
    workflow.steps.push(createPendingStep("plan", "running"));
    notify();
    const plan = await runStep("plan", buildPlanCommand(input));
    workflow.steps[workflow.steps.length - 1] = plan;
    notify();

    let run: HermesWorkflowStep;
    if (plan.status === "done" && plan.run) {
      workflow.steps.push(createPendingStep("run", "running"));
      notify();
      run = await runStep("run", buildRunCommand(input, plan.run.response));
      workflow.steps[workflow.steps.length - 1] = run;
    } else {
      run = {
        agentId: "run",
        status: "skipped",
        run: null,
        error: "plan step failed, so run step was skipped",
      };
      workflow.steps.push(run);
    }
    notify();

    workflow.steps.push(createPendingStep("wiki", "running"));
    notify();
    const wiki = await runStep("wiki", buildWikiCommand(input, workflow.steps));
    workflow.steps[workflow.steps.length - 1] = wiki;
    notify();

    workflow.status = getWorkflowStatus(workflow.steps);
  } catch (error) {
    // Codex 토큰 소진, 네트워크 오류 등 예상치 못한 에러
    workflow.status = "failed";
    workflow.steps.push({
      agentId: "plan",
      status: "failed",
      run: null,
      error: error instanceof Error ? error.message : "Unexpected workflow error",
    });
    notify();
  }

  workflow.completedAt = new Date().toISOString();
  workflow.durationMs = Date.now() - startedAt;

  const lastWikiStep = workflow.steps.findLast((s) => s.agentId === "wiki");
  workflow.nextAction =
    extractNextAction(lastWikiStep?.run?.response) || fallbackNextAction(workflow);

  try {
    workflow.vaultNotePath = await writeHermesWorkflowHandoff(workflow);
  } catch (error) {
    workflow.vaultNoteError =
      error instanceof Error ? error.message : "Failed to write workflow handoff note";
  }

  await appendWorkflowLog(workflow);

  // 항상 Slack 알림 전송 (완료/중단/실패 모두)
  void sendSlackNotification(workflow).catch(() => {
    // Slack 실패해도 workflow 결과에 영향 없음
  });

  notify();
  return workflow;
}

async function sendSlackMessage(message: string): Promise<void> {
  await execFileAsync(hermesBin, ["send", "--to", "slack:ai-report", message], {
    timeout: 15_000,
  });
}

async function sendSlackNotification(workflow: HermesWorkflowResult): Promise<void> {
  const statusLabel =
    workflow.status === "done"
      ? "✅ 완료"
      : workflow.status === "blocked"
        ? "⏸ 중단"
        : "❌ 실패";

  const durationSec = Math.round(workflow.durationMs / 1000);

  const stepLines = workflow.steps.map((s) => {
    const icon = s.status === "done" ? "✓" : s.status === "failed" ? "✗" : "−";
    const content = s.run?.response ?? s.error ?? "출력 없음";
    const preview = content.replace(/\s+/g, " ").trim().slice(0, 150);
    return `*${icon} ${s.agentId}*\n${preview}${content.length > 150 ? "..." : ""}`;
  });

  const lines = [
    `*Cosmic Hustle* ${statusLabel}`,
    `목표: ${workflow.goal}  ·  소요: ${durationSec}초`,
    "",
    ...stepLines,
    workflow.nextAction ? `\n*다음 액션:* ${workflow.nextAction}` : null,
  ].filter((l) => l !== null) as string[];

  await sendSlackMessage(lines.join("\n"));
}

export async function getHermesWorkflowHistory(limit = 5): Promise<HermesWorkflowHistory> {
  const [workflows, vault] = await Promise.all([readWorkflowLog(limit), getObsidianStatus()]);
  return { workflows, activeJobs: getActiveWorkflowJobs(), vault };
}

async function runStep(
  agentId: "plan" | "run" | "wiki",
  command: string,
): Promise<HermesWorkflowStep> {
  try {
    const run = await runHermesAgent({ agentId, command });
    return { agentId, status: isBlockedResponse(run.response) ? "blocked" : "done", run };
  } catch (error) {
    return {
      agentId,
      status: "failed",
      run: null,
      error: summarizeStepError(error),
    };
  }
}

function summarizeStepError(error: unknown): string {
  if (!(error instanceof Error)) return "Hermes step failed";

  const [firstLine] = error.message.split("\n");
  if (firstLine.startsWith("Command failed:")) {
    return "Hermes step command failed";
  }

  return compactForPrompt(firstLine || "Hermes step failed", 300);
}

function buildPlanCommand(input: HermesWorkflowRequest): string {
  return [
    "팀 실행 workflow의 첫 단계야.",
    `목표: ${input.goal}`,
    `최대 단계 수: ${input.maxSteps ?? 3}`,
    "",
    "run 직원에게 넘길 수 있게 아래 형식으로 짧게 답해줘.",
    "",
    "```json",
    '{ "status": "done | blocked", "summary": "...", "handoff": "...", "next_action": "..." }',
    "```",
  ].join("\n");
}

function buildRunCommand(input: HermesWorkflowRequest, planOutput: string): string {
  return [
    "팀 실행 workflow의 두 번째 단계야.",
    `목표: ${input.goal}`,
    "",
    "앞 단계 plan 요약:",
    compactForPrompt(planOutput, 900),
    "",
    "plan의 handoff를 읽고, 실제 다음 작업 가능성을 짧게 판단해줘.",
    "이 workflow smoke 단계에서는 명령 실행, HTTP 호출, 파일 조회, 파일 수정 없이 답변만 해줘.",
    "",
    'JSON 코드블록 하나로만 답해줘: { "status": "done | blocked", "summary": "...", "handoff": "...", "next_action": "..." }',
  ].join("\n");
}

function buildWikiCommand(input: HermesWorkflowRequest, steps: HermesWorkflowStep[]): string {
  const stepSummary = steps
    .map((step) => {
      const output = step.run?.response ?? step.error ?? "(no output)";
      return [`${step.agentId} - ${step.status}`, compactForPrompt(output, 900)].join("\n");
    })
    .join("\n\n");

  return [
    "팀 실행 workflow의 마지막 정리 단계야.",
    `목표: ${input.goal}`,
    "",
    "앞 단계 결과:",
    stepSummary,
    "",
    "plan과 run이 목표를 향해 이어받아 작업했는지 판정하고, 다음 액션을 정리해줘.",
    "이 workflow 정리 단계에서는 명령 실행, HTTP 호출, 파일 조회, 파일 수정 없이 답변만 해줘.",
    "3줄 이내로 답하되, 가능하면 next_action을 명확히 써줘.",
  ].join("\n");
}

async function appendWorkflowLog(workflow: HermesWorkflowResult): Promise<void> {
  await mkdir(logDir, { recursive: true });
  let existingWorkflows: HermesWorkflowResult[] = [];
  try {
    existingWorkflows = parseWorkflowLog(await readFile(workflowLogPath, "utf8"));
  } catch {
    existingWorkflows = [];
  }

  const nextWorkflows = [...existingWorkflows, workflow].slice(-defaultWorkflowLogLimit);
  await writeFile(
    workflowLogPath,
    `${nextWorkflows.map((item) => JSON.stringify(item)).join("\n")}\n`,
    "utf8",
  );
}

async function readWorkflowLog(limit: number): Promise<HermesWorkflowResult[]> {
  try {
    const content = await readFile(workflowLogPath, "utf8");
    return parseWorkflowLog(content).reverse().slice(0, limit);
  } catch {
    return [];
  }
}

function parseWorkflowLog(content: string): HermesWorkflowResult[] {
  return content
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as HermesWorkflowResult);
}

function extractNextAction(response: string | undefined): string {
  if (!response) return "";
  const match = response.match(/next_action["']?\s*[:：]\s*["']?([^"',\n}]+)/i);
  return match?.[1]?.trim() ?? "";
}

function fallbackNextAction(workflow: HermesWorkflowResult): string {
  if (workflow.status === "done") {
    return "다음 workflow를 실행하거나, 이 workflow를 대시보드에서 검토한다.";
  }
  if (workflow.status === "blocked") {
    return "blocked step의 next_action을 확인하고 같은 목표로 이어서 실행한다.";
  }
  return "실패한 step을 확인하고 같은 목표로 다시 실행한다.";
}

function compactForPrompt(value: string, maxLength: number): string {
  const compacted = value
    .replace(/````[a-z]*\n?/gi, "")
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (compacted.length <= maxLength) {
    return compacted;
  }
  return `${compacted.slice(0, maxLength)}...`;
}

function getWorkflowStatus(steps: HermesWorkflowStep[]): HermesWorkflowResult["status"] {
  if (steps.some((step) => step.status === "failed")) {
    return "failed";
  }
  if (steps.some((step) => step.status === "blocked" || step.status === "skipped")) {
    return "blocked";
  }
  return "done";
}

function isBlockedResponse(response: string): boolean {
  return /["']?status["']?\s*[:：]\s*["']?blocked/i.test(response);
}
