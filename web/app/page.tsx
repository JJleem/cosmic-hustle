"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import BottomAgentBar from "@/components/BottomAgentBar";
import StarField from "@/components/StarField";
import OfficePage from "@/components/OfficePage";
import ProjectWorkView from "@/components/ProjectWorkView";
import { Idea } from "@/components/AgentWorkspace";
import ProjectSetupModal, { ProjectConfig } from "@/components/ProjectSetupModal";
import OngoingProject from "@/components/dashboard/OngoingProject";
import ReportBoard, { Report } from "@/components/dashboard/ReportBoard";
import HistoryIdeaPanel from "@/components/dashboard/HistoryIdeaPanel";
import { ProjectRecord } from "@/components/dashboard/ProjectHistory";
import MemoWikiPanel from "@/components/dashboard/MemoWikiPanel";
import AgentSettingsPage from "@/components/AgentSettingsPage";
import CeoCheckin, { type CeoCheckinState } from "@/components/CeoCheckin";
import { AGENTS, PIPELINE, AgentStatus } from "@/lib/agents";
import { AllAgentSettings, loadAgentSettings } from "@/lib/agentSettings";

type PageTab = "dashboard" | "office" | "settings";

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
  const [tab, setTab] = useState<PageTab>("dashboard");
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
  const sessionIdRef = useRef("");
  const pendingDraftsRef = useRef<Record<string, string>>({});
  const [reportDrafts, setReportDrafts] = useState<Record<string, string>>({});
  // agentId → 소요 ms (agent_start ts 기록 후 agent_done 에서 계산)
  const agentStartTs = useRef<Record<string, number>>({});
  const [agentDurations, setAgentDurations] = useState<Record<string, number>>({});
  const [resumeInfo, setResumeInfo] = useState<{ sessionId: string; topic: string } | null>(null);

  // DB에서 초기 데이터 로드
  useEffect(() => {
    Promise.all([
      fetch("/api/reports").then((r) => r.json()),
      fetch("/api/sessions").then((r) => r.json()),
    ]).then(([dbReports, dbSessions]) => {
      if (Array.isArray(dbReports)) {
        setReports(
          (dbReports as Array<{ id: string; agentId: string; topic: string; content: string; createdAt: number }>)
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
    setChatFeed((prev) => [...prev, { id: crypto.randomUUID(), agentId, text, at: new Date() }].slice(-60));
  }, []);

  const handleSSE = useCallback(
    (event: Record<string, unknown>, inputTopic: string) => {
      switch (event.type) {
        case "session_start":
          sessionIdRef.current = event.sessionId as string;
          localStorage.setItem("cosmicHustleSession", JSON.stringify({
            sessionId: event.sessionId,
            topic: inputTopic,
          }));
          break;
        case "agent_start":
          setAgentStatus((prev) => ({ ...prev, [event.agentId as string]: "active" }));
          setStreamLog((prev) => ({ ...prev, [event.agentId as string]: "" }));
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
          break;
        case "report": {
          const rId = (event.reportId as string) ?? uid();
          setReports((prev) => [
            {
              id: rId,
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
        case "complete":
          setHistory((prev) => {
            if (prev.some((h) => h.topic === inputTopic)) return prev;
            return [{ id: uid(), topic: inputTopic, completedAt: new Date() }, ...prev];
          });
          localStorage.removeItem("cosmicHustleSession");
          setPhase("done");
          speak("wiki", "리서치 완료. 보고서가 준비됐어요.");
          break;
        case "error":
          console.error("SSE error:", event.message);
          setPhase("done");
          break;
      }
    },
    [speak, addChat],
  );

  const runResearch = async (config: ProjectConfig) => {
    if (idleTimerRef.current) clearInterval(idleTimerRef.current);
    setShowSetup(false);
    setPhase("working");
    setCurrentMode(config.mode);
    setTopic(config.topic);
    if (config.mode === "background") setTab("office");
    // 활성화된 에이전트만 waiting, 나머지는 idle 유지
    const enabledIds = new Set(config.agentConfigs.filter((c) => c.enabled).map((c) => c.agentId));
    setAgentStatus(Object.fromEntries(AGENTS.map((a) => [a.id, enabledIds.has(a.id) ? "waiting" : "disabled"])));

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: config.topic, taskTypeId: config.taskTypeId, agentConfigs: config.agentConfigs, mode: config.mode, reportStyle: config.reportStyle }),
        signal: abort.signal,
      });

      if (!res.ok || !res.body) throw new Error("API error");

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
        console.error("Research failed:", err);
      }
      setPhase("done");
    } finally {
      abortRef.current = null;
    }
  };

  const resumeSession = async ({ sessionId, topic: resumeTopic }: { sessionId: string; topic: string }) => {
    setResumeInfo(null);
    const res = await fetch(`/api/research/${sessionId}/events`);
    const { status, events } = await res.json() as {
      status: string;
      events: Array<{ seq: number; event: Record<string, unknown> }>;
    };

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
      return;
    }

    // 체크인 대기 중이면 UI 복원
    if (lastCheckin) setCeoCheckin(lastCheckin);

    // 새 이벤트 폴링 시작
    let lastSeq = events.length > 0 ? events[events.length - 1].seq : 0;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const pollRes = await fetch(`/api/research/${sessionId}/events?since=${lastSeq}`);
        const { status: pollStatus, events: newEvents } = await pollRes.json() as {
          status: string;
          events: Array<{ seq: number; event: Record<string, unknown> }>;
        };
        for (const { seq, event } of newEvents) {
          handleSSE(event, resumeTopic);
          lastSeq = seq;
        }
        if (pollStatus !== "working") {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          if (pollStatus === "done") {
            localStorage.removeItem("cosmicHustleSession");
          }
        }
      } catch { /* 네트워크 오류 무시 */ }
    }, 3000);
  };

  const handleCeoResponse = async (sessionId: string, response: string) => {
    setCeoCheckin(null);
    await fetch(`/api/research/${sessionId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response }),
    });
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
    pendingDraftsRef.current = {};
    agentStartTs.current = {};
    setAgentDurations({});
  };

  return (
    <div className="h-screen cosmic-bg text-white flex flex-col overflow-hidden" style={{ position: "relative" }}>
      <StarField />
      {/* 헤더 */}
      <header className="shrink-0 px-8 py-3.5 flex items-center gap-4" style={{ position: "relative", zIndex: 10, borderBottom: "1px solid rgba(255,255,255,0.055)", background: "rgba(7,9,26,0.7)", backdropFilter: "blur(20px)" }}>
        <div className="flex items-center gap-2.5">
          <span className="text-base animate-float" style={{ display: "inline-block" }}>🪐</span>
          <h1
            className="text-sm font-bold tracking-[0.28em]"
            style={{ background: "linear-gradient(90deg, #c4b5fd 0%, #818cf8 50%, #93c5fd 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}
          >
            COSMIC HUSTLE
          </h1>
        </div>

        {/* 탭 */}
        <div className="flex items-center gap-0.5 ml-6 p-1 rounded-full" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
          {(["dashboard", "office", "settings"] as PageTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-4 py-1.5 rounded-full text-xs font-medium tracking-wide transition-all duration-200"
              style={
                tab === t
                  ? { background: "rgba(99,102,241,0.18)", color: "#a5b4fc", boxShadow: "0 0 12px rgba(99,102,241,0.15), inset 0 1px 0 rgba(255,255,255,0.08)", border: "1px solid rgba(99,102,241,0.25)" }
                  : { color: "#64748b", border: "1px solid transparent" }
              }
            >
              {t === "dashboard" ? "대시보드" : t === "office" ? "사무실" : "설정"}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2.5">
          {phase === "working" && topic && (
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs" style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.18)" }}>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-emerald-300/80 max-w-48 truncate font-medium">{topic}</span>
            </div>
          )}
          {phase === "done" && (
            <button
              onClick={reset}
              className="text-xs text-slate-500 hover:text-slate-300 rounded-full px-4 py-1.5 transition-all duration-200"
              style={{ border: "1px solid rgba(255,255,255,0.07)" }}
            >
              초기화
            </button>
          )}
          <button
            onClick={() => { if (phase !== "working") setShowSetup(true); }}
            disabled={phase === "working"}
            className="text-xs font-semibold px-5 py-1.5 rounded-full transition-all duration-200"
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
            새 프로젝트 +
          </button>
        </div>
      </header>

      {/* 이전 세션 resume 배너 */}
      {resumeInfo && (
        <div className="shrink-0 px-8 py-2 flex items-center gap-3 text-xs animate-fadeIn" style={{ background: "rgba(251,191,36,0.04)", borderBottom: "1px solid rgba(251,191,36,0.12)" }}>
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
          <button
            onClick={() => { setResumeInfo(null); localStorage.removeItem("cosmicHustleSession"); }}
            className="text-slate-600 hover:text-slate-400 transition-colors"
          >
            ✕
          </button>
        </div>
      )}

      {/* 컨텐츠 */}
      <div className="flex-1 overflow-hidden" style={{ position: "relative", zIndex: 10 }}>
        {tab === "dashboard" && (
          <div className="h-full flex gap-4 p-5">
            {/* ── 왼쪽 aside ── */}
            <div className="w-72 shrink-0 flex flex-col gap-4">
              <div className="glass-panel rounded-2xl p-5 overflow-hidden" style={{ flex: "5" }}>
                <OngoingProject topic={topic} phase={phase} agentStatus={agentStatus} handoffs={handoffs} lastMessage={lastMessage} onStop={stopResearch} />
              </div>
              <div className="glass-panel rounded-2xl p-5 overflow-hidden" style={{ flex: "4" }}>
                <HistoryIdeaPanel
                  projects={history}
                  ideas={pingIdeas}
                  reports={reports}
                  agentDurations={agentDurations}
                  onIdeaSelect={(t) => { setInitialTopic(t); setShowSetup(true); }}
                />
              </div>
              <div className="glass-panel rounded-2xl p-5 overflow-hidden" style={{ flex: "3" }}>
                <MemoWikiPanel />
              </div>
            </div>

            {/* ── 메인: 보고현황 ── */}
            <div className="flex-1 glass-panel rounded-2xl p-5 overflow-hidden">
              <ReportBoard
                reports={reports}
                drafts={reportDrafts}
                onDelete={(id) => setReports((prev) => prev.filter((r) => r.id !== id))}
                onUpdate={(updated) => setReports((prev) => prev.map((r) => r.id === updated.id ? updated : r))}
              />
            </div>
          </div>
        )}

        {tab === "office" && (
          <OfficePage
            agentStatus={agentStatus}
            agentExpression={agentExpression}
            speaking={speaking}
            lastMessage={lastMessage}
            pingIdeas={pingIdeas}
            lastTopic={topic}
          />
        )}

        {tab === "settings" && (
          <AgentSettingsPage
            settings={agentSettings}
            onChange={setAgentSettings}
          />
        )}
      </div>

      {/* 하단 에이전트 바 — 사무실에선 말풍선 숨김 */}
      <BottomAgentBar
        agentStatus={agentStatus}
        agentExpression={agentExpression}
        speaking={speaking}
        lastMessage={lastMessage}
        hideBubbles={tab === "office"}
      />

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
          onStop={stopResearch}
        />
      )}
    </div>
  );
}
