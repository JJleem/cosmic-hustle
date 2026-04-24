"use client";

import { useState } from "react";
import { AGENTS, AGENT_MAP, PIPELINE, DEPARTMENTS, AgentStatus, AgentDef } from "@/lib/agents";
import AgentWorkspace, { Idea } from "./AgentWorkspace";
import AgentImage from "./AgentImage";

type Props = {
  agentStatus: Record<string, AgentStatus>;
  agentExpression: Record<string, string | null>;
  speaking: Record<string, boolean>;
  lastMessage: Record<string, string>;
  pingIdeas: Idea[];
  lastTopic: string;
};

// 에이전트별 고정 모니터 바 높이
const MONITOR_BARS: Record<string, number[]> = {
  wiki:  [6, 12, 8, 10, 6],
  pocke: [10, 6, 14, 8, 12],
  ka:    [14, 8, 12, 6, 10],
  over:  [8, 14, 6, 12, 8],
  fact:  [6, 6, 14, 6, 6],
  ping:  [12, 14, 10, 14, 8],
};

export default function OfficePage({ agentStatus, agentExpression, speaking, lastMessage, pingIdeas, lastTopic }: Props) {
  const [selected, setSelected] = useState<AgentDef | null>(null);

  const activeStageIdx = PIPELINE.findIndex((s) =>
    s.ids.some((id) => agentStatus[id] === "active")
  );

  return (
    <>
      <div className="h-full px-8 py-5 flex flex-col gap-3">

        {/* 파이프라인 플로우 */}
        <div className="shrink-0 flex items-center gap-1 overflow-x-auto pb-0.5">
          <span className="text-[9px] text-slate-600 tracking-[0.2em] uppercase mr-3 font-bold whitespace-nowrap shrink-0">
            Pipeline
          </span>
          {PIPELINE.map((stage, i) => {
            const isActive = i === activeStageIdx;
            const isDone = activeStageIdx !== -1 && i < activeStageIdx;
            const agent = AGENT_MAP[stage.ids[0]];

            return (
              <div key={i} className="flex items-center gap-1 shrink-0">
                {i > 0 && (
                  <div
                    className="w-5 h-px transition-all duration-700"
                    style={{
                      background: isDone
                        ? `${agent.color}60`
                        : isActive
                        ? `${agent.color}40`
                        : "#1a2030",
                    }}
                  />
                )}
                <div
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold tracking-wide transition-all duration-500"
                  style={
                    isActive
                      ? {
                          background: `${agent.color}18`,
                          border: `1px solid ${agent.color}55`,
                          color: agent.color,
                          boxShadow: `0 0 10px ${agent.glow}`,
                        }
                      : isDone
                      ? {
                          background: `${agent.color}08`,
                          border: `1px solid ${agent.color}20`,
                          color: `${agent.color}60`,
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
                    : agent.name}
                </div>
              </div>
            );
          })}
        </div>

        {/* 부서 그리드 */}
        <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-3 overflow-hidden">
          {DEPARTMENTS.map((dept) => {
            const members = AGENTS.filter((a) => a.departmentId === dept.id);
            if (members.length === 0) return null;

            const deptHasActive = members.some((a) => agentStatus[a.id] === "active");

            return (
              <div
                key={dept.id}
                className="rounded-2xl border p-4 flex flex-col overflow-hidden relative transition-all duration-500"
                style={{
                  borderColor: deptHasActive ? `${dept.color}30` : `${dept.color}12`,
                  background: deptHasActive ? `${dept.color}07` : `${dept.color}03`,
                }}
              >
                {/* 배경 도트 그리드 */}
                <div
                  className="absolute inset-0 rounded-2xl pointer-events-none"
                  style={{
                    backgroundImage: `radial-gradient(circle, ${dept.color}12 1px, transparent 1px)`,
                    backgroundSize: "20px 20px",
                    opacity: deptHasActive ? 1 : 0.4,
                    transition: "opacity 0.5s",
                  }}
                />

                {/* 부서 헤더 */}
                <div className="flex items-center gap-2 mb-3 shrink-0 relative">
                  <dept.icon size={11} style={{ color: `${dept.color}80` }} />
                  <span
                    className="text-[10px] font-bold tracking-[0.2em]"
                    style={{ color: `${dept.color}90` }}
                  >
                    {dept.name}
                  </span>
                  <span className="text-[9px] text-slate-600">{dept.label}</span>
                  {deptHasActive && (
                    <div
                      className="ml-auto w-1.5 h-1.5 rounded-full animate-pulse"
                      style={{ background: dept.color }}
                    />
                  )}
                </div>

                {/* 에이전트 자리 */}
                <div className="flex-1 flex items-center justify-center gap-6 flex-wrap relative">
                  {members.map((agent) => {
                    const status = agentStatus[agent.id] ?? "idle";
                    const isActive = status === "active";
                    const isDone = status === "done";
                    const isWaiting = status === "waiting";
                    const isSpeaking = speaking[agent.id];
                    const msg = lastMessage[agent.id];
                    const bars = MONITOR_BARS[agent.id] ?? [8, 12, 8, 10, 8];

                    return (
                      <div
                        key={agent.id}
                        className="relative flex flex-col items-center gap-1.5 cursor-pointer group"
                        onClick={() => setSelected(agent)}
                      >
                        {/* 말풍선 */}
                        {msg && (isActive || isSpeaking) && (
                          <div
                            className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 z-10 animate-fadeIn"
                            style={{ minWidth: 130, maxWidth: 200 }}
                          >
                            <div
                              className="relative rounded-2xl rounded-b-sm px-3 py-2 text-[11px] text-slate-200 leading-snug"
                              style={{
                                background: "#0f1521",
                                border: `1px solid ${agent.color}40`,
                                boxShadow: `0 4px 20px ${agent.glow}`,
                              }}
                            >
                              {msg}
                              <div
                                className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-45"
                                style={{
                                  background: "#0f1521",
                                  borderRight: `1px solid ${agent.color}40`,
                                  borderBottom: `1px solid ${agent.color}40`,
                                }}
                              />
                            </div>
                          </div>
                        )}

                        {/* 책상 영역 */}
                        <div
                          className="flex flex-col items-center gap-2 rounded-2xl px-3 pt-2 pb-3 transition-all duration-300 group-hover:bg-slate-800/30"
                          style={{
                            border: isActive
                              ? `1px solid ${agent.color}35`
                              : "1px solid transparent",
                            background: isActive ? `${agent.color}06` : "transparent",
                          }}
                        >
                          {/* 모니터 스크린 */}
                          <div
                            className="w-14 h-8 rounded-md flex items-end justify-center gap-0.5 px-1.5 pb-1.5 transition-all duration-500"
                            style={{
                              background: isActive ? `${agent.color}12` : "#0a0f1a",
                              border: `1px solid ${isActive ? `${agent.color}30` : "#0f1520"}`,
                              boxShadow: isActive ? `0 0 8px ${agent.glow}` : "none",
                            }}
                          >
                            {bars.map((h, bi) => (
                              <div
                                key={bi}
                                className="w-1 rounded-full"
                                style={{
                                  height: isActive ? h : 2,
                                  background: isActive ? agent.color : "#1a2030",
                                  opacity: isActive ? 0.7 : 0.3,
                                  transition: `height 0.4s ease ${bi * 80}ms, background 0.4s ease`,
                                  animation: isActive ? `pulse 1.5s ease-in-out ${bi * 300}ms infinite alternate` : "none",
                                }}
                              />
                            ))}
                          </div>

                          {/* 아바타 */}
                          <div className="relative">
                            {isActive && (
                              <div
                                className="absolute inset-0 rounded-full animate-ping"
                                style={{
                                  background: agent.glow,
                                  transform: "scale(1.4)",
                                  opacity: 0.25,
                                }}
                              />
                            )}
                            <div
                              className="relative rounded-full overflow-hidden transition-all duration-300"
                              style={{
                                width: 60,
                                height: 60,
                                outline: isActive
                                  ? `2px solid ${agent.color}`
                                  : isDone
                                  ? `1px solid ${agent.color}35`
                                  : `1.5px solid #1a2030`,
                                outlineOffset: 3,
                                boxShadow: isActive ? `0 0 20px 4px ${agent.glow}` : "none",
                                opacity: isWaiting ? 0.15 : 1,
                              }}
                            >
                              <AgentImage
                                defaultSrc={agent.image}
                                size={60}
                                status={status}
                                expression={agentExpression[agent.id] ?? null}
                              />
                              {isDone && (
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                  <span className="text-sm">✓</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* 이름표 */}
                          <div className="text-center">
                            <p
                              className="text-xs font-semibold transition-colors duration-300"
                              style={{
                                color: isActive
                                  ? agent.color
                                  : isDone
                                  ? `${agent.color}50`
                                  : "#475569",
                              }}
                            >
                              {agent.name}
                            </p>
                            <p className="text-[9px] text-slate-600 mt-0.5">
                              {agent.title} · {agent.role}
                            </p>
                          </div>

                          {/* 책상 라인 */}
                          <div
                            className="w-16 h-1.5 rounded-full transition-all duration-500"
                            style={{
                              background: isActive
                                ? `linear-gradient(90deg, transparent, ${agent.color}50, transparent)`
                                : isDone
                                ? `${agent.color}18`
                                : "#0d1120",
                              boxShadow: isActive ? `0 0 6px ${agent.glow}` : "none",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selected && (
        <AgentWorkspace
          agent={selected}
          pingIdeas={pingIdeas}
          lastTopic={lastTopic}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
