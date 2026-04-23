"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import BottomAgentBar from "@/components/BottomAgentBar";
import TopicInput from "@/components/TopicInput";
import OngoingProject from "@/components/dashboard/OngoingProject";
import ReportBoard, { Report } from "@/components/dashboard/ReportBoard";
import ProjectHistory, { ProjectRecord } from "@/components/dashboard/ProjectHistory";
import WorkLog, { LogEntry } from "@/components/dashboard/WorkLog";
import { AGENTS, AgentStatus } from "@/lib/agents";
import { DEMO_SEQUENCE } from "@/lib/demoSequence";

type AgentStates = Record<string, AgentStatus>;

const initStatus = (): AgentStates =>
  Object.fromEntries(AGENTS.map((a) => [a.id, "idle"]));

const uid = () => crypto.randomUUID();

export default function Home() {
  const [agentStatus, setAgentStatus] = useState<AgentStates>(initStatus());
  const [speaking, setSpeaking] = useState<Record<string, boolean>>({});
  const [lastMessage, setLastMessage] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<"idle" | "working" | "done">("idle");
  const [topic, setTopic] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [history, setHistory] = useState<ProjectRecord[]>([]);

  const idleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const speak = useCallback((agentId: string, message: string, type: LogEntry["type"] = "idle") => {
    setLastMessage((prev) => ({ ...prev, [agentId]: message }));
    setSpeaking((prev) => ({ ...prev, [agentId]: true }));
    setLogs((prev) => [
      ...prev,
      { id: uid(), agentId, message, type, time: new Date() },
    ]);
    setTimeout(() => setSpeaking((prev) => ({ ...prev, [agentId]: false })), 2500);
  }, []);

  // idle 랜덤 중얼거림
  useEffect(() => {
    if (phase !== "idle") return;
    const tick = () => {
      const agent = AGENTS[Math.floor(Math.random() * AGENTS.length)];
      const msg = agent.idleMessages[Math.floor(Math.random() * agent.idleMessages.length)];
      speak(agent.id, msg, "idle");
    };
    tick();
    idleTimerRef.current = setInterval(tick, 3000);
    return () => { if (idleTimerRef.current) clearInterval(idleTimerRef.current); };
  }, [phase, speak]);

  const runDemo = async (inputTopic: string) => {
    if (idleTimerRef.current) clearInterval(idleTimerRef.current);
    setPhase("working");
    setTopic(inputTopic);
    setAgentStatus(Object.fromEntries(AGENTS.map((a) => [a.id, "waiting"])));

    speak("wiki", `"${inputTopic}" — 자료 꺼내는 중.`, "work");

    let cursor = 0;
    while (cursor < DEMO_SEQUENCE.length) {
      const step = DEMO_SEQUENCE[cursor];
      await new Promise((r) => setTimeout(r, step.delay ?? 1000));

      const applyStep = (s: typeof step) => {
        setAgentStatus((prev) => ({ ...prev, [s.agentId]: s.status }));
        speak(s.agentId, s.message, s.status === "done" ? "done" : "work");
      };
      applyStep(step);

      while (cursor + 1 < DEMO_SEQUENCE.length && DEMO_SEQUENCE[cursor + 1].parallel) {
        cursor++;
        const ps = DEMO_SEQUENCE[cursor];
        await new Promise((r) => setTimeout(r, ps.delay ?? 300));
        applyStep(ps);
      }
      cursor++;
    }

    await new Promise((r) => setTimeout(r, 800));

    // 완료 보고서 저장
    setReports((prev) => [
      {
        id: uid(),
        agentId: "fact",
        topic: inputTopic,
        content: "팩트 검토 완료. 데이터 정합성 확인됨. 리포트 품질 기준 충족.",
        createdAt: new Date(),
      },
      {
        id: uid(),
        agentId: "over",
        topic: inputTopic,
        content: "리포트 작성 완료. 감동적인 내러티브로 정리했습니다... 걸작이에요.",
        createdAt: new Date(),
      },
      ...prev,
    ]);

    setHistory((prev) => [
      { id: uid(), topic: inputTopic, completedAt: new Date() },
      ...prev,
    ]);

    setPhase("done");
    speak("wiki", "리서치 완료. 보고서가 준비됐어요.", "done");
  };

  const reset = () => {
    setAgentStatus(initStatus());
    setSpeaking({});
    setLastMessage({});
    setPhase("idle");
    setTopic("");
  };

  return (
    <div className="h-screen bg-[#080c18] text-white flex flex-col overflow-hidden">
      {/* 헤더 */}
      <header className="shrink-0 px-8 py-4 border-b border-slate-800/60 flex items-center gap-4">
        <span className="text-base">🪐</span>
        <h1 className="text-sm font-bold tracking-[0.25em] text-slate-200">COSMIC HUSTLE</h1>
        <span className="text-slate-700 text-xs tracking-widest">SPACE RESEARCH AGENCY</span>
        <div className="ml-auto w-80">
          <TopicInput onSubmit={runDemo} disabled={phase === "working"} />
        </div>
        {phase === "done" && (
          <button
            onClick={reset}
            className="text-xs text-slate-500 hover:text-slate-300 border border-slate-700 hover:border-slate-500 rounded-full px-4 py-1.5 transition-all whitespace-nowrap"
          >
            새 주제
          </button>
        )}
      </header>

      {/* 대시보드 */}
      <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-4 p-6 overflow-hidden">
        {/* 진행중인 프로젝트 */}
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5 overflow-hidden">
          <OngoingProject topic={topic} phase={phase} />
        </div>

        {/* 보고 현황 */}
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5 overflow-hidden">
          <ReportBoard reports={reports} />
        </div>

        {/* 프로젝트 내역 */}
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5 overflow-hidden">
          <ProjectHistory projects={history} />
        </div>

        {/* 업무일지 */}
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5 overflow-hidden">
          <WorkLog logs={logs} />
        </div>
      </div>

      {/* 하단 에이전트 바 */}
      <BottomAgentBar
        agentStatus={agentStatus}
        speaking={speaking}
        lastMessage={lastMessage}
      />
    </div>
  );
}
