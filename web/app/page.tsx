"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import BottomAgentBar from "@/components/BottomAgentBar";
import OfficePage from "@/components/OfficePage";
import ProjectWorkView from "@/components/ProjectWorkView";
import { Idea } from "@/components/AgentWorkspace";
import ProjectSetupModal, { ProjectConfig } from "@/components/ProjectSetupModal";
import OngoingProject from "@/components/dashboard/OngoingProject";
import ReportBoard, { Report } from "@/components/dashboard/ReportBoard";
import HistoryIdeaPanel from "@/components/dashboard/HistoryIdeaPanel";
import { ProjectRecord } from "@/components/dashboard/ProjectHistory";
import MemoWikiPanel from "@/components/dashboard/MemoWikiPanel";
import { AGENTS, PIPELINE, AgentStatus } from "@/lib/agents";

type PageTab = "dashboard" | "office";

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
  const [agentStatus, setAgentStatus] = useState<AgentStates>(initStatus());
  const [agentExpression, setAgentExpression] = useState<Record<string, string | null>>({});
  const [speaking, setSpeaking] = useState<Record<string, boolean>>({});
  const [lastMessage, setLastMessage] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<"idle" | "working" | "done">("idle");
  const [topic, setTopic] = useState("");
  const [showSetup, setShowSetup] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);
  const [history, setHistory] = useState<ProjectRecord[]>([]);
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [pingIdeas, setPingIdeas] = useState<Idea[]>([]);
  const [streamLog, setStreamLog] = useState<Record<string, string>>({});

  const idleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // DB에서 초기 데이터 로드
  useEffect(() => {
    Promise.all([
      fetch("/api/reports").then((r) => r.json()),
      fetch("/api/sessions").then((r) => r.json()),
    ]).then(([dbReports, dbSessions]) => {
      setReports(
        (dbReports as Array<{ id: string; agentId: string; topic: string; content: string; createdAt: number }>)
          .map((r) => ({ ...r, createdAt: new Date(r.createdAt * 1000) }))
      );
      setHistory(
        (dbSessions as Array<{ id: string; topic: string; completedAt: number | null }>)
          .filter((s) => s.completedAt)
          .map((s) => ({ id: s.id, topic: s.topic, completedAt: new Date((s.completedAt as number) * 1000) }))
      );
    }).catch(() => { /* DB 로드 실패 시 빈 상태 유지 */ });
  }, []);
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

  const handleSSE = useCallback(
    (event: Record<string, unknown>, inputTopic: string) => {
      switch (event.type) {
        case "agent_start":
          setAgentStatus((prev) => ({ ...prev, [event.agentId as string]: "active" }));
          setStreamLog((prev) => ({ ...prev, [event.agentId as string]: "" }));
          speak(event.agentId as string, event.message as string);
          break;
        case "agent_message":
          speak(event.agentId as string, event.message as string);
          break;
        case "agent_stream":
          setStreamLog((prev) => ({
            ...prev,
            [event.agentId as string]: (prev[event.agentId as string] ?? "") + (event.chunk as string),
          }));
          break;
        case "agent_done": {
          const doneId = event.agentId as string;
          setAgentStatus((prev) => ({ ...prev, [doneId]: "done" }));
          speak(doneId, event.message as string);
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
        case "report":
          setReports((prev) => [
            {
              id: (event.reportId as string) ?? uid(),
              agentId: event.agentId as string,
              topic: (event.topic as string) ?? inputTopic,
              content: event.content as string,
              createdAt: new Date(),
            },
            ...prev,
          ]);
          break;
        case "ping_ideas":
          setPingIdeas((event.ideas as Idea[]) ?? []);
          break;
        case "complete":
          setHistory((prev) => {
            if (prev.some((h) => h.topic === inputTopic)) return prev;
            return [{ id: uid(), topic: inputTopic, completedAt: new Date() }, ...prev];
          });
          setPhase("done");
          speak("wiki", "리서치 완료. 보고서가 준비됐어요.");
          break;
        case "error":
          console.error("SSE error:", event.message);
          setPhase("done");
          break;
      }
    },
    [speak],
  );

  const runResearch = async (config: ProjectConfig) => {
    if (idleTimerRef.current) clearInterval(idleTimerRef.current);
    setShowSetup(false);
    setPhase("working");
    setTopic(config.topic);
    // 활성화된 에이전트만 waiting, 나머지는 idle 유지
    const enabledIds = new Set(config.agentConfigs.filter((c) => c.enabled).map((c) => c.agentId));
    setAgentStatus(Object.fromEntries(AGENTS.map((a) => [a.id, enabledIds.has(a.id) ? "waiting" : "disabled"])));

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: config.topic, agentConfigs: config.agentConfigs }),
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
      console.error("Research failed:", err);
      setPhase("done");
    }
  };

  const reset = () => {
    setAgentStatus(initStatus());
    setAgentExpression({});
    setSpeaking({});
    setLastMessage({});
    setPhase("idle");
    setTopic("");
    setHandoffs([]);
    setStreamLog({});
  };

  return (
    <div className="h-screen bg-[#0b0f1e] text-white flex flex-col overflow-hidden">
      {/* 헤더 */}
      <header className="shrink-0 px-8 py-4 border-b border-slate-700/60 flex items-center gap-4">
        <span className="text-base">🪐</span>
        <h1 className="text-sm font-bold tracking-[0.25em] text-slate-100">COSMIC HUSTLE</h1>

        {/* 탭 */}
        <div className="flex items-center gap-1 ml-6 bg-slate-800 rounded-full p-1 border border-slate-700">
          {(["dashboard", "office"] as PageTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-4 py-1.5 rounded-full text-xs font-medium tracking-wide transition-all"
              style={
                tab === t
                  ? { background: "#1e3a5f", color: "#93c5fd" }
                  : { color: "#94a3b8" }
              }
            >
              {t === "dashboard" ? "대시보드" : "사무실"}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {phase === "working" && topic && (
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full text-xs" style={{ background: "#0d1222", border: "1px solid #1e2a40" }}>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-300 max-w-48 truncate">{topic}</span>
            </div>
          )}
          {phase === "done" && (
            <button
              onClick={reset}
              className="text-xs text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-500 rounded-full px-4 py-1.5 transition-all"
            >
              초기화
            </button>
          )}
          <button
            onClick={() => { if (phase !== "working") setShowSetup(true); }}
            disabled={phase === "working"}
            className="text-xs font-bold px-5 py-1.5 rounded-full transition-all"
            style={{
              background: phase !== "working" ? "linear-gradient(135deg, #1e3a5f, #2a4f7c)" : "#1a2235",
              color: phase !== "working" ? "#93c5fd" : "#334155",
              border: `1px solid ${phase !== "working" ? "#2a5a9c" : "#1e2535"}`,
            }}
          >
            새 프로젝트 +
          </button>
        </div>
      </header>

      {/* 컨텐츠 */}
      <div className="flex-1 overflow-hidden">
        {tab === "dashboard" && (
          <div className="h-full grid grid-cols-2 grid-rows-2 gap-4 p-6">
            <div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-5 overflow-hidden">
              <OngoingProject topic={topic} phase={phase} agentStatus={agentStatus} handoffs={handoffs} />
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-5 overflow-hidden">
              <ReportBoard reports={reports} />
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-5 overflow-hidden">
              <HistoryIdeaPanel projects={history} ideas={pingIdeas} />
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-5 overflow-hidden">
              <MemoWikiPanel />
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
          onClose={() => setShowSetup(false)}
        />
      )}

      {phase === "working" && (
        <ProjectWorkView
          topic={topic}
          agentStatus={agentStatus}
          agentExpression={agentExpression}
          speaking={speaking}
          lastMessage={lastMessage}
          streamLog={streamLog}
        />
      )}
    </div>
  );
}
