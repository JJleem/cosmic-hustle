"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import BottomAgentBar from "@/components/BottomAgentBar";
import TopicInput from "@/components/TopicInput";
import OfficePage from "@/components/OfficePage";
import OngoingProject from "@/components/dashboard/OngoingProject";
import ReportBoard, { Report } from "@/components/dashboard/ReportBoard";
import ProjectHistory, { ProjectRecord } from "@/components/dashboard/ProjectHistory";
import MemoBoard from "@/components/dashboard/MemoBoard";
import WikiIngest from "@/components/dashboard/WikiIngest";
import { AGENTS, AgentStatus } from "@/lib/agents";

type PageTab = "dashboard" | "office";

type AgentStates = Record<string, AgentStatus>;

const initStatus = (): AgentStates =>
  Object.fromEntries(AGENTS.map((a) => [a.id, "idle"]));

const uid = () => crypto.randomUUID();

export default function Home() {
  const [tab, setTab] = useState<PageTab>("dashboard");
  const [bottomTab, setBottomTab] = useState<"memo" | "wiki">("memo");
  const [agentStatus, setAgentStatus] = useState<AgentStates>(initStatus());
  const [agentExpression, setAgentExpression] = useState<Record<string, string | null>>({});
  const [speaking, setSpeaking] = useState<Record<string, boolean>>({});
  const [lastMessage, setLastMessage] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<"idle" | "working" | "done">("idle");
  const [topic, setTopic] = useState("");
  const [reports, setReports] = useState<Report[]>([]);
  const [history, setHistory] = useState<ProjectRecord[]>([]);

  const idleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
          speak(event.agentId as string, event.message as string);
          break;
        case "agent_message":
          speak(event.agentId as string, event.message as string);
          break;
        case "agent_done":
          setAgentStatus((prev) => ({ ...prev, [event.agentId as string]: "done" }));
          speak(event.agentId as string, event.message as string);
          break;
        case "agent_expression":
          setAgentExpression((prev) => ({ ...prev, [event.agentId as string]: (event.expression as string | null) ?? null }));
          break;
        case "report":
          setReports((prev) => [
            {
              id: uid(),
              agentId: event.agentId as string,
              topic: (event.topic as string) ?? inputTopic,
              content: event.content as string,
              createdAt: new Date(),
            },
            ...prev,
          ]);
          break;
        case "complete":
          setHistory((prev) => [
            { id: uid(), topic: inputTopic, completedAt: new Date() },
            ...prev,
          ]);
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

  const runResearch = async (inputTopic: string) => {
    if (idleTimerRef.current) clearInterval(idleTimerRef.current);
    setPhase("working");
    setTopic(inputTopic);
    setAgentStatus(Object.fromEntries(AGENTS.map((a) => [a.id, "waiting"])));

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: inputTopic }),
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
            handleSSE(event, inputTopic);
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

        <div className="ml-auto w-80">
          <TopicInput onSubmit={runResearch} disabled={phase === "working"} />
        </div>
        {phase === "done" && (
          <button
            onClick={reset}
            className="text-xs text-slate-300 hover:text-white border border-slate-600 hover:border-slate-400 rounded-full px-4 py-1.5 transition-all whitespace-nowrap"
          >
            새 주제
          </button>
        )}
      </header>

      {/* 컨텐츠 */}
      <div className="flex-1 overflow-hidden">
        {tab === "dashboard" && (
          <div className="h-full grid grid-cols-2 grid-rows-2 gap-4 p-6">
            <div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-5 overflow-hidden">
              <OngoingProject topic={topic} phase={phase} />
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-5 overflow-hidden">
              <ReportBoard reports={reports} />
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-5 overflow-hidden">
              <ProjectHistory projects={history} />
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-5 overflow-hidden flex flex-col">
              <div className="flex gap-1 mb-3 shrink-0">
                {(["memo", "wiki"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setBottomTab(t)}
                    className="px-3 py-1 rounded-full text-[10px] font-medium tracking-wide transition-all"
                    style={bottomTab === t ? { background: "#1e3a5f", color: "#93c5fd" } : { color: "#94a3b8" }}
                  >
                    {t === "memo" ? "메모" : "위키 저장"}
                  </button>
                ))}
              </div>
              <div className="flex-1 min-h-0">
                {bottomTab === "memo" ? <MemoBoard /> : <WikiIngest />}
              </div>
            </div>
          </div>
        )}

        {tab === "office" && (
          <OfficePage
            agentStatus={agentStatus}
            agentExpression={agentExpression}
            speaking={speaking}
            lastMessage={lastMessage}
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
    </div>
  );
}
