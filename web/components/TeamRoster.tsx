"use client";

import { AGENTS, AgentStatus } from "@/lib/agents";

type Props = {
  agentStatus: Record<string, AgentStatus>;
};

const STATUS_CONFIG: Record<AgentStatus, { label: string; color: string }> = {
  idle:     { label: "대기",   color: "#FB923C" },
  active:   { label: "작업중", color: "#34D399" },
  done:     { label: "완료",   color: "#93c5fd" },
  waiting:  { label: "준비중", color: "#475569" },
  disabled: { label: "비활성", color: "#334155" },
};

export default function TeamRoster({ agentStatus }: Props) {
  return (
    <div className="h-full overflow-y-auto scrollbar-hide pb-4">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 10,
          padding: "2px 0 8px",
        }}
      >
        {AGENTS.map((agent) => {
          const status = agentStatus[agent.id] ?? "idle";
          const { label, color } = STATUS_CONFIG[status];
          const isActive  = status === "active";
          const isDisabled = status === "disabled";

          return (
            <div
              key={agent.id}
              className="group relative"
              style={{ cursor: "default" }}
            >
              {/* Card image */}
              <div
                className="relative overflow-hidden transition-all duration-300 group-hover:scale-[1.04] group-hover:-translate-y-1"
                style={{
                  borderRadius: 10,
                  opacity: isDisabled ? 0.25 : 1,
                  boxShadow: isActive
                    ? `0 0 22px 4px ${agent.glow}, 0 4px 16px rgba(0,0,0,0.5)`
                    : `0 4px 16px rgba(0,0,0,0.55)`,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/id/${agent.id}.png`}
                  alt={agent.name}
                  style={{ width: "100%", display: "block" }}
                />
                {/* Hover color wash */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                  style={{ background: `linear-gradient(to bottom, transparent 50%, ${agent.color}18 100%)` }}
                />
              </div>

              {/* Status badge */}
              <div
                className="absolute top-1.5 right-1.5 text-[8px] font-bold px-1.5 py-0.5 rounded-full pointer-events-none"
                style={{
                  background: `${color}18`,
                  border: `1px solid ${color}55`,
                  color,
                  backdropFilter: "blur(6px)",
                  WebkitBackdropFilter: "blur(6px)",
                }}
              >
                {label}
              </div>

              {/* Active ring */}
              {isActive && (
                <div
                  className="absolute inset-0 rounded-[10px] pointer-events-none animate-pulse"
                  style={{ border: `1.5px solid ${agent.color}70`, boxShadow: `0 0 12px 2px ${agent.glow}` }}
                />
              )}

              {/* Name */}
              <p
                className="text-center mt-1.5 text-[9px] font-semibold tracking-wide transition-colors duration-300"
                style={{ color: isDisabled ? "#1e293b" : isActive ? agent.color : "#64748b" }}
              >
                {agent.name}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
