"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import AgentAvatar from "@/components/AgentAvatar";
import ChatFeed, { ChatMessage } from "@/components/ChatFeed";
import TopicInput from "@/components/TopicInput";
import { AGENTS, AgentStatus } from "@/lib/agents";
import { DEMO_SEQUENCE } from "@/lib/demoSequence";

type AgentStates = Record<string, AgentStatus>;
type SpeakingStates = Record<string, boolean>;

const initStatus = (): AgentStates =>
  Object.fromEntries(AGENTS.map((a) => [a.id, "idle"]));

let msgCounter = 0;
const newId = () => `msg-${++msgCounter}`;

export default function Home() {
  const [agentStatus, setAgentStatus] = useState<AgentStates>(initStatus());
  const [speaking, setSpeaking] = useState<SpeakingStates>({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [phase, setPhase] = useState<"idle" | "working" | "done">("idle");

  const idleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const addMessage = useCallback((agentId: string, text: string, type: ChatMessage["type"]) => {
    setMessages((prev) => [...prev.slice(-60), { id: newId(), agentId, text, type }]);
    setSpeaking((prev) => ({ ...prev, [agentId]: true }));
    setTimeout(() => setSpeaking((prev) => ({ ...prev, [agentId]: false })), 1200);
  }, []);

  // idle 애니메이션 — 랜덤 에이전트가 랜덤 메시지 계속 중얼거림
  useEffect(() => {
    if (phase !== "idle") return;

    const tick = () => {
      const agent = AGENTS[Math.floor(Math.random() * AGENTS.length)];
      const msg = agent.idleMessages[Math.floor(Math.random() * agent.idleMessages.length)];
      addMessage(agent.id, msg, "idle");
    };

    tick(); // 첫 메시지 바로
    idleTimerRef.current = setInterval(tick, 2800);

    return () => {
      if (idleTimerRef.current) clearInterval(idleTimerRef.current);
    };
  }, [phase, addMessage]);

  const runDemo = async (topic: string) => {
    if (idleTimerRef.current) clearInterval(idleTimerRef.current);

    setPhase("working");
    setMessages([]);
    setAgentStatus(Object.fromEntries(AGENTS.map((a) => [a.id, "waiting"])));

    // 시작 메시지
    addMessage("wiki", `"${topic}" — 조용히 자료 꺼내는 중.`, "work");

    let cursor = 0;

    while (cursor < DEMO_SEQUENCE.length) {
      const step = DEMO_SEQUENCE[cursor];
      const delay = step.delay ?? 1000;

      await new Promise((r) => setTimeout(r, delay));

      // 현재 스텝 실행
      const applyStep = (s: typeof step) => {
        setAgentStatus((prev) => ({ ...prev, [s.agentId]: s.status }));
        addMessage(s.agentId, s.message, s.status === "done" ? "done" : "work");
      };

      applyStep(step);

      // 다음 스텝이 parallel이면 같이 실행
      while (
        cursor + 1 < DEMO_SEQUENCE.length &&
        DEMO_SEQUENCE[cursor + 1].parallel
      ) {
        cursor++;
        const parallelStep = DEMO_SEQUENCE[cursor];
        await new Promise((r) => setTimeout(r, parallelStep.delay ?? 300));
        applyStep(parallelStep);
      }

      cursor++;
    }

    await new Promise((r) => setTimeout(r, 600));
    setPhase("done");
    addMessage("wiki", "리서치 완료. 리포트가 준비됐어요.", "done");
  };

  const reset = () => {
    setAgentStatus(initStatus());
    setSpeaking({});
    setMessages([]);
    setPhase("idle");
  };

  return (
    <div className="h-screen bg-[#080c18] text-white flex flex-col overflow-hidden">
      {/* 헤더 */}
      <header className="shrink-0 px-8 py-4 border-b border-slate-800/60 flex items-center gap-3">
        <span className="text-lg">🪐</span>
        <h1 className="text-sm font-bold tracking-[0.25em] text-slate-200">COSMIC HUSTLE</h1>
        <span className="text-slate-600 text-xs tracking-widest ml-1">SPACE RESEARCH AGENCY</span>
        {phase === "done" && (
          <button
            onClick={reset}
            className="ml-auto text-xs text-slate-500 hover:text-slate-300 border border-slate-700 hover:border-slate-500 rounded-full px-4 py-1.5 transition-all"
          >
            새 주제 던지기
          </button>
        )}
      </header>

      {/* 메인 */}
      <div className="flex-1 flex overflow-hidden">

        {/* 왼쪽: 오피스 */}
        <div className="w-[380px] shrink-0 flex flex-col border-r border-slate-800/60 p-8 gap-8">
          <div>
            <p className="text-[10px] text-slate-600 tracking-[0.2em] uppercase mb-6">Office Floor</p>
            <div className="grid grid-cols-3 gap-x-4 gap-y-8 justify-items-center">
              {AGENTS.map((agent) => (
                <AgentAvatar
                  key={agent.id}
                  agent={agent}
                  status={agentStatus[agent.id] ?? "idle"}
                  speaking={speaking[agent.id] ?? false}
                />
              ))}
            </div>
          </div>

          <div className="mt-auto">
            <TopicInput onSubmit={runDemo} disabled={phase === "working"} />
          </div>
        </div>

        {/* 오른쪽: 채팅 피드 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="shrink-0 px-6 py-4 border-b border-slate-800/40">
            <p className="text-[10px] text-slate-600 tracking-[0.2em] uppercase">
              {phase === "idle" && "Team Chat"}
              {phase === "working" && "▶ Researching..."}
              {phase === "done" && "✓ Complete"}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            <ChatFeed messages={messages} />
          </div>
        </div>
      </div>
    </div>
  );
}
