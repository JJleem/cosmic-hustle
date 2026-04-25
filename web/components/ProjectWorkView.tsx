"use client";

import { useEffect, useRef } from "react";
import { AGENTS, AGENT_MAP, PIPELINE, AgentStatus } from "@/lib/agents";
import AgentImage from "./AgentImage";

type Props = {
  topic: string;
  agentStatus: Record<string, AgentStatus>;
  agentExpression: Record<string, string | null>;
  speaking: Record<string, boolean>;
  lastMessage: Record<string, string>;
  streamLog: Record<string, string>;
};

export default function ProjectWorkView({
  topic,
  agentStatus,
  agentExpression,
  speaking,
  lastMessage,
  streamLog,
}: Props) {
  const logRef = useRef<HTMLDivElement>(null);
  // 에이전트 전환 중 null 순간에도 마지막 에이전트 유지 (깜박임 방지)
  const lastAgentRef = useRef(AGENTS[0]);

  const activeAgentId =
    AGENTS.find((a) => agentStatus[a.id] === "active")?.id ?? null;
  const activeAgent = activeAgentId ? AGENT_MAP[activeAgentId] : null;
  if (activeAgent) lastAgentRef.current = activeAgent;
  const displayAgent = activeAgent ?? lastAgentRef.current;

  // disabled 상태가 아닌 스테이지만 파이프라인에 표시
  const visiblePipeline = PIPELINE.filter((stage) =>
    stage.ids.some((id) => agentStatus[id] !== "disabled")
  );

  const activeStageIdx = visiblePipeline.findIndex((s) =>
    s.ids.some((id) => agentStatus[id] === "active")
  );

  const currentLog = activeAgentId ? streamLog[activeAgentId] ?? "" : "";
  const isSpeaking = speaking[displayAgent.id];
  const msg = lastMessage[displayAgent.id] ?? "";

  // 로그 자동 스크롤
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [currentLog]);

  return (
    <div
      className="fixed inset-0 z-50 flex"
      style={{ background: "#070b14" }}
    >
      {/* 왼쪽 — 에이전트 패널 */}
      <div
        className="w-80 shrink-0 flex flex-col items-center justify-center gap-6 px-8 py-10 relative border-r"
        style={{ borderColor: `${displayAgent.color}15`, background: `${displayAgent.color}04` }}
      >
        {/* 배경 글로우 */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at 50% 40%, ${displayAgent.glow} 0%, transparent 65%)`,
            opacity: 0.12,
          }}
        />

        {/* 말풍선 */}
        {msg && isSpeaking && (
          <div
            className="absolute top-10 left-1/2 -translate-x-1/2 z-10 animate-fadeIn w-56"
          >
            <div
              className="rounded-2xl rounded-b-sm px-4 py-2.5 text-xs text-slate-200 leading-relaxed text-center"
              style={{
                background: "#0f1521",
                border: `1px solid ${displayAgent.color}40`,
                boxShadow: `0 4px 24px ${displayAgent.glow}`,
              }}
            >
              {msg}
              <div
                className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45"
                style={{
                  background: "#0f1521",
                  borderRight: `1px solid ${displayAgent.color}40`,
                  borderBottom: `1px solid ${displayAgent.color}40`,
                }}
              />
            </div>
          </div>
        )}

        {/* 에이전트 이미지 */}
        <div className="relative mt-10">
          <div
            className="absolute inset-0 rounded-full animate-ping"
            style={{
              background: displayAgent.glow,
              transform: "scale(1.5)",
              opacity: 0.15,
              animationDuration: "2s",
            }}
          />
          <div
            className="relative rounded-full overflow-hidden"
            style={{
              width: 140,
              height: 140,
              outline: `2px solid ${displayAgent.color}`,
              outlineOffset: 4,
              boxShadow: `0 0 40px 8px ${displayAgent.glow}`,
            }}
          >
            <AgentImage
              defaultSrc={displayAgent.image}
              size={140}
              status="active"
              expression={agentExpression[displayAgent.id] ?? null}
            />
          </div>
        </div>

        {/* 이름 & 직책 */}
        <div className="relative text-center">
          <p className="text-2xl font-bold" style={{ color: displayAgent.color }}>
            {displayAgent.name}
          </p>
          <p className="text-sm text-slate-400 mt-0.5">
            {displayAgent.title} · {displayAgent.role}
          </p>
        </div>

        {/* 프로젝트 주제 */}
        <div
          className="relative w-full rounded-xl px-4 py-3"
          style={{
            background: "#0c1020",
            border: `1px solid ${displayAgent.color}20`,
          }}
        >
          <p className="text-[10px] text-slate-500 tracking-widest uppercase mb-1">Project</p>
          <p className="text-sm text-slate-200 font-medium leading-snug">{topic}</p>
        </div>

        {/* 담당 업무 */}
        <div className="relative w-full">
          <p className="text-[10px] text-slate-600 tracking-widest uppercase mb-2">담당 업무</p>
          <ul className="flex flex-col gap-1.5">
            {displayAgent.responsibilities.map((r, i) => (
              <li key={i} className="flex items-center gap-2 text-xs text-slate-400">
                <span style={{ color: `${displayAgent.color}80` }}>▸</span>
                {r}
              </li>
            ))}
          </ul>
        </div>

        {/* 파이프라인 진행 — 활성 에이전트만 표시 */}
        <div className="relative w-full mt-auto">
          <p className="text-[10px] text-slate-600 tracking-widest uppercase mb-2">Pipeline</p>
          <div className="flex items-center gap-1 flex-wrap">
            {visiblePipeline.map((stage, i) => {
              const stageAgent = AGENT_MAP[stage.ids[0]];
              const isActive = i === activeStageIdx;
              const isDone = activeStageIdx !== -1 && i < activeStageIdx;
              return (
                <div key={stage.ids.join("+")} className="flex items-center gap-1">
                  {i > 0 && (
                    <div
                      className="w-3 h-px"
                      style={{
                        background: isDone ? `${stageAgent.color}50` : "#1a2030",
                      }}
                    />
                  )}
                  <div
                    className="px-2 py-0.5 rounded-full text-[9px] font-semibold transition-all"
                    style={
                      isActive
                        ? {
                            background: `${stageAgent.color}20`,
                            border: `1px solid ${stageAgent.color}60`,
                            color: stageAgent.color,
                          }
                        : isDone
                        ? {
                            background: `${stageAgent.color}08`,
                            border: `1px solid ${stageAgent.color}20`,
                            color: `${stageAgent.color}50`,
                          }
                        : {
                            background: "transparent",
                            border: "1px solid #1a2030",
                            color: "#2a3347",
                          }
                    }
                  >
                    {stage.ids.length > 1
                      ? stage.ids.map((id) => AGENT_MAP[id].name).join("+")
                      : stageAgent.name}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 오른쪽 — 스트리밍 로그 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 헤더 */}
        <div
          className="shrink-0 px-6 py-4 flex items-center gap-3 border-b"
          style={{ borderColor: "#0f1520" }}
        >
          <div
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ background: displayAgent.color }}
          />
          <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: displayAgent.color }}>
            Live Output
          </span>
          <span className="text-xs text-slate-600 ml-2">{displayAgent.name} 작업 중...</span>
        </div>

        {/* 로그 영역 */}
        <div
          ref={logRef}
          className="flex-1 overflow-y-auto px-6 py-5 font-mono text-xs leading-relaxed"
          style={{ color: "#8899aa" }}
        >
          {currentLog ? (
            <pre className="whitespace-pre-wrap break-words">{currentLog}<span className="animate-pulse" style={{ color: displayAgent.color }}>▋</span></pre>
          ) : (
            <div className="flex items-center gap-2 text-slate-700 mt-4">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full animate-bounce"
                    style={{
                      background: displayAgent.color,
                      opacity: 0.4,
                      animationDelay: `${i * 150}ms`,
                    }}
                  />
                ))}
              </div>
              <span>작업 준비 중...</span>
            </div>
          )}
        </div>

        {/* 완료된 에이전트 요약 */}
        <div
          className="shrink-0 border-t px-6 py-3 flex items-center gap-3 overflow-x-auto"
          style={{ borderColor: "#0f1520" }}
        >
          <span className="text-[10px] text-slate-700 tracking-widest uppercase shrink-0">완료</span>
          {AGENTS.filter((a) => agentStatus[a.id] === "done").map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full shrink-0"
              style={{
                background: `${a.color}10`,
                border: `1px solid ${a.color}25`,
              }}
            >
              <span className="text-[10px]" style={{ color: `${a.color}80` }}>✓</span>
              <span className="text-[10px]" style={{ color: `${a.color}70` }}>{a.name}</span>
            </div>
          ))}
          {AGENTS.filter((a) => agentStatus[a.id] === "done").length === 0 && (
            <span className="text-[10px] text-slate-800">아직 없음</span>
          )}
        </div>
      </div>
    </div>
  );
}
