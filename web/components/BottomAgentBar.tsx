"use client";

import { useState } from "react";
import Image from "next/image";
import { AGENTS, AgentStatus, DEPT_MAP, AgentDef } from "@/lib/agents";
import AgentProfile from "./AgentProfile";

type Props = {
  agentStatus: Record<string, AgentStatus>;
  speaking: Record<string, boolean>;
  lastMessage: Record<string, string>;
};

export default function BottomAgentBar({ agentStatus, speaking, lastMessage }: Props) {
  const [selected, setSelected] = useState<AgentDef | null>(null);

  return (
    <>
      <div className="shrink-0 border-t border-slate-800/60 bg-[#080c18]/95 backdrop-blur px-6 py-3">
        <div className="flex items-end justify-center gap-6">
          {AGENTS.map((agent) => {
            const status = agentStatus[agent.id] ?? "idle";
            const isActive = status === "active";
            const isDone = status === "done";
            const isWaiting = status === "waiting";
            const isSpeaking = speaking[agent.id];
            const msg = lastMessage[agent.id];
            const dept = DEPT_MAP[agent.departmentId];

            return (
              <div
                key={agent.id}
                className="relative flex flex-col items-center gap-1 cursor-pointer group"
                onClick={() => setSelected(agent)}
              >
                {/* 말풍선 */}
                {msg && (isActive || isSpeaking) && (
                  <div
                    className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 z-20 animate-fadeIn"
                    style={{ minWidth: 120, maxWidth: 180 }}
                  >
                    <div
                      className="relative rounded-2xl rounded-b-sm px-3 py-2 text-[11px] text-slate-200 leading-snug"
                      style={{
                        background: "#13182a",
                        border: `1px solid ${agent.color}40`,
                        boxShadow: `0 4px 20px ${agent.glow}`,
                      }}
                    >
                      {msg}
                      {/* 꼬리 */}
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

                {/* 아바타 */}
                <div className="relative">
                  {isActive && (
                    <div
                      className="absolute inset-0 rounded-full animate-ping"
                      style={{ background: agent.glow, transform: "scale(1.4)", opacity: 0.3 }}
                    />
                  )}
                  <div
                    className="relative rounded-full overflow-hidden transition-all duration-300 group-hover:scale-110"
                    style={{
                      width: 52,
                      height: 52,
                      outline: isActive
                        ? `2px solid ${agent.color}`
                        : isDone
                        ? `1px solid ${agent.color}40`
                        : `1.5px solid #1e2535`,
                      outlineOffset: 2,
                      boxShadow: isActive ? `0 0 18px 4px ${agent.glow}` : "none",
                      opacity: isWaiting ? 0.2 : 1,
                    }}
                  >
                    <Image src={agent.image} alt={agent.name} fill className="object-cover" sizes="52px" />
                    {isDone && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <span className="text-xs">✓</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 이름 */}
                <p
                  className="text-[9px] font-semibold tracking-wide transition-colors"
                  style={{ color: isActive ? agent.color : "#475569" }}
                >
                  {agent.name}
                </p>

                {/* 직급 · 직군 */}
                <p className="text-[8px] text-slate-700 tracking-wide">
                  {agent.title} · {agent.role}
                </p>

                {/* 부서 dot */}
                {dept && (
                  <div
                    className="w-1 h-1 rounded-full"
                    style={{ background: isActive ? dept.color : `${dept.color}40` }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {selected && <AgentProfile agent={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
