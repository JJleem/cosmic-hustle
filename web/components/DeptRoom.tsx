"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Department, AgentDef, AgentStatus, AGENTS } from "@/lib/agents";
import AgentImage from "./AgentImage";
import AgentChatPanel from "./AgentChatPanel";

type Props = {
  dept: Department;
  agentStatus: Record<string, AgentStatus>;
  agentExpression: Record<string, string | null>;
  speaking: Record<string, boolean>;
  lastMessage: Record<string, string>;
  onBack: () => void;
};

const RANK_ORDER = ["부장", "차장", "과장", "대리", "사원", "인턴"];

const STATUS_CONFIG: Record<AgentStatus, { color: string; label: string; pulse: boolean }> = {
  idle:     { color: "#FB923C", label: "대기중", pulse: false },
  active:   { color: "#34D399", label: "작업중", pulse: true  },
  done:     { color: "#93c5fd", label: "완료",   pulse: false },
  waiting:  { color: "#475569", label: "준비중", pulse: false },
  disabled: { color: "#1e2535", label: "비활성", pulse: false },
};

function StatusBadge({ status }: { status: AgentStatus }) {
  const { color, label, pulse } = STATUS_CONFIG[status] ?? STATUS_CONFIG.idle;
  return (
    <div className="flex items-center gap-1">
      <div
        className={pulse ? "animate-pulse" : ""}
        style={{ width: 6, height: 6, borderRadius: "50%", background: color, boxShadow: `0 0 5px ${color}` }}
      />
      <span className="text-[8px] tracking-widest uppercase font-semibold" style={{ color }}>
        {label}
      </span>
    </div>
  );
}

function SpeechBubble({ msg, color, glow }: { msg: string; color: string; glow: string }) {
  return (
    <div
      className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-20 pointer-events-none"
      style={{ minWidth: 110, maxWidth: 170 }}
    >
      <div
        className="relative rounded-2xl rounded-b-sm px-3 py-2 text-[10px] text-slate-200 leading-snug"
        style={{ background: "#0f1521f0", border: `1px solid ${color}40`, boxShadow: `0 4px 20px ${glow}` }}
      >
        {msg}
        <div
          className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-45"
          style={{ background: "#0f1521", borderRight: `1px solid ${color}40`, borderBottom: `1px solid ${color}40` }}
        />
      </div>
    </div>
  );
}

function AgentCard({
  agent, status, expression, isSpeaking, msg, size, delay, onClick, color: deptColor,
}: {
  agent: AgentDef;
  status: AgentStatus;
  expression: string | null;
  isSpeaking: boolean;
  msg: string;
  size: number;
  delay: number;
  onClick: () => void;
  color: string;
}) {
  const isActive   = status === "active";
  const isDone     = status === "done";
  const isWaiting  = status === "waiting";
  const isDisabled = status === "disabled";
  void deptColor;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: "easeOut" }}
      className="relative flex flex-col items-center gap-2 cursor-pointer group"
      onClick={onClick}
    >
      {/* Speech bubble */}
      {msg && (isActive || isSpeaking) && (
        <SpeechBubble msg={msg} color={agent.color} glow={agent.glow} />
      )}

      {/* Avatar */}
      <div className="relative">
        {isActive && (
          <div
            className="absolute inset-0 rounded-full animate-ping"
            style={{ background: agent.glow, transform: "scale(1.45)", opacity: 0.3 }}
          />
        )}
        <div
          className="absolute inset-0 rounded-full scale-0 group-hover:scale-110 transition-transform duration-300"
          style={{ border: `2px solid ${agent.color}50`, borderRadius: "50%" }}
        />
        <div
          className="relative rounded-full overflow-hidden transition-all duration-300"
          style={{
            width: size,
            height: size,
            outline: isActive ? `2px solid ${agent.color}` : isDone ? `1px solid ${agent.color}50` : `1.5px solid ${agent.color}35`,
            outlineOffset: 3,
            boxShadow: isActive ? `0 0 28px 8px ${agent.glow}` : `0 6px 24px rgba(0,0,0,0.8)`,
            opacity: isDisabled ? 0.2 : isWaiting ? 0.35 : 1,
            filter: isDisabled ? "grayscale(1)" : "none",
          }}
        >
          <AgentImage defaultSrc={agent.image} size={size} status={status} expression={expression} />
          {isDone && (
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
              <span style={{ fontSize: size > 90 ? 22 : 16 }}>✓</span>
            </div>
          )}
        </div>
      </div>

      {/* Name plate */}
      <div
        className="text-center px-3 py-1.5 rounded-xl backdrop-blur-md flex flex-col items-center gap-0.5"
        style={{ background: "#0b0f1ecc", border: `1px solid ${agent.color}20` }}
      >
        <StatusBadge status={status} />
        <p
          className="font-bold mt-0.5"
          style={{
            fontSize: size > 90 ? 13 : 11,
            color: isDisabled ? "#334155" : isActive ? agent.color : isDone ? `${agent.color}80` : "#f1f5f9",
          }}
        >
          {agent.name}
        </p>
        <p className="text-[9px] text-slate-500">{agent.title} · {agent.role}</p>
      </div>
    </motion.div>
  );
}

