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
import HistoryIdeaPanel from "@/components/dashboard/HistoryIdeaPanel";
import { ProjectRecord } from "@/components/dashboard/ProjectHistory";
import MemoWikiPanel from "@/components/dashboard/MemoWikiPanel";
import AgentSettingsPage from "@/components/AgentSettingsPage";
import CeoCheckin from "@/components/CeoCheckin";
import TeamRoster from "@/components/TeamRoster";
import { AGENTS, PIPELINE } from "@/lib/agents";
import { AllAgentSettings, loadAgentSettings } from "@/lib/agentSettings";
import { useAgentStore } from "@/lib/stores/agentStore";
import { useSessionStore } from "@/lib/stores/sessionStore";
import { useDataStore } from "@/lib/stores/dataStore";
import { useErrorLogger } from "@/lib/useErrorLogger";

export type { Handoff } from "@/lib/types";

const uid = () => crypto.randomUUID();

export default function Home() {
  const agent = useAgentStore();
  const session = useSessionStore();
  const data = useDataStore();

  const [agentSettings, setAgentSettings] = useState<AllAgentSettings>({});
  const [errorTyped, setErrorTyped] = useState("");

  useErrorLogger();
  useEffect(() => { setAgentSettings(loadAgentSettings()); }, []);

  const idleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIdRef = useRef("");
  const sessionStartTsRef = useRef(0);
  const pendingDraftsRef = useRef<Record<string, string>>({});
  const agentStartTs = useRef<Record<string, number>>({});
  const speakTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (idleTimerRef.current) clearInterval(idleTimerRef.current);
    Object.values(speakTimers.current).forEach(clearTimeout);
  }, []);

  // 에러 배너 타이핑 효과
  useEffect(() => {
    if (!session.researchError) { setErrorTyped(""); return; }
    const full = session.researchError.detail
      ? `${session.researchError.title} — ${session.researchError.detail}`
      : session.researchError.title;
    setErrorTyped("");
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setErrorTyped(full.slice(0, i));
      if (i >= full.length) clearInterval(timer);
    }, 28);
    return () => clearInterval(timer);
  }, [session.researchError]);

  // DB 초기 데이터 로드
  useEffect(() => {
    Promise.all([
      fetch("/api/reports").then((r) => r.json()),
      fetch("/api/sessions").then((r) => r.json()),
    ]).then(([dbReports, dbSessions]) => {
      if (Array.isArray(dbReports)) {
        data.setReports(
          (dbReports as Array<{ id: string; sessionId?: string; agentId: string; topic: string; content: string; createdAt: number }>)
            .map((r) => ({ ...r, createdAt: new Date((typeof r.createdAt === "number" ? r.createdAt : 0) * 1000) }))
        );
      }
      if (Array.isArray(dbSessions)) {
        data.setHistory(
          (dbSessions as Array<{ id: string; topic: string; completedAt: number | null }>)
            .filter((s) => typeof s.completedAt === "number")
            .map((s) => ({ id: s.id, topic: s.topic, completedAt: new Date((s.completedAt as number) * 1000) }))
        );
      }
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 이전 세션 이어서 보기 체크
  useEffect(() => {
    const stored = localStorage.getItem("cosmicHustleSession");
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as { sessionId: string; topic: string };
      fetch(`/api/research/${parsed.sessionId}/events`)
        .then((r) => r.json())
        .then((d: { status: string }) => {
          if (d.status === "working" || d.status === "done") {
            session.setResumeInfo(parsed);
          } else if (d.status === "paused") {
            session.setPausedInfo(parsed);
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

  const speak = useCallback((agentId: string, message: string) => {
    const { setLastMessage, setSpeaking } = useAgentStore.getState();
    setLastMessage(agentId, message);
    setSpeaking(agentId, true);
    if (speakTimers.current[agentId]) clearTimeout(speakTimers.current[agentId]);
    speakTimers.current[agentId] = setTimeout(() => useAgentStore.getState().setSpeaking(agentId, false), 2500);
  }, []);

  // idle 랜덤 중얼거림
  useEffect(() => {
    if (session.phase !== "idle") return;
    const tick = () => {
      const a = AGENTS[Math.floor(Math.random() * AGENTS.length)];
      speak(a.id, a.idleMessages[Math.floor(Math.random() * a.idleMessages.length)]);
    };
    tick();
    idleTimerRef.current = setInterval(tick, 3000);
    return () => { if (idleTimerRef.current) clearInterval(idleTimerRef.current); };
  }, [session.phase, speak]);

  const handleSSE = useCallback(
    (event: Record<string, unknown>, inputTopic: string) => {
      switch (event.type) {
        case "session_start":
          sessionIdRef.current = event.sessionId as string;
          sessionStartTsRef.current = Date.now();
          localStorage.setItem("cosmicHustleSession", JSON.stringify({
            sessionId: event.sessionId, topic: inputTopic,
          }));
          break;
        case "agent_start": {
          const id = event.agentId as string;
          agent.setStatus(id, "active");
          agent.clearStream(id);
          agent.clearThinkingHint(id);
          speak(id, event.message as string);
          data.addChat({ id: uid(), agentId: id, text: `[시작] ${event.message as string}`, at: new Date() });
          agentStartTs.current[id] = (event.ts as number | undefined) ?? Date.now();
          break;
        }
        case "agent_message":
          speak(event.agentId as string, event.message as string);
          data.addChat({ id: uid(), agentId: event.agentId as string, text: event.message as string, at: new Date() });
          break;
        case "agent_stream":
          agent.appendStream(event.agentId as string, event.chunk as string);
          break;
        case "agent_thinking":
          speak(event.agentId as string, "...");
          agent.setThinkingHint(event.agentId as string, event.chunk as string);
          break;
        case "agent_done": {
          const doneId = event.agentId as string;
          agent.setStatus(doneId, "done");
          speak(doneId, event.message as string);
          data.addChat({ id: uid(), agentId: doneId, text: `[완료] ${event.message as string}`, at: new Date() });
          if (agentStartTs.current[doneId]) {
            agent.setDuration(doneId, ((event.ts as number | undefined) ?? Date.now()) - agentStartTs.current[doneId]);
          }
          const stageIdx = PIPELINE.findIndex((s) => s.ids.includes(doneId));
          const nextStage = stageIdx !== -1 ? PIPELINE[stageIdx + 1] : null;
          if (nextStage) {
            data.addHandoff({ id: uid(), fromId: doneId, toId: nextStage.ids[0], message: (event.message as string) ?? "", at: new Date() });
          }
          break;
        }
        case "agent_expression":
          agent.setExpression(event.agentId as string, (event.expression as string | null) ?? null);
          break;
        case "draft_report":
          pendingDraftsRef.current[event.agentId as string] = event.content as string;
          data.setLiveDraft({ agentId: event.agentId as string, topic: event.topic as string, content: event.content as string });
          break;
        case "report_version":
          data.addDraftVersion({ version: event.version as number, content: event.content as string, prevFeedback: (event.prevFeedback as string) ?? "" });
          break;
        case "report": {
          const rId = (event.reportId as string) ?? uid();
          data.addReport({
            id: rId,
            sessionId: sessionIdRef.current || undefined,
            agentId: event.agentId as string,
            topic: (event.topic as string) ?? inputTopic,
            content: event.content as string,
            createdAt: new Date(),
          });
          const draft = pendingDraftsRef.current[event.agentId as string];
          if (draft) {
            data.setReportDraft(rId, draft);
            delete pendingDraftsRef.current[event.agentId as string];
          }
          break;
        }
        case "ping_ideas":
          data.setPingIdeas((event.ideas as Idea[]) ?? []);
          break;
        case "clarify_request":
          session.setCeoCheckin({ type: "clarify_request", sessionId: event.sessionId as string, agentId: "plan", questions: event.questions as string[] });
          break;
        case "ceo_checkin":
          session.setCeoCheckin({ type: "ceo_checkin", sessionId: event.sessionId as string, agentId: event.agentId as string, summary: event.summary as string, keyFacts: event.keyFacts as string[] });
          break;
        case "complete": {
          const completedSid = sessionIdRef.current;
          data.addHistory({ id: completedSid || uid(), topic: inputTopic, completedAt: new Date() });
          localStorage.removeItem("cosmicHustleSession");
          session.setPhase("done");
          speak("wiki", "리서치 완료. 보고서가 준비됐어요.");
          if (Notification.permission === "granted") {
            new Notification("🪐 Cosmic Hustle", { body: `"${inputTopic}" 리서치가 완료됐어요.`, icon: "/favicon.ico" });
          }
          break;
        }
        case "error": {
          const errMsg = (event.message as string) ?? "파이프라인 오류가 발생했어요.";
          session.setError({ title: "파이프라인 오류", detail: errMsg });
          data.addChat({ id: uid(), agentId: "root", text: `[오류] ${errMsg}`, at: new Date() });
          agent.reset();
          agent.setStatus("root", "active");
          speak("root", `🚨 ${errMsg}`);
          session.setPhase("idle");
          session.setTopic("");
          break;
        }
      }
    },
    [speak, agent, session, data],
  );

  const reset = () => {
    agent.reset();
    session.reset();
    data.reset();
    pendingDraftsRef.current = {};
    agentStartTs.current = {};
    sessionStartTsRef.current = 0;
  };

  const showError = useCallback((title: string, detail: string) => {
    session.setError({ title, detail });
    data.addChat({ id: uid(), agentId: "root", text: `[오류] ${title}${detail ? ` — ${detail}` : ""}`, at: new Date() });
    agent.setStatus("root", "active");
    speak("root", `🚨 ${title}`);
    setTimeout(() => { agent.reset(); session.setPhase("idle"); session.setTopic(""); }, 3000);
  }, [session, data, agent, speak]);

  const runResearch = async (config: ProjectConfig) => {
    if (idleTimerRef.current) clearInterval(idleTimerRef.current);
    if (Notification.permission === "default") await Notification.requestPermission();
    session.setShowSetup(false);
    session.setPhase("working");
    session.setMode(config.mode);
    session.setTopic(config.topic);
    const enabledIds = new Set(config.agentConfigs.filter((c) => c.enabled).map((c) => c.agentId));
    agent.setAllStatus(Object.fromEntries(AGENTS.map((a) => [a.id, enabledIds.has(a.id) ? "waiting" : "disabled"])));

    const abort = new AbortController();
    abortRef.current = abort;
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
          try { handleSSE(JSON.parse(line.slice(6)), config.topic); } catch { /* ignore */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        errorHandled = true;
        showError("예기치 않은 오류", (err as Error).message ?? "알 수 없는 오류");
      }
    } finally {
      abortRef.current = null;
      const s = useSessionStore.getState();
      if (!errorHandled && !s.researchError && s.phase === "working") session.setPhase("done");
    }
  };

  const resumeSession = async ({ sessionId, topic: resumeTopic }: { sessionId: string; topic: string }) => {
    session.setResumeInfo(null);
    let status: string;
    let events: Array<{ seq: number; event: Record<string, unknown> }>;
    try {
      const res = await fetch(`/api/research/${sessionId}/events`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json() as { status: string; events: Array<{ seq: number; event: Record<string, unknown> }> };
      status = d.status;
      events = d.events;
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
    const newStatus: Record<string, import("@/lib/agents").AgentStatus> = Object.fromEntries(AGENTS.map((a) => [a.id, "waiting"]));
    const newStreamLog: Record<string, string> = {};
    const newLastMsg: Record<string, string> = {};
    const newReports: Parameters<typeof data.addReport>[0][] = [];
    const newIdeas: Idea[] = [];
    let lastCheckin = null as Parameters<typeof session.setCeoCheckin>[0];

    for (const { event: e } of events) {
      switch (e.type) {
        case "agent_start":
          newStatus[e.agentId as string] = "active";
          newStreamLog[e.agentId as string] = "";
          newLastMsg[e.agentId as string] = e.message as string;
          lastCheckin = null;
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
          newReports.push({ id: e.reportId as string, agentId: e.agentId as string, topic: (e.topic as string) ?? resumeTopic, content: e.content as string, createdAt: new Date() });
          break;
        case "ping_ideas":
          newIdeas.push(...(e.ideas as Idea[]));
          break;
        case "clarify_request":
          lastCheckin = { type: "clarify_request", sessionId, agentId: "plan", questions: e.questions as string[] };
          break;
        case "ceo_checkin":
          lastCheckin = { type: "ceo_checkin", sessionId, agentId: e.agentId as string, summary: e.summary as string, keyFacts: e.keyFacts as string[] };
          break;
      }
    }

    agent.setAllStatus(newStatus);
    agent.streamLog; // accessed to satisfy exhaustive
    useAgentStore.setState({ streamLog: newStreamLog, lastMessage: newLastMsg });
    newReports.filter((r) => !data.reports.some((p) => p.id === r.id)).forEach((r) => data.addReport(r));
    data.setPingIdeas(newIdeas);
    session.setTopic(resumeTopic);
    session.setPhase(status === "done" ? "done" : "working");
    sessionIdRef.current = sessionId;

    if (status !== "working") {
      localStorage.removeItem("cosmicHustleSession");
      if (status === "done") data.addHistory({ id: sessionId, topic: resumeTopic, completedAt: new Date() });
      return;
    }

    if (lastCheckin) session.setCeoCheckin(lastCheckin);

    let lastSeq = events.length > 0 ? events[events.length - 1].seq : 0;
    let isPolling = false;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      if (isPolling) return;
      isPolling = true;
      fetch(`/api/research/${sessionId}/events?since=${lastSeq}`)
        .then((r) => r.json())
        .then((d: { status: string; events: Array<{ seq: number; event: Record<string, unknown> }> }) => {
          for (const { seq, event } of d.events) { handleSSE(event, resumeTopic); lastSeq = seq; }
          if (d.status !== "working") {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            if (d.status === "done") localStorage.removeItem("cosmicHustleSession");
          }
        })
        .catch(() => {})
        .finally(() => { isPolling = false; });
    }, 3000);
  };

  const handleCeoResponse = async (sessionId: string, response: string) => {
    await fetch(`/api/research/${sessionId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response }),
    });
    session.setCeoCheckin(null);
  };

  const stopResearch = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    const sId = sessionIdRef.current;
    if (sId) { void fetch(`/api/research/${sId}/cancel`, { method: "POST" }); sessionIdRef.current = ""; }
    localStorage.removeItem("cosmicHustleSession");
    reset();
  };

  const pauseResearch = () => {
    const sId = sessionIdRef.current;
    if (!sId) return;
    const currentTopic = session.topic;
    void fetch(`/api/research/${sId}/pause`, { method: "POST" });
    abortRef.current?.abort();
    abortRef.current = null;
    session.setPausedInfo({ sessionId: sId, topic: currentTopic });
    sessionIdRef.current = "";
    localStorage.removeItem("cosmicHustleSession");
    reset();
  };

  const restartFromPaused = async (info: { sessionId: string; topic: string }) => {
    session.setPausedInfo(null);
    if (idleTimerRef.current) clearInterval(idleTimerRef.current);
    session.setPhase("working");
    session.setTopic(info.topic);
    agent.setAllStatus(Object.fromEntries(AGENTS.map((a) => [a.id, "waiting"])));

    const abort = new AbortController();
    abortRef.current = abort;
    let errorHandled = false;

    try {
      const res = await fetch(`/api/research/${info.sessionId}/restart`, { method: "POST", signal: abort.signal });
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
      if (!errorHandled && useSessionStore.getState().phase === "working") session.setPhase("done");
    }
  };

  const { phase, topic, sideDrawerOpen, sideDrawerTab, showSettings, showSetup, researchError, resumeInfo, pausedInfo, ceoCheckin, currentMode, initialTopic } = session;
  const { status: agentStatus, expression: agentExpression, speaking, lastMessage, streamLog, thinkingHint, durations: agentDurations, selectedAgent } = agent;
  const { reports, history, handoffs: _handoffs, pingIdeas, chatFeed, reportDrafts, liveDraft, draftVersions } = data;

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

        {phase === "working" && topic && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs min-w-0" style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.18)" }}>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="text-emerald-300/80 truncate font-medium" style={{ maxWidth: "min(180px, 18vw)" }}>{topic}</span>
            <button onClick={pauseResearch} className="ml-0.5 w-4 h-4 flex items-center justify-center rounded text-slate-500 hover:text-amber-400 transition-colors text-[10px] shrink-0" title="일시정지">⏸</button>
            <button onClick={stopResearch} className="w-4 h-4 flex items-center justify-center rounded text-slate-500 hover:text-red-400 transition-colors text-[10px] shrink-0" title="중단">■</button>
          </div>
        )}

        {phase === "done" && (
          <button onClick={reset} className="text-xs text-slate-500 hover:text-slate-300 rounded-full px-3 py-1.5 transition-all" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>초기화</button>
        )}

        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => session.setSideDrawerOpen(!sideDrawerOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all"
            style={sideDrawerOpen ? { background: "rgba(99,102,241,0.15)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.3)" } : { color: "#475569", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <BookOpen size={12} />
            <span>사령부</span>
            {reports.length > 0 && <span className="text-[9px] px-1.5 rounded-full" style={{ background: "rgba(99,102,241,0.2)", color: "#818cf8" }}>{reports.length}</span>}
          </button>
          <button onClick={() => session.setShowSettings(true)} className="w-8 h-8 flex items-center justify-center rounded-full transition-colors text-slate-500 hover:text-slate-300" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
            <Settings size={13} />
          </button>
          <button
            onClick={() => { if (phase !== "working") session.setShowSetup(true); }}
            disabled={phase === "working"}
            className="text-xs font-semibold px-4 py-1.5 rounded-full transition-all"
            style={phase !== "working" ? { background: "linear-gradient(135deg, rgba(109,40,217,0.6) 0%, rgba(79,70,229,0.6) 100%)", color: "#c4b5fd", border: "1px solid rgba(139,92,246,0.35)", boxShadow: "0 0 20px rgba(109,40,217,0.2), inset 0 1px 0 rgba(255,255,255,0.08)" } : { background: "rgba(255,255,255,0.03)", color: "#334155", border: "1px solid rgba(255,255,255,0.05)" }}
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
          <button onClick={() => void resumeSession(resumeInfo)} className="ml-2 px-3 py-1 rounded-full text-xs font-medium transition-all" style={{ background: "rgba(251,191,36,0.08)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.2)" }}>이어서 보기</button>
          <button onClick={() => { session.setResumeInfo(null); localStorage.removeItem("cosmicHustleSession"); }} className="text-slate-600 hover:text-slate-400 transition-colors">✕</button>
        </div>
      )}

      {/* 일시정지 재시작 배너 */}
      {pausedInfo && (
        <div className="shrink-0 px-6 py-2 flex items-center gap-3 text-xs animate-fadeIn" style={{ background: "rgba(251,146,60,0.04)", borderBottom: "1px solid rgba(251,146,60,0.15)" }}>
          <span className="text-[11px]">⏸</span>
          <span className="text-slate-500">일시정지된 임무:</span>
          <span className="text-slate-300 font-medium max-w-xs truncate">{pausedInfo.topic}</span>
          <button onClick={() => void restartFromPaused(pausedInfo)} className="ml-2 px-3 py-1 rounded-full text-xs font-medium transition-all" style={{ background: "rgba(251,146,60,0.1)", color: "#fb923c", border: "1px solid rgba(251,146,60,0.25)" }}>재시작</button>
          <button onClick={() => session.setPausedInfo(null)} className="text-slate-600 hover:text-slate-400 transition-colors">✕</button>
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
          <button onClick={() => session.setError(null)} className="text-slate-600 hover:text-slate-400 transition-colors shrink-0 text-xs">✕</button>
        </div>
      )}

      {/* 메인 컨텐츠 */}
      <div className="flex-1 overflow-hidden" style={{ position: "relative", zIndex: 10 }}>
        <OfficePage
          agentStatus={agentStatus}
          agentExpression={agentExpression}
          speaking={speaking}
          lastMessage={lastMessage}
          pingIdeas={pingIdeas}
          lastTopic={topic}
          chatFeed={chatFeed}
          onPlanClick={phase !== "working" ? () => session.setShowSetup(true) : undefined}
          streamLog={streamLog}
          thinkingHint={thinkingHint}
        />

        {sideDrawerOpen && (
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(2px)", zIndex: 25 }} onClick={() => session.setSideDrawerOpen(false)} />
        )}

        {/* 사령부 서랍 */}
        <div
          className="absolute top-0 right-0 bottom-0 flex flex-col"
          style={{ width: 440, zIndex: 30, background: "rgba(6,8,22,0.98)", backdropFilter: "blur(32px)", borderLeft: "1px solid rgba(255,255,255,0.07)", transform: sideDrawerOpen ? "translateX(0)" : "translateX(100%)", transition: "transform 0.32s cubic-bezier(0.4,0,0.2,1)", boxShadow: sideDrawerOpen ? "-20px 0 60px rgba(0,0,0,0.5)" : "none" }}
        >
          <div className="shrink-0 px-5 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-center gap-1 flex-1">
              {(["reports", "history", "memos", "team"] as const).map((t) => (
                <button key={t} onClick={() => session.setSideDrawerTab(t)} className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                  style={sideDrawerTab === t ? { background: "rgba(99,102,241,0.18)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.25)" } : { color: "#475569", border: "1px solid transparent" }}>
                  {t === "reports" ? "리포트" : t === "history" ? "히스토리" : t === "memos" ? "메모" : "팀원"}
                </button>
              ))}
            </div>
            <button onClick={() => session.setSideDrawerOpen(false)} className="w-7 h-7 flex items-center justify-center rounded-full text-slate-600 hover:text-slate-300 transition-colors"><X size={14} /></button>
          </div>

          <div className="flex-1 overflow-hidden p-4">
            {sideDrawerTab === "reports" && (
              <ReportBoard
                reports={reports}
                drafts={reportDrafts}
                onDelete={(id) => data.deleteReport(id)}
                onUpdate={(updated) => data.updateReport(updated)}
                onDeepDive={(t) => { session.setInitialTopic(t); session.setSideDrawerOpen(false); session.setShowSetup(true); }}
              />
            )}
            {sideDrawerTab === "history" && (
              <HistoryIdeaPanel
                projects={history}
                ideas={pingIdeas}
                reports={reports}
                agentDurations={agentDurations}
                onIdeaSelect={(t) => { session.setInitialTopic(t); session.setSideDrawerOpen(false); session.setShowSetup(true); }}
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
        onAgentClick={(a) => {
          if (a.id === "plan" && phase !== "working") session.setShowSetup(true);
          else agent.setSelectedAgent(a);
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
          onNewProject={() => { agent.setSelectedAgent(null); session.setShowSetup(true); }}
          onStartProject={(t) => { session.setInitialTopic(t); agent.setSelectedAgent(null); session.setShowSetup(true); }}
          onClose={() => agent.setSelectedAgent(null)}
        />
      )}

      {showSetup && (
        <ProjectSetupModal
          onStart={runResearch}
          onClose={() => { session.setShowSetup(false); session.setInitialTopic(""); }}
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

      {showSettings && (
        <div className="fixed inset-0 z-50 flex" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }} onClick={() => session.setShowSettings(false)}>
          <div className="relative flex flex-col m-auto" style={{ width: 760, maxHeight: "90vh", background: "rgba(7,9,26,0.99)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
            <div className="shrink-0 px-6 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <span className="text-sm font-semibold text-slate-300">에이전트 설정</span>
              <button onClick={() => session.setShowSettings(false)} className="text-slate-500 hover:text-slate-300 transition-colors"><X size={16} /></button>
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
