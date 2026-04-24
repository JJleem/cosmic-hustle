"use client";

import Image from "next/image";
import { AgentDef, AgentStatus, DEPT_MAP } from "@/lib/agents";

type Props = {
  agent: AgentDef;
  status: AgentStatus;
  speaking: boolean;
  onClick?: () => void;
};

export default function AgentAvatar({ agent, status, speaking, onClick }: Props) {
  const isActive = status === "active";
  const isDone = status === "done";
  const isWaiting = status === "waiting";
  const dept = DEPT_MAP[agent.departmentId];

  return (
    <div
      className="flex flex-col items-center gap-1.5 cursor-pointer group"
      onClick={onClick}
    >
      <div className="relative">
        {isActive && (
          <div
            className="absolute inset-0 rounded-full animate-ping"
            style={{ background: agent.glow, transform: "scale(1.35)", opacity: 0.35 }}
          />
        )}

        <div
          className="relative rounded-full overflow-hidden transition-all duration-500 group-hover:scale-105"
          style={{
            width: 80,
            height: 80,
            boxShadow: isActive ? `0 0 28px 6px ${agent.glow}` : "none",
            outline: isActive
              ? `2px solid ${agent.color}`
              : isDone
              ? `1px solid ${agent.color}40`
              : "2px solid #1e2535",
            outlineOffset: 3,
            opacity: isWaiting ? 0.2 : 1,
            transform: isActive && speaking ? "scale(1.06)" : undefined,
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

      {/* 이름 + 직책 */}
      <div className="text-center">
        <p
          className="text-xs font-semibold tracking-wide"
          style={{ color: isActive ? agent.color : isDone ? `${agent.color}55` : "#475569" }}
        >
          {agent.name}
        </p>
        <p className="text-[9px] text-slate-400">{agent.title}</p>
      </div>

      {/* 부서 배지 */}
      {dept && (
        <div
          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium tracking-wide"
          style={{
            background: `${dept.color}15`,
            border: `1px solid ${dept.color}40`,
            color: `${dept.color}cc`,
          }}
        >
          <dept.icon size={8} />
          {dept.name}
        </div>
      )}
    </div>
  );
}
