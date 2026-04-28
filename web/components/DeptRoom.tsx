"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Department, AgentDef, AgentStatus, AGENTS } from "@/lib/agents";
import AgentImage from "./AgentImage";
import AgentWorkspace, { Idea } from "./AgentWorkspace";

type Props = {
  dept: Department;
  agentStatus: Record<string, AgentStatus>;
  agentExpression: Record<string, string | null>;
  speaking: Record<string, boolean>;
  lastMessage: Record<string, string>;
  pingIdeas: Idea[];
  lastTopic: string;
  onBack: () => void;
};

const STATUS_CONFIG: Record<AgentStatus, { color: string; label: string; pulse: boolean }> = {
  idle:     { color: "#FB923C", label: "idle",    pulse: false },
  active:   { color: "#34D399", label: "working", pulse: true  },
  done:     { color: "#93c5fd", label: "done",    pulse: false },
  waiting:  { color: "#475569", label: "standby", pulse: false },
  disabled: { color: "#1e2535", label: "off",     pulse: false },
};

function StatusBadge({ status }: { status: AgentStatus }) {
  const { color, label, pulse } = STATUS_CONFIG[status] ?? STATUS_CONFIG.idle;
  return (
    <div className="flex items-center gap-1">
      <div
        className={pulse ? "animate-pulse" : ""}
        style={{
          width: 6, height: 6, borderRadius: "50%",
          background: color,
          boxShadow: `0 0 5px ${color}`,
        }}
      />
      <span className="text-[8px] tracking-widest uppercase font-semibold" style={{ color }}>
        {label}
      </span>
    </div>
  );
}

export default function DeptRoom({
  dept, agentStatus, agentExpression, speaking,
  lastMessage, pingIdeas, lastTopic, onBack,
}: Props) {
  const [selected, setSelected] = useState<AgentDef | null>(null);
  const members = AGENTS.filter((a) => a.departmentId === dept.id);

  return (
    <motion.div
      layoutId={`dept-panel-${dept.id}`}
      className="absolute inset-0 z-20 overflow-hidden"
      style={{ borderRadius: 16 }}
    >
      {/* 배경 단체사진 */}
      <motion.div
        className="absolute inset-0"
        initial={{ filter: "brightness(0.25) saturate(0.7)" }}
        animate={{ filter: "brightness(0.55) saturate(1)" }}
        transition={{ duration: 0.7, ease: "easeOut" }}
      >
        <img
          src={`/departments/${dept.id}.png`}
          alt={dept.label}
          className="w-full h-full object-cover object-center"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      </motion.div>

      {/* 상단 그라디언트 */}
      <div
        className="absolute inset-x-0 top-0 h-28 pointer-events-none"
        style={{ background: "linear-gradient(to bottom, #0b0f1ecc 0%, transparent 100%)" }}
      />

      {/* 하단 그라디언트 — 에이전트 가독성 */}
      <div
        className="absolute inset-x-0 bottom-0 h-56 pointer-events-none"
        style={{
          background: `linear-gradient(to top, #0b0f1ef0 0%, #0b0f1e99 50%, transparent 100%)`,
        }}
      />

      {/* 부서 색 틴트 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `linear-gradient(to top, ${dept.color}12 0%, transparent 50%)` }}
      />

      {/* 뒤로가기 */}
      <motion.button
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.42, duration: 0.3 }}
        onClick={onBack}
        className="absolute top-4 left-4 z-30 flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-full backdrop-blur-md transition-all hover:opacity-80 active:scale-95"
        style={{
          background: "#0b0f1e90",
          border: `1px solid ${dept.color}40`,
          color: dept.color,
        }}
      >
        ← 복귀
      </motion.button>

      {/* 부서 타이틀 */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.35 }}
        className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2"
      >
        <dept.icon size={11} style={{ color: `${dept.color}90` }} />
        <span className="text-[10px] font-bold tracking-[0.22em] uppercase" style={{ color: dept.color }}>
          {dept.name}
        </span>
        <span className="text-[9px] text-slate-400">{dept.label}</span>
      </motion.div>

      {/* 에이전트 그리드 */}
      <div className="absolute bottom-0 inset-x-0 flex items-end justify-center gap-6 flex-wrap px-10 pb-7 z-10">
        {members.map((agent, i) => {
          const status    = agentStatus[agent.id] ?? "idle";
          const isActive  = status === "active";
          const isDone    = status === "done";
          const isWaiting  = status === "waiting";
          const isDisabled = status === "disabled";
          const isSpeaking = speaking[agent.id];
          const msg = lastMessage[agent.id];

          return (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, y: 36 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.38 + i * 0.07, duration: 0.38, ease: "easeOut" }}
              className="relative flex flex-col items-center gap-2 cursor-pointer group"
              onClick={() => setSelected(agent)}
            >
              {/* 말풍선 */}
              {msg && (isActive || isSpeaking) && (
                <div
                  className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 z-10"
                  style={{ minWidth: 130, maxWidth: 200 }}
                >
                  <div
                    className="relative rounded-2xl rounded-b-sm px-3 py-2 text-[11px] text-slate-200 leading-snug"
                    style={{
                      background: "#0f1521f0",
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

              {/* 아바타 */}
              <div className="relative">
                {isActive && (
                  <div
                    className="absolute inset-0 rounded-full animate-ping"
                    style={{ background: agent.glow, transform: "scale(1.4)", opacity: 0.3 }}
                  />
                )}
                {/* 호버 링 */}
                <div
                  className="absolute inset-0 rounded-full scale-0 group-hover:scale-110 transition-transform duration-300"
                  style={{ border: `1.5px solid ${agent.color}60`, borderRadius: "50%" }}
                />
                <div
                  className="relative rounded-full overflow-hidden transition-all duration-300"
                  style={{
                    width: 70,
                    height: 70,
                    outline: isActive
                      ? `2px solid ${agent.color}`
                      : isDone
                      ? `1px solid ${agent.color}50`
                      : `1.5px solid ${agent.color}30`,
                    outlineOffset: 3,
                    boxShadow: isActive
                      ? `0 0 22px 5px ${agent.glow}`
                      : `0 6px 20px rgba(0,0,0,0.7)`,
                    opacity: isDisabled ? 0.2 : isWaiting ? 0.2 : 1,
                    filter: isDisabled ? "grayscale(1)" : "none",
                  }}
                >
                  <AgentImage
                    defaultSrc={agent.image}
                    size={70}
                    status={status}
                    expression={agentExpression[agent.id] ?? null}
                  />
                  {isDone && (
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                      <span className="text-base">✓</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 이름표 */}
              <div
                className="text-center px-3 py-1.5 rounded-xl backdrop-blur-md flex flex-col items-center gap-0.5"
                style={{ background: "#0b0f1ecc", border: `1px solid ${agent.color}18` }}
              >
                <StatusBadge status={status} />
                <p
                  className="text-xs font-bold mt-0.5"
                  style={{
                    color: isDisabled ? "#334155"
                         : isActive   ? agent.color
                         : isDone     ? `${agent.color}80`
                         : "#e2e8f0",
                  }}
                >
                  {agent.name}
                </p>
                <p className="text-[9px] text-slate-400">
                  {agent.title} · {agent.role}
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>

      {selected && (
        <AgentWorkspace
          agent={selected}
          pingIdeas={pingIdeas}
          lastTopic={lastTopic}
          onClose={() => setSelected(null)}
        />
      )}
    </motion.div>
  );
}
