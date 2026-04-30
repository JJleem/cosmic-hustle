"use client";

import { useState } from "react";
import { AGENTS, AgentStatus, DEPT_MAP, AgentDef } from "@/lib/agents";
import AgentChat from "./AgentChat";
import AgentImage from "./AgentImage";

type Props = {
  agentStatus: Record<string, AgentStatus>;
  agentExpression: Record<string, string | null>;
  speaking: Record<string, boolean>;
  lastMessage: Record<string, string>;
  hideBubbles?: boolean;
};

export default function BottomAgentBar({ agentStatus, agentExpression, speaking, lastMessage, hideBubbles = false }: Props) {
  const [selected, setSelected] = useState<AgentDef | null>(null);

  return (
    <>
      <div
        className="shrink-0 px-6 py-3"
        style={{
          borderTop: "1px solid rgba(255,255,255,0.055)",
          background: "rgba(7,9,26,0.75)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
        }}
      >
        <div className="flex items-end justify-center gap-5">
          {AGENTS.map((agent) => {
            const status = agentStatus[agent.id] ?? "idle";
            const isActive = status === "active";
            const isDone = status === "done";
            const isWaiting = status === "waiting";
            const isDisabled = status === "disabled";
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
                {!hideBubbles && msg && isSpeaking && (
                  <div
                    className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 z-20 animate-fadeIn"
                    style={{ minWidth: 100, maxWidth: 168 }}
                  >
                    <div
                      className="relative rounded-2xl rounded-b-sm px-3 py-2 text-[11px] text-slate-200 leading-snug"
                      style={{
                        background: "rgba(13,18,42,0.92)",
                        backdropFilter: "blur(12px)",
                        border: `1px solid ${agent.color}30`,
                        boxShadow: `0 4px 24px ${agent.glow}, inset 0 1px 0 rgba(255,255,255,0.06)`,
                      }}
                    >
                      {msg}
                      <div
                        className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-45"
                        style={{
                          background: "rgba(13,18,42,0.92)",
                          borderRight: `1px solid ${agent.color}30`,
                          borderBottom: `1px solid ${agent.color}30`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* 아바타 */}
                <div className="relative">
                  {isActive && (
                    <>
                      <div
                        className="absolute inset-0 rounded-full animate-ping"
                        style={{ background: agent.glow, transform: "scale(1.5)", opacity: 0.2 }}
                      />
                      <div
                        className="absolute inset-0 rounded-full"
                        style={{ boxShadow: `0 0 20px 4px ${agent.glow}`, borderRadius: "50%" }}
                      />
                    </>
                  )}
                  <div
                    className="relative rounded-full overflow-hidden transition-all duration-300 group-hover:scale-110"
                    style={{
                      width: 48,
                      height: 48,
                      outline: isActive
                        ? `2px solid ${agent.color}`
                        : isDone
                        ? `1px solid ${agent.color}35`
                        : `1px solid rgba(255,255,255,0.07)`,
                      outlineOffset: 2,
                      opacity: isDisabled ? 0.12 : isWaiting ? 0.25 : 1,
                      filter: isDisabled ? "grayscale(1)" : "none",
                      boxShadow: isActive
                        ? `0 0 0 1px ${agent.color}20, inset 0 1px 0 rgba(255,255,255,0.08)`
                        : isDone
                        ? `inset 0 1px 0 rgba(255,255,255,0.05)`
                        : "none",
                    }}
                  >
                    <AgentImage defaultSrc={agent.image} size={48} status={status} expression={agentExpression[agent.id] ?? null} />
                    {isDone && (
                      <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.42)" }}>
                        <span className="text-[10px]" style={{ color: agent.color }}>✓</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 이름 */}
                <p
                  className="text-[9px] font-semibold tracking-wide transition-all duration-300"
                  style={{ color: isDisabled ? "rgba(255,255,255,0.08)" : isActive ? agent.color : "rgba(148,163,184,0.7)" }}
                >
                  {agent.name}
                </p>

                {/* 부서 dot */}
                {dept && (
                  <div
                    className="w-1 h-1 rounded-full transition-all duration-300"
                    style={{ background: isActive ? dept.color : `${dept.color}30` }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {selected && <AgentChat agent={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
