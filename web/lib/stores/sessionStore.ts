import { create } from "zustand";
import type { CeoCheckinState } from "@/components/CeoCheckin";

type Phase = "idle" | "working" | "done";
type Mode = "background" | "checkin" | "full";
type DrawerTab = "reports" | "history" | "memos" | "team";

interface SessionStore {
  phase: Phase;
  topic: string;
  currentMode: Mode;
  initialTopic: string;
  ceoCheckin: CeoCheckinState | null;
  resumeInfo: { sessionId: string; topic: string } | null;
  pausedInfo: { sessionId: string; topic: string } | null;
  researchError: { title: string; detail: string } | null;
  sideDrawerOpen: boolean;
  sideDrawerTab: DrawerTab;
  showSettings: boolean;
  showSetup: boolean;

  setPhase: (p: Phase) => void;
  setTopic: (t: string) => void;
  setMode: (m: Mode) => void;
  setInitialTopic: (t: string) => void;
  setCeoCheckin: (c: CeoCheckinState | null) => void;
  setResumeInfo: (r: { sessionId: string; topic: string } | null) => void;
  setPausedInfo: (p: { sessionId: string; topic: string } | null) => void;
  setError: (e: { title: string; detail: string } | null) => void;
  setSideDrawerOpen: (o: boolean) => void;
  setSideDrawerTab: (t: DrawerTab) => void;
  setShowSettings: (s: boolean) => void;
  setShowSetup: (s: boolean) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  phase: "idle",
  topic: "",
  currentMode: "checkin",
  initialTopic: "",
  ceoCheckin: null,
  resumeInfo: null,
  pausedInfo: null,
  researchError: null,
  sideDrawerOpen: false,
  sideDrawerTab: "reports",
  showSettings: false,
  showSetup: false,

  setPhase: (p) => set({ phase: p }),
  setTopic: (t) => set({ topic: t }),
  setMode: (m) => set({ currentMode: m }),
  setInitialTopic: (t) => set({ initialTopic: t }),
  setCeoCheckin: (c) => set({ ceoCheckin: c }),
  setResumeInfo: (r) => set({ resumeInfo: r }),
  setPausedInfo: (p) => set({ pausedInfo: p }),
  setError: (e) => set({ researchError: e }),
  setSideDrawerOpen: (o) => set({ sideDrawerOpen: o }),
  setSideDrawerTab: (t) => set({ sideDrawerTab: t }),
  setShowSettings: (s) => set({ showSettings: s }),
  setShowSetup: (s) => set({ showSetup: s }),
  reset: () => set({
    phase: "idle", topic: "", currentMode: "checkin",
    initialTopic: "", ceoCheckin: null, researchError: null,
  }),
}));
