"use client";

import Image from "next/image";
import { AgentDef, AgentStatus } from "@/lib/agents";

type Props = {
  agent: AgentDef;
  status: AgentStatus;
  speaking: boolean;
};

export default function AgentAvatar({ agent, status, speaking }: Props) {
  const isActive = status === "active";
  const isDone = status === "done";
  const isWaiting = status === "waiting";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        {/* 글로우 링 */}
        {isActive && (
          <div
            className="absolute inset-0 rounded-full animate-ping"
            style={{ background: agent.glow, transform: "scale(1.3)", opacity: 0.4 }}
          />
        )}

        {/* 아바타 */}
        <div
          className="relative rounded-full overflow-hidden transition-all duration-500"
          style={{
            width: 80,
            height: 80,
            boxShadow: isActive ? `0 0 24px 6px ${agent.glow}` : "none",
            outline: isActive
              ? `2px solid ${agent.color}`
              : isDone
              ? `1px solid ${agent.color}50`
              : "2px solid #1e2535",
            outlineOffset: 3,
            opacity: isWaiting ? 0.25 : 1,
            transform: isActive && speaking ? "scale(1.05)" : "scale(1)",
          }}
        >
          <Image
            src={agent.image}
            alt={agent.name}
            fill
            className="object-cover"
            sizes="80px"
          />

          {isDone && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <span className="text-base">✓</span>
            </div>
          )}
        </div>
      </div>

      <div className="text-center">
        <p
          className="text-xs font-semibold tracking-wide"
          style={{ color: isActive ? agent.color : isDone ? `${agent.color}60` : "#475569" }}
        >
          {agent.name}
        </p>
        <p className="text-[9px] text-slate-600">{agent.title}</p>
      </div>
    </div>
  );
}
