import { create } from "zustand";
import type { Report } from "@/lib/reportUtils";
import type { Idea } from "@/components/AgentWorkspace";
import type { ProjectRecord } from "@/components/dashboard/ProjectHistory";
import type { Handoff } from "@/lib/types";

type ChatEntry = { id: string; agentId: string; text: string; at: Date };
type DraftVersion = { version: number; content: string; prevFeedback: string };

export type AgentTokenUsage = {
  agentId: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
  model: string;
};

export type TokenUsageSummary = {
  agents: AgentTokenUsage[];
  total: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number; costUsd: number };
};

interface DataStore {
  reports: Report[];
  history: ProjectRecord[];
  handoffs: Handoff[];
  pingIdeas: Idea[];
  chatFeed: ChatEntry[];
  reportDrafts: Record<string, string>;
  liveDraft: { agentId: string; topic: string; content: string } | null;
  draftVersions: DraftVersion[];
  lastTokenUsage: TokenUsageSummary | null;

  setReports: (r: Report[]) => void;
  addReport: (r: Report) => void;
  updateReport: (r: Report) => void;
  deleteReport: (id: string) => void;
  setHistory: (h: ProjectRecord[]) => void;
  addHistory: (h: ProjectRecord) => void;
  addHandoff: (h: Handoff) => void;
  setPingIdeas: (ideas: Idea[]) => void;
  addChat: (entry: ChatEntry) => void;
  setReportDraft: (reportId: string, draft: string) => void;
  setLiveDraft: (d: { agentId: string; topic: string; content: string } | null) => void;
  addDraftVersion: (v: DraftVersion) => void;
  setLastTokenUsage: (u: TokenUsageSummary | null) => void;
  reset: () => void;
}

export const useDataStore = create<DataStore>((set) => ({
  reports: [],
  history: [],
  handoffs: [],
  pingIdeas: [],
  chatFeed: [],
  reportDrafts: {},
  liveDraft: null,
  draftVersions: [],
  lastTokenUsage: null,

  setReports: (r) => set({ reports: r }),
  addReport: (r) => set((st) => ({ reports: [r, ...st.reports] })),
  updateReport: (r) => set((st) => ({ reports: st.reports.map((x) => x.id === r.id ? r : x) })),
  deleteReport: (id) => set((st) => ({ reports: st.reports.filter((r) => r.id !== id) })),
  setHistory: (h) => set({ history: h }),
  addHistory: (h) => set((st) =>
    st.history.some((x) => x.id === h.id) ? st : { history: [h, ...st.history] }),
  addHandoff: (h) => set((st) => ({ handoffs: [h, ...st.handoffs].slice(0, 20) })),
  setPingIdeas: (ideas) => set({ pingIdeas: ideas }),
  addChat: (entry) => set((st) => {
    const next = [...st.chatFeed, entry];
    return { chatFeed: next.length > 60 ? next.slice(-60) : next };
  }),
  setReportDraft: (reportId, draft) =>
    set((st) => ({ reportDrafts: { ...st.reportDrafts, [reportId]: draft } })),
  setLiveDraft: (d) => set({ liveDraft: d }),
  addDraftVersion: (v) => set((st) => {
    const filtered = st.draftVersions.filter((x) => x.version !== v.version);
    return { draftVersions: [...filtered, v].sort((a, b) => a.version - b.version) };
  }),
  setLastTokenUsage: (u) => set({ lastTokenUsage: u }),
  reset: () => set({
    handoffs: [], pingIdeas: [], chatFeed: [],
    reportDrafts: {}, liveDraft: null, draftVersions: [],
  }),
}));
