"use client";

import { useState } from "react";
import { AGENTS, DEPARTMENTS, AgentStatus, DEPT_MAP, AgentDef } from "@/lib/agents";
import AgentProfile from "./AgentProfile";
import AgentImage from "./AgentImage";

type Props = {
  agentStatus: Record<string, AgentStatus>;
  speaking: Record<string, boolean>;
  lastMessage: Record<string, string>;
};

export default function OfficePage({ agentStatus, speaking, lastMessage }: Props) {
  const [selected, setSelected] = useState<AgentDef | null>(null);

  return (
    <>
      <div className="h-full px-8 py-5 flex flex-col">
        <p className="text-[10px] text-slate-300 tracking-[0.2em] uppercase mb-4 shrink-0 font-bold">
          Office Floor
        </p>

        <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-3 overflow-hidden">
          {DEPARTMENTS.map((dept) => {
            const members = AGENTS.filter((a) => a.departmentId === dept.id);
            if (members.length === 0) return null;

            return (
              <div
                key={dept.id}
                className="rounded-2xl border p-4 flex flex-col overflow-hidden"
                style={{
                  borderColor: `${dept.color}20`,
                  background: `${dept.color}05`,
                }}
              >
                {/* 부서 헤더 */}
                <div className="flex items-center gap-2 mb-3 shrink-0">
                  <dept.icon size={11} style={{ color: `${dept.color}80` }} />
                  <span
                    className="text-[10px] font-bold tracking-[0.2em]"
                    style={{ color: `${dept.color}90` }}
                  >
                    {dept.name}
                  </span>
                  <span className="text-[9px] text-slate-400">{dept.label}</span>
                </div>

                {/* 멤버 자리 */}
                <div className="flex-1 flex items-center justify-center gap-8 flex-wrap">
                  {members.map((agent) => {
                    const status = agentStatus[agent.id] ?? "idle";
                    const isActive = status === "active";
                    const isDone = status === "done";
                    const isWaiting = status === "waiting";
                    const isSpeaking = speaking[agent.id];
                    const msg = lastMessage[agent.id];

                    return (
                      <div
                        key={agent.id}
                        className="relative flex flex-col items-center gap-2 cursor-pointer group"
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
                                background: "#13182a",
                                border: `1px solid ${agent.color}40`,
                                boxShadow: `0 4px 24px ${agent.glow}`,
                              }}
                            >
                              {msg}
                              <div
                                className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-45"
                                style={{
                                  background: "#13182a",
                                  borderRight: `1px solid ${agent.color}40`,
                                  borderBottom: `1px solid ${agent.color}40`,
                                }}
                              />
                            </div>
                          </div>
                        )}

                        {/* 자리 (책상 느낌) */}
                        <div
                          className="flex flex-col items-center gap-2 rounded-2xl p-3 transition-all duration-300 group-hover:bg-slate-800/40"
                          style={{
                            border: isActive
                              ? `1px solid ${agent.color}40`
                              : "1px solid transparent",
                            background: isActive ? `${agent.color}08` : "transparent",
                          }}
                        >
                          {/* 아바타 */}
                          <div className="relative">
                            {isActive && (
                              <div
                                className="absolute inset-0 rounded-full animate-ping"
                                style={{
                                  background: agent.glow,
                                  transform: "scale(1.4)",
                                  opacity: 0.3,
                                }}
                              />
                            )}
                            <div
                              className="relative rounded-full overflow-hidden transition-all duration-300"
                              style={{
                                width: 64,
                                height: 64,
                                outline: isActive
                                  ? `2px solid ${agent.color}`
                                  : isDone
                                  ? `1px solid ${agent.color}40`
                                  : `1.5px solid #1e2535`,
                                outlineOffset: 3,
                                boxShadow: isActive
                                  ? `0 0 24px 6px ${agent.glow}`
                                  : "none",
                                opacity: isWaiting ? 0.2 : 1,
                              }}
                            >
                              <AgentImage defaultSrc={agent.image} size={64} cycle={status === "idle"} />
                              {isDone && (
                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                  <span className="text-sm">✓</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* 이름표 */}
                          <div className="text-center">
                            <p
                              className="text-xs font-semibold"
                              style={{
                                color: isActive
                                  ? agent.color
                                  : isDone
                                  ? `${agent.color}55`
                                  : "#64748b",
                              }}
                            >
                              {agent.name}
                            </p>
                            <p className="text-[9px] text-slate-400 mt-0.5">
                              {agent.title} · {agent.role}
                            </p>
                          </div>
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
        <AgentProfile agent={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
