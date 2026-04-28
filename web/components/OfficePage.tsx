"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AGENTS, AGENT_MAP, PIPELINE, DEPARTMENTS, AgentStatus, AgentDef } from "@/lib/agents";
import AgentImage from "./AgentImage";
import HologramPartition from "./HologramPartition";
import DeptRoom from "./DeptRoom";
import { Idea } from "./AgentWorkspace";

type Props = {
  agentStatus: Record<string, AgentStatus>;
  agentExpression: Record<string, string | null>;
  speaking: Record<string, boolean>;
  lastMessage: Record<string, string>;
  pingIdeas: Idea[];
  lastTopic: string;
};

export default function OfficePage({
  agentStatus, agentExpression, speaking, lastMessage, pingIdeas, lastTopic,
}: Props) {
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [hoveredDeptId, setHoveredDeptId]   = useState<string | null>(null);
  const isTransitioning = selectedDeptId !== null;

  const activeStageIdx = PIPELINE.findIndex((s) =>
    s.ids.some((id) => agentStatus[id] === "active")
  );

  return (
    <div className="h-full flex flex-col px-8 py-5 gap-3">

      {/* 파이프라인 플로우 */}
      <div className="shrink-0 flex items-center gap-1 overflow-x-auto pb-0.5">
        <span className="text-[9px] text-slate-600 tracking-[0.2em] uppercase mr-3 font-bold whitespace-nowrap shrink-0">
          Pipeline
        </span>
        {PIPELINE.map((stage, i) => {
          const isActive = i === activeStageIdx;
          const isDone   = activeStageIdx !== -1 && i < activeStageIdx;
          const agent    = AGENT_MAP[stage.ids[0]];
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
                    ? { background: `${agent.color}18`, border: `1px solid ${agent.color}55`, color: agent.color, boxShadow: `0 0 10px ${agent.glow}` }
                    : isDone
                    ? { background: `${agent.color}08`, border: `1px solid ${agent.color}20`, color: `${agent.color}60` }
                    : { background: "transparent", border: "1px solid #1a2030", color: "#2a3347" }
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

      {/* 복도 + 방 영역 */}
      <div className="relative flex-1 overflow-hidden rounded-2xl">

        {/* ── 복도 뷰 ── */}
        <div className="flex h-full">
          {DEPARTMENTS.map((dept, di) => {
            const members        = AGENTS.filter((a) => a.departmentId === dept.id);
            const deptHasActive  = members.some((a) => agentStatus[a.id] === "active");
            const isHovered      = hoveredDeptId === dept.id;
            const otherHovered   = hoveredDeptId !== null && !isHovered;
            const isDissolving   = isTransitioning;

            return (
              <div key={dept.id} className="flex flex-1 overflow-hidden">
                {/* 파티션 (첫 번째 섹션 제외) */}
                {di > 0 && (
                  <HologramPartition
                    color={dept.color}
                    dissolving={isDissolving}
                  />
                )}

                {/* 부서 섹션 */}
                <motion.div
                  layoutId={`dept-panel-${dept.id}`}
                  className="relative flex-1 overflow-hidden cursor-pointer"
                  style={{ borderRadius: di === 0 ? "16px 0 0 16px" : di === DEPARTMENTS.length - 1 ? "0 16px 16px 0" : 0 }}
                  animate={{
                    opacity: isTransitioning ? 0 : otherHovered ? 0.55 : 1,
                    scale:   isTransitioning ? 0.97 : 1,
                  }}
                  transition={{ duration: 0.35, ease: "easeInOut" }}
                  onHoverStart={() => !isTransitioning && setHoveredDeptId(dept.id)}
                  onHoverEnd={() => setHoveredDeptId(null)}
                  onClick={() => !isTransitioning && setSelectedDeptId(dept.id)}
                >
                  {/* 배경 단체사진 */}
                  <motion.div
                    className="absolute inset-0"
                    animate={{
                      filter: isHovered
                        ? "brightness(0.45) saturate(1)"
                        : "brightness(0.25) saturate(0.75)",
                    }}
                    transition={{ duration: 0.3 }}
                  >
                    <img
                      src={`/departments/${dept.id}.png`}
                      alt={dept.label}
                      className="w-full h-full object-cover object-center"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                    {/* 사진 없을 때 fallback */}
                    <div
                      className="absolute inset-0"
                      style={{ background: `radial-gradient(ellipse at center, ${dept.color}12 0%, #0b0f1e 100%)` }}
                    />
                  </motion.div>

                  {/* 호버 glow 오버레이 */}
                  <motion.div
                    className="absolute inset-0 pointer-events-none"
                    animate={{ opacity: isHovered ? 1 : 0 }}
                    transition={{ duration: 0.3 }}
                    style={{
                      background: `linear-gradient(to top, ${dept.color}15 0%, transparent 60%)`,
                      boxShadow: `inset 0 0 40px ${dept.color}10`,
                    }}
                  />

                  {/* 부서 헤더 */}
                  <div className="absolute top-4 left-0 right-0 flex flex-col items-center gap-1 z-10">
                    <motion.div
                      animate={{ opacity: isHovered ? 1 : 0.5 }}
                      transition={{ duration: 0.25 }}
                      className="flex items-center gap-1.5"
                    >
                      <dept.icon size={10} style={{ color: dept.color }} />
                      <span
                        className="text-[10px] font-bold tracking-[0.2em] uppercase"
                        style={{ color: dept.color }}
                      >
                        {dept.name}
                      </span>
                    </motion.div>
                    <span className="text-[9px] text-slate-600">{dept.label}</span>
                    {deptHasActive && (
                      <div
                        className="w-1.5 h-1.5 rounded-full animate-pulse mt-0.5"
                        style={{ background: dept.color }}
                      />
                    )}
                  </div>

                  {/* 에이전트 미니 아바타 */}
                  <div className="absolute bottom-0 inset-x-0 flex items-end justify-center gap-3 flex-wrap px-3 pb-4">
                    {members.map((agent, i) => {
                      const status   = agentStatus[agent.id] ?? "idle";
                      const isActive = status === "active";
                      return (
                        <motion.div
                          key={agent.id}
                          className="flex flex-col items-center gap-1"
                          animate={{ y: isHovered ? -4 : 0, opacity: isHovered ? 1 : 0.7 }}
                          transition={{ duration: 0.25, delay: i * 0.04 }}
                        >
                          <div
                            className="rounded-full overflow-hidden"
                            style={{
                              width: 44,
                              height: 44,
                              outline: isActive
                                ? `2px solid ${agent.color}`
                                : `1.5px solid ${agent.color}30`,
                              outlineOffset: 2,
                              boxShadow: isActive
                                ? `0 0 14px ${agent.glow}`
                                : `0 4px 12px rgba(0,0,0,0.6)`,
                            }}
                          >
                            <AgentImage
                              defaultSrc={agent.image}
                              size={44}
                              status={status}
                              expression={agentExpression[agent.id] ?? null}
                            />
                          </div>
                          <span
                            className="text-[8px] font-medium px-1.5 py-0.5 rounded-md backdrop-blur-sm"
                            style={{
                              color: isActive ? agent.color : "#cbd5e1",
                              background: "#0b0f1e99",
                            }}
                          >
                            {agent.name}
                          </span>
                        </motion.div>
                      );
                    })}
                  </div>

                  {/* 진입 힌트 */}
                  <motion.div
                    className="absolute inset-0 flex items-center justify-center pointer-events-none"
                    animate={{ opacity: isHovered ? 1 : 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div
                      className="text-[9px] tracking-[0.3em] uppercase font-bold px-3 py-1.5 rounded-full backdrop-blur-sm"
                      style={{
                        color: dept.color,
                        border: `1px solid ${dept.color}50`,
                        background: "#0b0f1e70",
                      }}
                    >
                      입장
                    </div>
                  </motion.div>
                </motion.div>
              </div>
            );
          })}
        </div>

        {/* ── 방 뷰 (선택된 부서) ── */}
        <AnimatePresence>
          {selectedDeptId && (() => {
            const dept = DEPARTMENTS.find((d) => d.id === selectedDeptId);
            if (!dept) return null;
            return (
              <DeptRoom
                key={selectedDeptId}
                dept={dept}
                agentStatus={agentStatus}
                agentExpression={agentExpression}
                speaking={speaking}
                lastMessage={lastMessage}
                onBack={() => setSelectedDeptId(null)}
              />
            );
          })()}
        </AnimatePresence>
      </div>
    </div>
  );
}
