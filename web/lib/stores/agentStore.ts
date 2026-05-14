import { create } from "zustand";
import { AGENTS, type AgentDef, type AgentStatus } from "@/lib/agents";

type AgentStates = Record<string, AgentStatus>;

interface AgentStore {
  status: AgentStates;
  expression: Record<string, string | null>;
  speaking: Record<string, boolean>;
  lastMessage: Record<string, string>;
  streamLog: Record<string, string>;
  thinkingHint: Record<string, string>;
  durations: Record<string, number>;
  selectedAgent: AgentDef | null;

  setStatus: (agentId: string, s: AgentStatus) => void;
  setAllStatus: (s: AgentStates) => void;
  setExpression: (agentId: string, expr: string | null) => void;
  setSpeaking: (agentId: string, s: boolean) => void;
  setLastMessage: (agentId: string, msg: string) => void;
  appendStream: (agentId: string, chunk: string) => void;
  clearStream: (agentId: string) => void;
  setThinkingHint: (agentId: string, hint: string) => void;
  clearThinkingHint: (agentId: string) => void;
  setDuration: (agentId: string, ms: number) => void;
  setSelectedAgent: (a: AgentDef | null) => void;
  reset: () => void;
}

const initStatus = (): AgentStates =>
  Object.fromEntries(AGENTS.map((a) => [a.id, "idle" as AgentStatus]));

export const useAgentStore = create<AgentStore>((set) => ({
  status: initStatus(),
  expression: {},
  speaking: {},
  lastMessage: {},
  streamLog: {},
  thinkingHint: {},
  durations: {},
  selectedAgent: null,

  setStatus: (agentId, s) =>
    set((st) => ({ status: { ...st.status, [agentId]: s } })),
  setAllStatus: (s) => set({ status: s }),
  setExpression: (agentId, expr) =>
    set((st) => ({ expression: { ...st.expression, [agentId]: expr } })),
  setSpeaking: (agentId, s) =>
    set((st) => ({ speaking: { ...st.speaking, [agentId]: s } })),
  setLastMessage: (agentId, msg) =>
    set((st) => ({ lastMessage: { ...st.lastMessage, [agentId]: msg } })),
  appendStream: (agentId, chunk) =>
    set((st) => ({ streamLog: { ...st.streamLog, [agentId]: (st.streamLog[agentId] ?? "") + chunk } })),
  clearStream: (agentId) =>
    set((st) => ({ streamLog: { ...st.streamLog, [agentId]: "" } })),
  setThinkingHint: (agentId, hint) =>
    set((st) => ({ thinkingHint: { ...st.thinkingHint, [agentId]: hint } })),
  clearThinkingHint: (agentId) =>
    set((st) => { const n = { ...st.thinkingHint }; delete n[agentId]; return { thinkingHint: n }; }),
  setDuration: (agentId, ms) =>
    set((st) => ({ durations: { ...st.durations, [agentId]: ms } })),
  setSelectedAgent: (a) => set({ selectedAgent: a }),
  reset: () => set({
    status: initStatus(), expression: {}, speaking: {},
    lastMessage: {}, streamLog: {}, thinkingHint: {}, durations: {},
  }),
}));