export default function DeptRoom({
  dept, agentStatus, agentExpression, speaking, lastMessage, onBack,
}: Props) {
  const [selected, setSelected] = useState<AgentDef | null>(null);

  const members = AGENTS.filter((a) => a.departmentId === dept.id);
  const sorted  = [...members].sort((a, b) => RANK_ORDER.indexOf(a.title) - RANK_ORDER.indexOf(b.title));
  const leader  = sorted[0];
  const team    = sorted.slice(1);
  const N       = team.length;

  // Width for org tree (member row + connector)
  const treeWidth = Math.min(N * 148, 580);

  return (
    <motion.div
      layoutId={`dept-panel-${dept.id}`}
      className="absolute inset-0 z-20 overflow-hidden"
      style={{ borderRadius: 16 }}
    >
      {/* Background image */}
      <motion.div
        className="absolute inset-0"
        initial={{ filter: "brightness(0.2) saturate(0.6)" }}
        animate={{ filter: "brightness(0.4) saturate(1)" }}
        transition={{ duration: 0.7, ease: "easeOut" }}
      >
        <img
          src={`/departments/${dept.id}.png`}
          alt={dept.label}
          className="w-full h-full object-cover object-center"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      </motion.div>

      {/* Top gradient */}
      <div
        className="absolute inset-x-0 top-0 pointer-events-none"
        style={{ height: "55%", background: "linear-gradient(to bottom, #0b0f1ef8 0%, #0b0f1e90 55%, transparent 100%)" }}
      />
      {/* Bottom gradient */}
      <div
        className="absolute inset-x-0 bottom-0 pointer-events-none"
        style={{ height: "55%", background: "linear-gradient(to top, #0b0f1ef8 0%, #0b0f1e90 55%, transparent 100%)" }}
      />
      {/* Color tint */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at 50% 70%, ${dept.color}0a 0%, transparent 65%)` }}
      />

      {/* Back button */}
      <motion.button
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.4, duration: 0.3 }}
        onClick={onBack}
        className="absolute top-4 left-4 z-30 flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-full backdrop-blur-md transition-all hover:opacity-80 active:scale-95"
        style={{ background: "#0b0f1e90", border: `1px solid ${dept.color}40`, color: dept.color }}
      >
        ← 복귀
      </motion.button>

      {/* Main layout */}
      <div className="absolute inset-0 flex flex-col z-10" style={{ padding: "52px 28px 20px" }}>

        {/* ── 부서 소개 헤더 ── */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.35 }}
          className="text-center shrink-0 mb-3"
        >
          <div className="flex items-center justify-center gap-2 mb-1.5">
            <dept.icon size={12} style={{ color: dept.color }} />
            <span className="text-[11px] font-bold tracking-[0.25em] uppercase" style={{ color: dept.color }}>
              {dept.name}
            </span>
            <span className="text-[10px] text-slate-500">· {dept.label}</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed mx-auto mb-3" style={{ maxWidth: 460 }}>
            {dept.description}
          </p>
          <div className="flex justify-center gap-2 flex-wrap">
            {dept.mission.map((m) => (
              <span
                key={m}
                className="text-[9px] px-2.5 py-1 rounded-full font-semibold tracking-wide"
                style={{
                  background: `${dept.color}12`,
                  border: `1px solid ${dept.color}35`,
                  color: `${dept.color}cc`,
                }}
              >
                {m}
              </span>
            ))}
          </div>
        </motion.div>

        {/* 구분선 */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="shrink-0 mb-3"
          style={{ height: 1, background: `linear-gradient(to right, transparent, ${dept.color}30, transparent)` }}
        />

        {/* ── 조직도 ── */}
        <div className="flex-1 flex flex-col items-center justify-center">

          {/* 리더 */}
          {leader && (
            <AgentCard
              agent={leader}
              status={agentStatus[leader.id] ?? "idle"}
              expression={agentExpression[leader.id] ?? null}
              isSpeaking={speaking[leader.id] ?? false}
              msg={lastMessage[leader.id] ?? ""}
              size={110}
              delay={0.42}
              onClick={() => setSelected(leader)}
              color={dept.color}
            />
          )}

          {/* 연결선 (리더 → 팀) */}
          {leader && N > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.55, duration: 0.4 }}
              className="flex flex-col items-center shrink-0"
              style={{ width: treeWidth }}
            >
              {/* 세로 기둥 */}
              <div style={{ width: 1, height: 18, background: `${dept.color}35` }} />

              {/* 가로 바 + 세로 가지 */}
              <div className="relative w-full" style={{ height: 22 }}>
                {/* 가로 바: 첫 멤버 중심 ~ 마지막 멤버 중심 */}
                <div
                  className="absolute top-0 h-px"
                  style={{
                    left:       `${50 / N}%`,
                    right:      `${50 / N}%`,
                    background: `${dept.color}35`,
                  }}
                />
                {/* 세로 가지: 각 멤버 중심 */}
                {team.map((_, i) => (
                  <div
                    key={i}
                    className="absolute top-0 bottom-0 w-px"
                    style={{
                      left:       `${(2 * i + 1) / (2 * N) * 100}%`,
                      background: `${dept.color}35`,
                    }}
                  />
                ))}
              </div>
            </motion.div>
          )}

          {/* 팀원 */}
          {N > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${N}, 1fr)`,
                width: treeWidth,
                gap: 0,
              }}
            >
              {team.map((agent, i) => (
                <div key={agent.id} className="flex flex-col items-center" style={{ padding: "0 8px" }}>
                  <AgentCard
                    agent={agent}
                    status={agentStatus[agent.id] ?? "idle"}
                    expression={agentExpression[agent.id] ?? null}
                    isSpeaking={speaking[agent.id] ?? false}
                    msg={lastMessage[agent.id] ?? ""}
                    size={82}
                    delay={0.5 + i * 0.07}
                    onClick={() => setSelected(agent)}
                    color={dept.color}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {selected && (
          <AgentChatPanel
            key={selected.id}
            agent={selected}
            agentStatus={agentStatus[selected.id] ?? "idle"}
            agentExpression={agentExpression[selected.id] ?? null}
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
