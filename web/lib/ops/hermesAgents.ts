export const HERMES_AGENT_IDS = ["plan", "run", "wiki"] as const;

export type HermesAgentId = (typeof HERMES_AGENT_IDS)[number];

export type HermesRunRequest = {
  agentId: HermesAgentId;
  command: string;
};

export type HermesRunResult = {
  id: string;
  agentId: HermesAgentId;
  command: string;
  response: string;
  sessionId: string | null;
  createdAt: string;
  durationMs: number;
  vaultNotePath: string | null;
  vaultNoteError?: string;
};

export type HermesRunHistory = {
  runs: HermesRunResult[];
  vault: {
    path: string;
    available: boolean;
    latestHandoffPath: string | null;
  };
};

export type HermesWorkflowRequest = {
  goal: string;
  maxSteps?: number;
  async?: boolean;
};

export type HermesWorkflowStep = {
  agentId: HermesAgentId;
  status: "queued" | "running" | "done" | "blocked" | "failed" | "skipped";
  run: HermesRunResult | null;
  error?: string;
};

export type HermesWorkflowStatus = "queued" | "running" | "done" | "blocked" | "failed";

export type HermesWorkflowResult = {
  id: string;
  goal: string;
  status: HermesWorkflowStatus;
  steps: HermesWorkflowStep[];
  createdAt: string;
  completedAt: string;
  durationMs: number;
  nextAction: string;
  vaultNotePath: string | null;
  vaultNoteError?: string;
};

export type HermesWorkflowJob = {
  id: string;
  goal: string;
  status: HermesWorkflowStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  currentAgentId: HermesAgentId | null;
  workflow: HermesWorkflowResult;
  error?: string;
};

export type HermesWorkflowHistory = {
  workflows: HermesWorkflowResult[];
  activeJobs: HermesWorkflowJob[];
  vault: {
    path: string;
    available: boolean;
    latestHandoffPath: string | null;
  };
};
