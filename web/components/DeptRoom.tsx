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

const MONITOR_BARS: Record<string, number[]> = {
  wiki:  [6, 12, 8, 10, 6],
  pocke: [10, 6, 14, 8, 12],
  ka:    [14, 8, 12, 6, 10],
  over:  [8, 14, 6, 12, 8],
  fact:  [6, 6, 14, 6, 6],
  ping:  [12, 14, 10, 14, 8],
};

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
        initial={{ filter: "brightness(0.15) saturate(0.6)" }}
        animate={{ filter: "brightness(0.32) saturate(0.85)" }}
        transition={{ duration: 0.7, ease: "easeOut" }}
      >
        <img
          src={`/departments/${dept.id}.png`}
          alt={dept.label}
          className="w-full h-full object-cover object-center"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      </motion.div>

      {/* 색상 그라디언트 오버레이 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `linear-gradient(to top, ${dept.color}18 0%, transparent 55%, #0b0f1e90 100%)`,
        }}
      />

      {/* 뒤로가기 */}
      <motion.button
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.42, duration: 0.3 }}
        onClick={onBack}
        className="absolute top-4 left-4 z-30 flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-full backdrop-blur-md transition-all hover:opacity-80"
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
        <span
          className="text-[10px] font-bold tracking-[0.22em] uppercase"
          style={{ color: dept.color }}
        >
          {dept.name}
        </span>
        <span className="text-[9px] text-slate-500">{dept.label}</span>
      </motion.div>

      {/* 에이전트 그리드 */}
      <div className="absolute bottom-0 inset-x-0 flex items-end justify-center gap-5 flex-wrap px-10 pb-6">
        {members.map((agent, i) => {
          const status = agentStatus[agent.id] ?? "idle";
          const isActive = status === "active";
          const isDone   = status === "done";
          const isWaiting  = status === "waiting";
          const isDisabled = status === "disabled";
          const isSpeaking = speaking[agent.id];
          const msg  = lastMessage[agent.id];
          const bars = MONITOR_BARS[agent.id] ?? [8, 12, 8, 10, 8];

          return (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, y: 36 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.38 + i * 0.07, duration: 0.38, ease: "easeOut" }}
              className="relative flex flex-col items-center gap-1.5 cursor-pointer group"
              onClick={() => setSelected(agent)}
            >
              {/* 말풍선 */}
              {msg && (isActive || isSpeaking) && (
                <div
                  className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 z-10"
                  style={{ minWidth: 130, maxWidth: 190 }}
                >
                  <div
                    className="relative rounded-2xl rounded-b-sm px-3 py-2 text-[11px] text-slate-200 leading-snug"
                    style={{
                      background: "#0f1521ee",
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

              {/* 모니터 */}
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
                      transition: `height 0.4s ease ${bi * 80}ms`,
                    }}
                  />
                ))}
              </div>

              {/* 아바타 */}
              <div className="relative">
                {isActive && (
                  <div
                    className="absolute inset-0 rounded-full animate-ping"
                    style={{ background: agent.glow, transform: "scale(1.4)", opacity: 0.25 }}
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
                      ? `1px solid ${agent.color}35`
                      : `1.5px solid ${agent.color}25`,
                    outlineOffset: 3,
                    boxShadow: isActive
                      ? `0 0 20px 4px ${agent.glow}`
                      : `0 4px 16px rgba(0,0,0,0.6)`,
                    opacity: isDisabled ? 0.2 : isWaiting ? 0.15 : 1,
                    filter: isDisabled ? "grayscale(1)" : "none",
                  }}
                >
                  <AgentImage
                    defaultSrc={agent.image}
                    size={64}
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
              <div
                className="text-center px-2 py-1 rounded-lg backdrop-blur-sm"
                style={{ background: "#0b0f1e80" }}
              >
                <p
                  className="text-xs font-semibold transition-colors duration-300"
                  style={{
                    color: isDisabled
                      ? "#1e2535"
                      : isActive
                      ? agent.color
                      : isDone
                      ? `${agent.color}50`
                      : "#94a3b8",
                  }}
                >
                  {agent.name}
                </p>
                <p className="text-[9px] text-slate-600 mt-0.5">
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
