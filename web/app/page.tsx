"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { BookOpen, Settings, X } from "lucide-react";
import AgentImage from "@/components/AgentImage";
import BottomAgentBar from "@/components/BottomAgentBar";
import AgentFullScreen from "@/components/AgentFullScreen";
import StarField from "@/components/StarField";
import OfficePage from "@/components/OfficePage";
import ProjectWorkView from "@/components/ProjectWorkView";
import { Idea } from "@/components/AgentWorkspace";
import ProjectSetupModal, { ProjectConfig } from "@/components/ProjectSetupModal";
import ReportBoard from "@/components/dashboard/ReportBoard";
import { type Report } from "@/lib/reportUtils";
import HistoryIdeaPanel from "@/components/dashboard/HistoryIdeaPanel";
import { ProjectRecord } from "@/components/dashboard/ProjectHistory";
import MemoWikiPanel from "@/components/dashboard/MemoWikiPanel";
import AgentSettingsPage from "@/components/AgentSettingsPage";
import CeoCheckin, { type CeoCheckinState } from "@/components/CeoCheckin";
import TeamRoster from "@/components/TeamRoster";
import { AGENTS, PIPELINE, AgentStatus, AgentDef } from "@/lib/agents";
import { AllAgentSettings, loadAgentSettings } from "@/lib/agentSettings";

type DrawerTab = "reports" | "history" | "memos" | "team";

type AgentStates = Record<string, AgentStatus>;

export type Handoff = {
  id: string;
  fromId: string;
  toId: string;
  message: string;
  at: Date;
};

const initStatus = (): AgentStates =>
  Object.fromEntries(AGENTS.map((a) => [a.id, "idle"]));

const uid = () => crypto.randomUUID();

