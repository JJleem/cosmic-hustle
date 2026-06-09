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
};