export default function Home() {
  const [sideDrawerOpen, setSideDrawerOpen] = useState(false);
  const [sideDrawerTab, setSideDrawerTab] = useState<DrawerTab>("reports");
  const [showSettings, setShowSettings] = useState(false);
  const [agentSettings, setAgentSettings] = useState<AllAgentSettings>({});

  useEffect(() => {
    setAgentSettings(loadAgentSettings());
  }, []);
  const [agentStatus, setAgentStatus] = useState<AgentStates>(initStatus());
  const [agentExpression, setAgentExpression] = useState<Record<string, string | null>>({});
  const [speaking, setSpeaking] = useState<Record<string, boolean>>({});
  const [lastMessage, setLastMessage] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<"idle" | "working" | "done">("idle");
  const [topic, setTopic] = useState("");
  const [showSetup, setShowSetup] = useState(false);
  const [initialTopic, setInitialTopic] = useState("");
  const [reports, setReports] = useState<Report[]>([]);
  const [history, setHistory] = useState<ProjectRecord[]>([]);
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [pingIdeas, setPingIdeas] = useState<Idea[]>([]);
  const [streamLog, setStreamLog] = useState<Record<string, string>>({});
  const [chatFeed, setChatFeed] = useState<Array<{ id: string; agentId: string; text: string; at: Date }>>([]);
  const [ceoCheckin, setCeoCheckin] = useState<CeoCheckinState | null>(null);
  const [currentMode, setCurrentMode] = useState<"background" | "checkin" | "full">("checkin");

  const idleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 언마운트 시 인터벌/타이머 전체 정리
  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (idleTimerRef.current) clearInterval(idleTimerRef.current);
    Object.values(speakTimers.current).forEach(clearTimeout);
  }, []);
  const sessionIdRef = useRef("");
  const sessionStartTsRef = useRef(0);
  const pendingDraftsRef = useRef<Record<string, string>>({});
  const [reportDrafts, setReportDrafts] = useState<Record<string, string>>({});
  const [liveDraft, setLiveDraft] = useState<{ agentId: string; topic: string; content: string } | null>(null);
  const [thinkingHint, setThinkingHint] = useState<Record<string, string>>({});
  const [draftVersions, setDraftVersions] = useState<Array<{ version: number; content: string; prevFeedback: string }>>([]);
  // agentId → 소요 ms (agent_start ts 기록 후 agent_done 에서 계산)
  const agentStartTs = useRef<Record<string, number>>({});
  const [agentDurations, setAgentDurations] = useState<Record<string, number>>({});
  const [resumeInfo, setResumeInfo] = useState<{ sessionId: string; topic: string } | null>(null);
  const [pausedInfo, setPausedInfo] = useState<{ sessionId: string; topic: string } | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentDef | null>(null);
  const [researchError, setResearchError] = useState<{ title: string; detail: string } | null>(null);
  const [errorTyped, setErrorTyped] = useState("");

  // 에러 배너 타이핑 효과
  useEffect(() => {
    if (!researchError) { setErrorTyped(""); return; }
    const full = researchError.detail ? `${researchError.title} — ${researchError.detail}` : researchError.title;
    setErrorTyped("");
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setErrorTyped(full.slice(0, i));
      if (i >= full.length) clearInterval(timer);
    }, 28);
    return () => clearInterval(timer);
  }, [researchError]);

  // DB에서 초기 데이터 로드
  useEffect(() => {
    Promise.all([
      fetch("/api/reports").then((r) => r.json()),
      fetch("/api/sessions").then((r) => r.json()),
    ]).then(([dbReports, dbSessions]) => {
      if (Array.isArray(dbReports)) {
        setReports(
          (dbReports as Array<{ id: string; sessionId?: string; agentId: string; topic: string; content: string; createdAt: number }>)
            .map((r) => ({ ...r, createdAt: new Date((typeof r.createdAt === "number" ? r.createdAt : 0) * 1000) }))
        );
      }
      if (Array.isArray(dbSessions)) {
        setHistory(
          (dbSessions as Array<{ id: string; topic: string; completedAt: number | null }>)
            .filter((s) => typeof s.completedAt === "number")
            .map((s) => ({ id: s.id, topic: s.topic, completedAt: new Date((s.completedAt as number) * 1000) }))
        );
      }
    }).catch(() => { /* DB 로드 실패 시 빈 상태 유지 */ });
  }, []);

  // 이전 세션 이어서 보기 체크
  useEffect(() => {
    const stored = localStorage.getItem("cosmicHustleSession");
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as { sessionId: string; topic: string };
      fetch(`/api/research/${parsed.sessionId}/events`)
        .then((r) => r.json())
        .then((data: { status: string }) => {
          if (data.status === "working" || data.status === "done") {
            setResumeInfo(parsed);
          } else if (data.status === "paused") {
            setPausedInfo(parsed);
            localStorage.removeItem("cosmicHustleSession");
          } else {
            localStorage.removeItem("cosmicHustleSession");
          }
        })
        .catch(() => localStorage.removeItem("cosmicHustleSession"));
    } catch {
      localStorage.removeItem("cosmicHustleSession");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const speakTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const speak = useCallback((agentId: string, message: string) => {
    setLastMessage((prev) => ({ ...prev, [agentId]: message }));
    setSpeaking((prev) => ({ ...prev, [agentId]: true }));
    // 이전 타이머 취소 후 새로 시작 (중복 타이머 방지)
    if (speakTimers.current[agentId]) clearTimeout(speakTimers.current[agentId]);
    speakTimers.current[agentId] = setTimeout(() => {
      setSpeaking((prev) => ({ ...prev, [agentId]: false }));
    }, 2500);
  }, []);

  // idle 랜덤 중얼거림
  useEffect(() => {
    if (phase !== "idle") return;
    const tick = () => {
      const agent = AGENTS[Math.floor(Math.random() * AGENTS.length)];
      const msg = agent.idleMessages[Math.floor(Math.random() * agent.idleMessages.length)];
      speak(agent.id, msg);
    };
    tick();
    idleTimerRef.current = setInterval(tick, 3000);
    return () => { if (idleTimerRef.current) clearInterval(idleTimerRef.current); };
  }, [phase, speak]);

  const addChat = useCallback((agentId: string, text: string) => {
    setChatFeed((prev) => {
      const next = [...prev, { id: crypto.randomUUID(), agentId, text, at: new Date() }];
      return next.length > 60 ? next.slice(-60) : next;
    });
  }, []);

  const handleSSE = useCallback(
    (event: Record<string, unknown>, inputTopic: string) => {
      switch (event.type) {
        case "session_start":
          sessionIdRef.current = event.sessionId as string;
          sessionStartTsRef.current = Date.now();
          localStorage.setItem("cosmicHustleSession", JSON.stringify({
            sessionId: event.sessionId,
            topic: inputTopic,
          }));
          break;
        case "agent_start":
          setAgentStatus((prev) => ({ ...prev, [event.agentId as string]: "active" }));
          setStreamLog((prev) => ({ ...prev, [event.agentId as string]: "" }));
          setThinkingHint((prev) => { const n = { ...prev }; delete n[event.agentId as string]; return n; });
          speak(event.agentId as string, event.message as string);
          addChat(event.agentId as string, `[시작] ${event.message as string}`);
          agentStartTs.current[event.agentId as string] = (event.ts as number | undefined) ?? Date.now();
          break;
        case "agent_message":
          speak(event.agentId as string, event.message as string);
          addChat(event.agentId as string, event.message as string);
          break;
        case "agent_stream":
          setStreamLog((prev) => ({
            ...prev,
            [event.agentId as string]: (prev[event.agentId as string] ?? "") + (event.chunk as string),
          }));
          break;
        case "agent_thinking":
          speak(event.agentId as string, "...");
          setThinkingHint((prev) => ({ ...prev, [event.agentId as string]: event.chunk as string }));
          break;
        case "agent_done": {
          const doneId = event.agentId as string;
          setAgentStatus((prev) => ({ ...prev, [doneId]: "done" }));
          speak(doneId, event.message as string);
          addChat(doneId, `[완료] ${event.message as string}`);
          if (agentStartTs.current[doneId]) {
            const elapsed = ((event.ts as number | undefined) ?? Date.now()) - agentStartTs.current[doneId];
            setAgentDurations((prev) => ({ ...prev, [doneId]: elapsed }));
          }
          // 파이프라인에서 다음 스테이지 찾아 핸드오프 기록
          const stageIdx = PIPELINE.findIndex((s) => s.ids.includes(doneId));
          const nextStage = stageIdx !== -1 ? PIPELINE[stageIdx + 1] : null;
          if (nextStage) {
            setHandoffs((prev) => [
              {
                id: uid(),
                fromId: doneId,
                toId: nextStage.ids[0],
                message: (event.message as string) ?? "",
                at: new Date(),
              },
              ...prev,
            ].slice(0, 20));
          }
          break;
        }
        case "agent_expression":
          setAgentExpression((prev) => ({ ...prev, [event.agentId as string]: (event.expression as string | null) ?? null }));
          break;
        case "draft_report":
          pendingDraftsRef.current[event.agentId as string] = event.content as string;
          setLiveDraft({ agentId: event.agentId as string, topic: event.topic as string, content: event.content as string });
          break;
        case "report_version":
          setDraftVersions((prev) => {
            const v = event.version as number;
            const filtered = prev.filter((x) => x.version !== v);
            return [...filtered, { version: v, content: event.content as string, prevFeedback: (event.prevFeedback as string) ?? "" }].sort((a, b) => a.version - b.version);
          });
          break;
        case "report": {
          const rId = (event.reportId as string) ?? uid();
          setReports((prev) => [
            {
              id: rId,
              sessionId: sessionIdRef.current || undefined,
              agentId: event.agentId as string,
              topic: (event.topic as string) ?? inputTopic,
              content: event.content as string,
              createdAt: new Date(),
            },
            ...prev,
          ]);
          const draft = pendingDraftsRef.current[event.agentId as string];
          if (draft) {
            setReportDrafts((prev) => ({ ...prev, [rId]: draft }));
            delete pendingDraftsRef.current[event.agentId as string];
          }
          break;
        }
        case "ping_ideas":
          setPingIdeas((event.ideas as Idea[]) ?? []);
          break;
        case "clarify_request":
          setCeoCheckin({
            type: "clarify_request",
            sessionId: event.sessionId as string,
            agentId: "plan",
            questions: event.questions as string[],
          });
          break;
        case "ceo_checkin":
          setCeoCheckin({
            type: "ceo_checkin",
            sessionId: event.sessionId as string,
            agentId: event.agentId as string,
            summary: event.summary as string,
            keyFacts: event.keyFacts as string[],
          });
          break;
        case "complete": {
          const completedSid = sessionIdRef.current;
          setHistory((prev) => {
            if (prev.some((h) => h.id === completedSid)) return prev;
            return [{ id: completedSid || uid(), topic: inputTopic, completedAt: new Date() }, ...prev];
          });
          localStorage.removeItem("cosmicHustleSession");
          setPhase("done");
          speak("wiki", "리서치 완료. 보고서가 준비됐어요.");
          if (Notification.permission === "granted") {
            new Notification("🪐 Cosmic Hustle", {
              body: `"${inputTopic}" 리서치가 완료됐어요. 보고서를 확인하세요.`,
              icon: "/favicon.ico",
            });
          }
          break;
        }
        case "error": {
          const errMsg = (event.message as string) ?? "파이프라인 오류가 발생했어요.";
          setResearchError({ title: "파이프라인 오류", detail: errMsg });
          addChat("root", `[오류] ${errMsg}`);
          setAgentStatus((prev) => ({ ...prev, root: "active" }));
          speak("root", `🚨 ${errMsg}`);
          setTimeout(() => {
            setAgentStatus(initStatus());
            setPhase("idle");
            setTopic("");
          }, 3000);
          break;
        }
      }
    },
    [speak, addChat],
  );

  const runResearch = async (config: ProjectConfig) => {
    if (idleTimerRef.current) clearInterval(idleTimerRef.current);
    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }
    setShowSetup(false);
    setPhase("working");
    setCurrentMode(config.mode);
    setTopic(config.topic);
    // 활성화된 에이전트만 waiting, 나머지는 idle 유지
    const enabledIds = new Set(config.agentConfigs.filter((c) => c.enabled).map((c) => c.agentId));
    setAgentStatus(Object.fromEntries(AGENTS.map((a) => [a.id, enabledIds.has(a.id) ? "waiting" : "disabled"])));

    const abort = new AbortController();
    abortRef.current = abort;

    const showError = (title: string, detail: string) => {
      setResearchError({ title, detail });
      addChat("root", `[오류] ${title}${detail ? ` — ${detail}` : ""}`);
      // 루트를 잠깐 active로 → talk 애니메이션 트리거
      setAgentStatus((prev) => ({ ...prev, root: "active" }));
      speak("root", `🚨 ${title}`);
      setTimeout(() => {
        setAgentStatus(initStatus());
        setPhase("idle");
        setTopic("");
      }, 3000);
    };

    let errorHandled = false;
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: config.topic, taskTypeId: config.taskTypeId, agentConfigs: config.agentConfigs, mode: config.mode, reportStyle: config.reportStyle }),
        signal: abort.signal,
      });

      if (!res.ok || !res.body) {
        let title = `서버 오류 (${res.status})`;
        let detail = "";
        try {
          const body = await res.json() as Record<string, unknown>;
          if (res.status === 503) { title = "백엔드 서버에 연결할 수 없어요."; detail = "터미널에서 `cd backend && .venv/bin/python run.py` 로 서버를 켜주세요."; }
          else if (res.status === 502) { title = "백엔드 오류가 발생했어요."; detail = String(body.upstreamStatus ?? ""); }
          else if (res.status === 422) { title = "요청 형식이 올바르지 않아요."; }
          else { detail = String(body.detail ?? body.message ?? `HTTP ${res.status}`); }
        } catch { /* ignore */ }
        errorHandled = true;
        showError(title, detail);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            handleSSE(event, config.topic);
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        errorHandled = true;
        showError("예기치 않은 오류", (err as Error).message ?? "알 수 없는 오류");
      }
    } finally {
      abortRef.current = null;
      // showError가 호출됐으면 3초 타이머가 idle로 전환 — 여기서 override 금지
      if (!errorHandled) {
        setPhase((p) => p === "working" ? "done" : p);
      }
    }
  };

  const resumeSession = async ({ sessionId, topic: resumeTopic }: { sessionId: string; topic: string }) => {
    setResumeInfo(null);
    let status: string;
    let events: Array<{ seq: number; event: Record<string, unknown> }>;
    try {
      const res = await fetch(`/api/research/${sessionId}/events`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { status: string; events: Array<{ seq: number; event: Record<string, unknown> }> };
      status = data.status;
      events = data.events;
    } catch (err) {
      console.error("[resumeSession] fetch failed:", err);
      localStorage.removeItem("cosmicHustleSession");
      return;
    }

    if (status === "cancelled" || status === "error") {
      localStorage.removeItem("cosmicHustleSession");
      return;
    }

    // 이벤트 배치 재생 — 최종 상태 계산
    const newStatus: AgentStates = Object.fromEntries(AGENTS.map((a) => [a.id, "waiting"]));
    const newStreamLog: Record<string, string> = {};
    const newLastMsg: Record<string, string> = {};
    const newReports: Report[] = [];
    const newIdeas: Idea[] = [];
    let lastCheckin: CeoCheckinState | null = null;

    for (const { event: e } of events) {
      switch (e.type) {
        case "agent_start":
          newStatus[e.agentId as string] = "active";
          newStreamLog[e.agentId as string] = "";
          newLastMsg[e.agentId as string] = e.message as string;
          lastCheckin = null; // 파이프라인이 체크인 이후에도 계속됨
          break;
        case "agent_done":
          newStatus[e.agentId as string] = "done";
          newLastMsg[e.agentId as string] = e.message as string;
          break;
        case "agent_stream":
          newStreamLog[e.agentId as string] = (newStreamLog[e.agentId as string] ?? "") + (e.chunk as string);
          break;
        case "agent_message":
          newLastMsg[e.agentId as string] = e.message as string;
          break;
        case "report":
          newReports.push({
            id: e.reportId as string,
            agentId: e.agentId as string,
            topic: (e.topic as string) ?? resumeTopic,
            content: e.content as string,
            createdAt: new Date(),
          });
          break;
        case "ping_ideas":
          newIdeas.push(...(e.ideas as Idea[]));
          break;
        case "agent_expression":
          // 재개 시점에는 expression 상태 복원 불필요 (휘발성)
          break;
        case "agent_thinking":
          // thinking은 재생 불필요
          break;
        case "draft_report":
          // 재개 시 draft는 스킵 (이후 report 이벤트로 최종본 복원)
          break;
        case "complete":
          // done 상태 복원 시 히스토리 항목 추가
          break;
        case "clarify_request":
          lastCheckin = { type: "clarify_request", sessionId, agentId: "plan", questions: e.questions as string[] };
          break;
        case "ceo_checkin":
          lastCheckin = { type: "ceo_checkin", sessionId, agentId: e.agentId as string, summary: e.summary as string, keyFacts: e.keyFacts as string[] };
          break;
      }
    }

    setAgentStatus(newStatus);
    setStreamLog(newStreamLog);
    setLastMessage(newLastMsg);
    setReports((prev) => [...newReports.filter((r) => !prev.some((p) => p.id === r.id)), ...prev]);
    setPingIdeas(newIdeas);
    setTopic(resumeTopic);
    setPhase(status === "done" ? "done" : "working");
    sessionIdRef.current = sessionId;

    if (status !== "working") {
      localStorage.removeItem("cosmicHustleSession");
      if (status === "done") {
        setHistory((prev) => {
          if (prev.some((h) => h.id === sessionId)) return prev;
          return [{ id: sessionId, topic: resumeTopic, completedAt: new Date() }, ...prev];
        });
      }
      return;
    }

    // 체크인 대기 중이면 UI 복원
    if (lastCheckin) setCeoCheckin(lastCheckin);

    // 새 이벤트 폴링 시작
    let lastSeq = events.length > 0 ? events[events.length - 1].seq : 0;
    let isPolling = false;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      if (isPolling) return;
      isPolling = true;
      fetch(`/api/research/${sessionId}/events?since=${lastSeq}`)
        .then((r) => r.json())
        .then((data: { status: string; events: Array<{ seq: number; event: Record<string, unknown> }> }) => {
          for (const { seq, event } of data.events) {
            handleSSE(event, resumeTopic);
            lastSeq = seq;
          }
          if (data.status !== "working") {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            if (data.status === "done") {
              localStorage.removeItem("cosmicHustleSession");
            }
          }
        })
        .catch(() => { /* 네트워크 오류 무시 */ })
        .finally(() => { isPolling = false; });
    }, 3000);
  };

  const handleCeoResponse = async (sessionId: string, response: string) => {
    await fetch(`/api/research/${sessionId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response }),
    });
    setCeoCheckin(null);
  };

  const stopResearch = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    const sId = sessionIdRef.current;
    if (sId) {
      void fetch(`/api/research/${sId}/cancel`, { method: "POST" });
      sessionIdRef.current = "";
    }
    localStorage.removeItem("cosmicHustleSession");
    reset();
  };

  const pauseResearch = () => {
    const sId = sessionIdRef.current;
    if (!sId) return;
    const currentTopic = topic;
    void fetch(`/api/research/${sId}/pause`, { method: "POST" });
    abortRef.current?.abort();
    abortRef.current = null;
    setPausedInfo({ sessionId: sId, topic: currentTopic });
    sessionIdRef.current = "";
    localStorage.removeItem("cosmicHustleSession");
    reset();
  };

  const restartFromPaused = async (info: { sessionId: string; topic: string }) => {
    setPausedInfo(null);
    if (idleTimerRef.current) clearInterval(idleTimerRef.current);
    setPhase("working");
    setTopic(info.topic);
    setAgentStatus(Object.fromEntries(AGENTS.map((a) => [a.id, "waiting"])));

    const abort = new AbortController();
    abortRef.current = abort;

    const showError = (title: string, detail: string) => {
      setResearchError({ title, detail });
      addChat("root", `[오류] ${title}`);
      setAgentStatus((prev) => ({ ...prev, root: "active" }));
      speak("root", `🚨 ${title}`);
      setTimeout(() => { setAgentStatus(initStatus()); setPhase("idle"); setTopic(""); }, 3000);
    };

    let errorHandled = false;
    try {
      const res = await fetch(`/api/research/${info.sessionId}/restart`, {
        method: "POST",
        signal: abort.signal,
      });
      if (!res.ok || !res.body) {
        errorHandled = true;
        showError(`재시작 오류 (${res.status})`, "체크포인트를 찾을 수 없어요. 새 임무를 시작해주세요.");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try { handleSSE(JSON.parse(line.slice(6)), info.topic); } catch { /* ignore */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        errorHandled = true;
        showError("재시작 오류", (err as Error).message);
      }
    } finally {
      abortRef.current = null;
      if (!errorHandled) setPhase((p) => p === "working" ? "done" : p);
    }
  };

  const reset = () => {
    setAgentStatus(initStatus());
    setAgentExpression({});
    setSpeaking({});
    setLastMessage({});
    setPhase("idle");
    setTopic("");
    setInitialTopic("");
    setHandoffs([]);
    setStreamLog({});
    setChatFeed([]);
    setCeoCheckin(null);
    setCurrentMode("checkin");
    setReportDrafts({});
    setLiveDraft(null);
    setResearchError(null);
    setThinkingHint({});
    setDraftVersions([]);
    pendingDraftsRef.current = {};
    agentStartTs.current = {};
    sessionStartTsRef.current = 0;
    setAgentDurations({});
  };

  return (
    <div className="h-dvh cosmic-bg text-white flex flex-col overflow-hidden" style={{ position: "relative" }}>
      <StarField />

      {/* 헤더 */}
      <header className="shrink-0 px-6 py-2.5 flex items-center gap-3" style={{ position: "relative", zIndex: 10, borderBottom: "1px solid rgba(99,60,220,0.12)", background: "rgba(5,7,20,0.88)", backdropFilter: "blur(24px)", boxShadow: "0 1px 0 rgba(139,92,246,0.07), 0 4px 24px rgba(0,0,0,0.4)" }}>
        <div className="flex items-center gap-2.5">
          <span className="text-base animate-float-slow" style={{ display: "inline-block" }}>🪐</span>
          <h1
            className="text-sm font-bold tracking-[0.32em] animate-flicker"
            style={{ background: "linear-gradient(90deg, #ddd6fe 0%, #a5b4fc 40%, #c4b5fd 70%, #93c5fd 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", textShadow: "0 0 20px rgba(139,92,246,0.3)" }}
          >
            COSMIC HUSTLE
          </h1>
        </div>

        {/* 진행 중 임무 */}
        {phase === "working" && topic && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs min-w-0" style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.18)" }}>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="text-emerald-300/80 truncate font-medium" style={{ maxWidth: "min(180px, 18vw)" }}>{topic}</span>
            <button
              onClick={pauseResearch}
              className="ml-0.5 w-4 h-4 flex items-center justify-center rounded text-slate-500 hover:text-amber-400 transition-colors text-[10px] shrink-0"
              title="일시정지"
            >
              ⏸
            </button>
            <button
              onClick={stopResearch}
              className="w-4 h-4 flex items-center justify-center rounded text-slate-500 hover:text-red-400 transition-colors text-[10px] shrink-0"
              title="중단"
            >
              ■
            </button>
          </div>
        )}

        {phase === "done" && (
          <button
            onClick={reset}
            className="text-xs text-slate-500 hover:text-slate-300 rounded-full px-3 py-1.5 transition-all"
            style={{ border: "1px solid rgba(255,255,255,0.07)" }}
          >
            초기화
          </button>
        )}

        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {/* 사령부 서랍 */}
          <button
            onClick={() => setSideDrawerOpen((o) => !o)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all"
            style={sideDrawerOpen
              ? { background: "rgba(99,102,241,0.15)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.3)" }
              : { color: "#475569", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <BookOpen size={12} />
            <span>사령부</span>
            {reports.length > 0 && (
              <span className="text-[9px] px-1.5 rounded-full" style={{ background: "rgba(99,102,241,0.2)", color: "#818cf8" }}>
                {reports.length}
              </span>
            )}
          </button>

          {/* 설정 */}
          <button
            onClick={() => setShowSettings(true)}
            className="w-8 h-8 flex items-center justify-center rounded-full transition-colors text-slate-500 hover:text-slate-300"
            style={{ border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <Settings size={13} />
          </button>

          {/* 임무 배정 */}
          <button
            onClick={() => { if (phase !== "working") setShowSetup(true); }}
            disabled={phase === "working"}
            className="text-xs font-semibold px-4 py-1.5 rounded-full transition-all"
            style={phase !== "working" ? {
              background: "linear-gradient(135deg, rgba(109,40,217,0.6) 0%, rgba(79,70,229,0.6) 100%)",
              color: "#c4b5fd",
              border: "1px solid rgba(139,92,246,0.35)",
              boxShadow: "0 0 20px rgba(109,40,217,0.2), inset 0 1px 0 rgba(255,255,255,0.08)",
            } : {
              background: "rgba(255,255,255,0.03)",
              color: "#334155",
              border: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            임무 배정 +
          </button>
        </div>
      </header>

      {/* 이전 세션 resume 배너 */}
      {resumeInfo && (
        <div className="shrink-0 px-6 py-2 flex items-center gap-3 text-xs animate-fadeIn" style={{ background: "rgba(251,191,36,0.04)", borderBottom: "1px solid rgba(251,191,36,0.12)" }}>
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-slate-500">이전 세션 발견:</span>
          <span className="text-slate-300 font-medium max-w-xs truncate">{resumeInfo.topic}</span>
          <button
            onClick={() => void resumeSession(resumeInfo)}
            className="ml-2 px-3 py-1 rounded-full text-xs font-medium transition-all"
            style={{ background: "rgba(251,191,36,0.08)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.2)" }}
          >
            이어서 보기
          </button>
          <button onClick={() => { setResumeInfo(null); localStorage.removeItem("cosmicHustleSession"); }} className="text-slate-600 hover:text-slate-400 transition-colors">✕</button>
        </div>
      )}

      {/* 일시정지 재시작 배너 */}
      {pausedInfo && (
        <div className="shrink-0 px-6 py-2 flex items-center gap-3 text-xs animate-fadeIn" style={{ background: "rgba(251,146,60,0.04)", borderBottom: "1px solid rgba(251,146,60,0.15)" }}>
          <span className="text-[11px]">⏸</span>
          <span className="text-slate-500">일시정지된 임무:</span>
          <span className="text-slate-300 font-medium max-w-xs truncate">{pausedInfo.topic}</span>
          <button
            onClick={() => void restartFromPaused(pausedInfo)}
            className="ml-2 px-3 py-1 rounded-full text-xs font-medium transition-all"
            style={{ background: "rgba(251,146,60,0.1)", color: "#fb923c", border: "1px solid rgba(251,146,60,0.25)" }}
          >
            재시작
          </button>
          <button onClick={() => setPausedInfo(null)} className="text-slate-600 hover:text-slate-400 transition-colors">✕</button>
        </div>
      )}

      {/* 에러 배너 */}
      {researchError && (
        <div className="shrink-0 px-6 py-3 flex items-center gap-3 animate-fadeIn" style={{ background: "rgba(239,68,68,0.06)", borderBottom: "1px solid rgba(239,68,68,0.18)" }}>
          <div className="shrink-0 rounded-full overflow-hidden" style={{ width: 32, height: 32, border: "1.5px solid rgba(239,68,68,0.35)" }}>
            <AgentImage defaultSrc="/characters/root/default.png" size={32} status="active" />
          </div>
          <div className="flex-1 min-w-0 text-xs">
            <span className="text-red-300 font-medium">{errorTyped}</span>
            {errorTyped.length < (researchError.detail ? `${researchError.title} — ${researchError.detail}` : researchError.title).length && (
              <span className="inline-block w-0.5 h-3 bg-red-400 ml-0.5 animate-pulse align-middle" />
            )}
          </div>
          <button onClick={() => setResearchError(null)} className="text-slate-600 hover:text-slate-400 transition-colors shrink-0 text-xs">✕</button>
        </div>
      )}

      {/* 메인 컨텐츠 */}
      <div className="flex-1 overflow-hidden" style={{ position: "relative", zIndex: 10 }}>

        {/* 오피스 — 항상 표시 */}
        <OfficePage
          agentStatus={agentStatus}
          agentExpression={agentExpression}
          speaking={speaking}
          lastMessage={lastMessage}
          pingIdeas={pingIdeas}
          lastTopic={topic}
          chatFeed={chatFeed}
          onPlanClick={phase !== "working" ? () => setShowSetup(true) : undefined}
          streamLog={streamLog}
          thinkingHint={thinkingHint}
        />

        {/* 서랍 스크림 */}
        {sideDrawerOpen && (
          <div
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(2px)", zIndex: 25 }}
            onClick={() => setSideDrawerOpen(false)}
          />
        )}

        {/* 사령부 서랍 */}
        <div
          className="absolute top-0 right-0 bottom-0 flex flex-col"
          style={{
            width: 440,
            zIndex: 30,
            background: "rgba(6,8,22,0.98)",
            backdropFilter: "blur(32px)",
            borderLeft: "1px solid rgba(255,255,255,0.07)",
            transform: sideDrawerOpen ? "translateX(0)" : "translateX(100%)",
            transition: "transform 0.32s cubic-bezier(0.4,0,0.2,1)",
            boxShadow: sideDrawerOpen ? "-20px 0 60px rgba(0,0,0,0.5)" : "none",
          }}
        >
          {/* 서랍 헤더 */}
          <div className="shrink-0 px-5 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-center gap-1 flex-1">
              {(["reports", "history", "memos", "team"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setSideDrawerTab(t)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                  style={sideDrawerTab === t
                    ? { background: "rgba(99,102,241,0.18)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.25)" }
                    : { color: "#475569", border: "1px solid transparent" }}
                >
                  {t === "reports" ? "리포트" : t === "history" ? "히스토리" : t === "memos" ? "메모" : "팀원"}
                </button>
              ))}
            </div>
            <button
              onClick={() => setSideDrawerOpen(false)}
              className="w-7 h-7 flex items-center justify-center rounded-full text-slate-600 hover:text-slate-300 transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          {/* 서랍 콘텐츠 */}
          <div className="flex-1 overflow-hidden p-4">
            {sideDrawerTab === "reports" && (
              <ReportBoard
                reports={reports}
                drafts={reportDrafts}
                onDelete={(id) => setReports((prev) => prev.filter((r) => r.id !== id))}
                onUpdate={(updated) => setReports((prev) => prev.map((r) => r.id === updated.id ? updated : r))}
                onDeepDive={(t) => { setInitialTopic(t); setSideDrawerOpen(false); setShowSetup(true); }}
              />
            )}
            {sideDrawerTab === "history" && (
              <HistoryIdeaPanel
                projects={history}
                ideas={pingIdeas}
                reports={reports}
                agentDurations={agentDurations}
                onIdeaSelect={(t) => { setInitialTopic(t); setSideDrawerOpen(false); setShowSetup(true); }}
              />
            )}
            {sideDrawerTab === "memos" && <MemoWikiPanel />}
            {sideDrawerTab === "team" && <TeamRoster agentStatus={agentStatus} />}
          </div>
        </div>

      </div>

      {/* 하단 에이전트 바 */}
      <BottomAgentBar
        agentStatus={agentStatus}
        agentExpression={agentExpression}
        speaking={speaking}
        lastMessage={lastMessage}
        hideBubbles={false}
        onAgentClick={(agent) => {
          if (agent.id === "plan" && phase !== "working") {
            setShowSetup(true);
          } else {
            setSelectedAgent(agent);
          }
        }}
      />

      {selectedAgent && (
        <AgentFullScreen
          agent={selectedAgent}
          agentStatus={agentStatus[selectedAgent.id] ?? "idle"}
          lastMessage={lastMessage[selectedAgent.id] ?? ""}
          liveStream={streamLog[selectedAgent.id]}
          thinkingHint={thinkingHint[selectedAgent.id]}
          agentSettings={agentSettings}
          pingIdeas={pingIdeas}
          onNewProject={() => { setSelectedAgent(null); setShowSetup(true); }}
          onStartProject={(t) => { setInitialTopic(t); setSelectedAgent(null); setShowSetup(true); }}
          onClose={() => setSelectedAgent(null)}
        />
      )}

      {showSetup && (
        <ProjectSetupModal
          onStart={runResearch}
          onClose={() => { setShowSetup(false); setInitialTopic(""); }}
          defaultSettings={agentSettings}
          initialTopic={initialTopic}
        />
      )}

      {ceoCheckin && (
        <CeoCheckin state={ceoCheckin} onRespond={handleCeoResponse} onCancel={stopResearch} />
      )}

      {phase === "working" && currentMode === "full" && (
        <ProjectWorkView
          topic={topic}
          agentStatus={agentStatus}
          agentExpression={agentExpression}
          speaking={speaking}
          lastMessage={lastMessage}
          streamLog={streamLog}
          chatFeed={chatFeed}
          liveDraft={liveDraft}
          agentDurations={agentDurations}
          thinkingHint={thinkingHint}
          draftVersions={draftVersions}
          agentStartTs={agentStartTs.current}
          sessionStartTs={sessionStartTsRef.current}
          onStop={stopResearch}
        />
      )}

      {/* 설정 오버레이 */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }} onClick={() => setShowSettings(false)}>
          <div
            className="relative flex flex-col m-auto"
            style={{ width: 760, maxHeight: "90vh", background: "rgba(7,9,26,0.99)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, overflow: "hidden" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 px-6 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <span className="text-sm font-semibold text-slate-300">에이전트 설정</span>
              <button onClick={() => setShowSettings(false)} className="text-slate-500 hover:text-slate-300 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              <AgentSettingsPage settings={agentSettings} onChange={setAgentSettings} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
