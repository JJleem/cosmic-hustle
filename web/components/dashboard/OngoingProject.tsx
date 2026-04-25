"use client";

import Image from "next/image";
import { PIPELINE, AGENT_MAP, AgentStatus } from "@/lib/agents";
import { Handoff } from "@/app/page";

type Props = {
  topic: string | null;
  phase: "idle" | "working" | "done";
  agentStatus: Record<string, AgentStatus>;
  handoffs: Handoff[];
};

function timeLabel(at: Date): string {
  const diffSec = Math.floor((Date.now() - at.getTime()) / 1000);
  if (diffSec < 10) return "방금";
  if (diffSec < 60) return `${diffSec}초 전`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}분 전`;
  return at.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

export default function OngoingProject({ topic, phase, agentStatus, handoffs }: Props) {
  const isWorking = phase === "working";
  const isDone = phase === "done";
  const isActive = isWorking || isDone;

  const activeStageIdx = PIPELINE.findIndex((s) =>
    s.ids.some((id) => agentStatus[id] === "active")
  );

  // 완료된 스테이지 수 (진행률 계산용)
  const doneStageCount = PIPELINE.filter((s) =>
    s.ids.every((id) => agentStatus[id] === "done")
  ).length;
  const progressPct = isDone ? 100 : Math.round((doneStageCount / PIPELINE.length) * 100);

  return (
    <div className="flex flex-col h-full gap-3">
      {/* 헤더 */}
      <div className="shrink-0 flex items-center justify-between">
        <p className="text-[10px] text-slate-400 tracking-[0.2em] uppercase font-bold">
          진행중인 프로젝트
        </p>
        {isActive && (
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${isWorking ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} />
            <span className={`text-[9px] font-bold tracking-widest ${isWorking ? "text-emerald-400" : "text-slate-500"}`}>
              {isWorking ? "LIVE" : "DONE"}
            </span>
          </div>
        )}
      </div>

      {/* idle */}
      {phase === "idle" && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-slate-600 text-xs">진행중인 프로젝트 없음</p>
        </div>
      )}

      {isActive && topic && (
        <>
          {/* 주제 */}
          <div className="shrink-0 rounded-xl px-3 py-2.5" style={{ background: "#0d1120", border: "1px solid #1a2235" }}>
            <p className="text-sm text-slate-100 font-semibold leading-snug">{topic}</p>
          </div>

          {/* 진행률 바 */}
          <div className="shrink-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] text-slate-600 tracking-widest uppercase">Progress</span>
              <span className="text-[9px] font-bold text-slate-400">{progressPct}%</span>
            </div>
            <div className="h-1 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${progressPct}%`,
                  background: isDone
                    ? "linear-gradient(90deg, #34d399, #6ee7b7)"
                    : "linear-gradient(90deg, #3b82f6, #818cf8)",
                }}
              />
            </div>
          </div>

          {/* 파이프라인 아바타 스테이지 */}
          <div className="shrink-0 flex items-center justify-between px-1">
            {PIPELINE.map((stage, i) => {
              const isStageActive = i === activeStageIdx;
              const isStageDone =
                activeStageIdx !== -1
                  ? i < activeStageIdx
                  : stage.ids.every((id) => agentStatus[id] === "done");
              const isStagePending = !isStageActive && !isStageDone;

              const primaryAgent = AGENT_MAP[stage.ids[0]];

              return (
                <div key={i} className="flex items-center">
                  {/* 연결선 */}
                  {i > 0 && (
                    <div className="w-4 h-px mx-0.5 shrink-0 transition-all duration-700"
                      style={{
                        background: isStageDone
                          ? `${primaryAgent.color}70`
                          : isStageActive
                          ? `${primaryAgent.color}40`
                          : "#1a2030",
                      }}
                    />
                  )}

                  {/* 스테이지 노드 */}
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    {/* 아바타 */}
                    <div
                      className="relative transition-all duration-500"
                      style={{
                        width: isStageActive ? 36 : 28,
                        height: isStageActive ? 36 : 28,
                      }}
                    >
                      {/* 활성 글로우 링 */}
                      {isStageActive && (
                        <div
                          className="absolute inset-0 rounded-full animate-ping"
                          style={{ background: primaryAgent.glow, opacity: 0.4, transform: "scale(1.4)" }}
                        />
                      )}

                      {/* 아바타 원 */}
                      <div
                        className="relative w-full h-full rounded-full overflow-hidden transition-all duration-500"
                        style={{
                          outline: isStageActive
                            ? `2px solid ${primaryAgent.color}`
                            : isStageDone
                            ? `1px solid ${primaryAgent.color}50`
                            : "1px solid #1e2535",
                          outlineOffset: isStageActive ? 2 : 1,
                          opacity: isStagePending ? 0.25 : 1,
                          boxShadow: isStageActive ? `0 0 16px 2px ${primaryAgent.glow}` : "none",
                        }}
                      >
                        <Image
                          src={primaryAgent.image}
                          alt={primaryAgent.name}
                          fill
                          className="object-cover"
                          sizes="36px"
                        />
                        {/* 완료 오버레이 */}
                        {isStageDone && (
                          <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
                            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                              <path d="M1 4L3.5 6.5L9 1" stroke={primaryAgent.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </div>
                        )}
                      </div>

                      {/* 병렬 에이전트 수 뱃지 */}
                      {stage.ids.length > 1 && (
                        <div
                          className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-bold"
                          style={{ background: primaryAgent.color, color: "#0b0f1e" }}
                        >
                          {stage.ids.length}
                        </div>
                      )}
                    </div>

                    {/* 이름 + 역할 라벨 */}
                    <div className="text-center">
                      <span
                        className="text-[8px] font-semibold block leading-none transition-colors duration-300"
                        style={{
                          color: isStageActive
                            ? primaryAgent.color
                            : isStageDone
                            ? `${primaryAgent.color}55`
                            : "#2a3347",
                        }}
                      >
                        {stage.ids.length > 1
                          ? stage.ids.map((id) => AGENT_MAP[id].name).join("+")
                          : primaryAgent.name}
                      </span>
                      <span className="text-[7px] text-slate-700 block mt-0.5 leading-none">
                        {stage.label}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 현재 활성 에이전트 상태 표시 */}
          {activeStageIdx !== -1 && (
            <div
              className="shrink-0 rounded-xl px-3 py-2 flex items-center gap-2.5 animate-fadeIn"
              style={{
                background: `${AGENT_MAP[PIPELINE[activeStageIdx].ids[0]].color}08`,
                border: `1px solid ${AGENT_MAP[PIPELINE[activeStageIdx].ids[0]].color}20`,
              }}
            >
              <div
                className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse"
                style={{ background: AGENT_MAP[PIPELINE[activeStageIdx].ids[0]].color }}
              />
              <div>
                <span
                  className="text-[10px] font-bold"
                  style={{ color: AGENT_MAP[PIPELINE[activeStageIdx].ids[0]].color }}
                >
                  {PIPELINE[activeStageIdx].ids.map((id) => AGENT_MAP[id].name).join(", ")}
                </span>
                <span className="text-[10px] text-slate-500 ml-1.5">
                  {PIPELINE[activeStageIdx].label} 진행중
                </span>
              </div>
            </div>
          )}

          {isDone && (
            <div
              className="shrink-0 rounded-xl px-3 py-2 flex items-center gap-2.5"
              style={{ background: "#052010", border: "1px solid #1a4a2a" }}
            >
              <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                <path d="M1 5L4.5 8.5L11 1" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-[10px] text-emerald-400 font-bold">리서치 완료</span>
            </div>
          )}

          {/* 핸드오프 로그 */}
          <div className="flex-1 overflow-hidden flex flex-col gap-1.5 min-h-0">
            <p className="text-[9px] text-slate-600 tracking-[0.15em] uppercase font-bold shrink-0">
              핸드오프 로그
            </p>

            {handoffs.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-[11px] text-slate-700">대기 중...</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5 scrollbar-hide">
                {handoffs.map((h) => {
                  const from = AGENT_MAP[h.fromId];
                  const to = AGENT_MAP[h.toId];
                  if (!from || !to) return null;

                  return (
                    <div
                      key={h.id}
                      className="rounded-xl px-3 py-2 flex flex-col gap-1"
                      style={{ background: "#0a0f1c", border: `1px solid ${from.color}18` }}
                    >
                      <div className="flex items-center gap-1.5">
                        {/* from 아바타 */}
                        <div className="w-4 h-4 rounded-full overflow-hidden shrink-0" style={{ outline: `1px solid ${from.color}40` }}>
                          <Image src={from.image} alt={from.name} width={16} height={16} className="object-cover" />
                        </div>
                        <span className="text-[10px] font-bold" style={{ color: from.color }}>{from.name}</span>
                        <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
                          <path d="M0 4H10M10 4L7 1M10 4L7 7" stroke={`${from.color}50`} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {/* to 아바타 */}
                        <div className="w-4 h-4 rounded-full overflow-hidden shrink-0" style={{ outline: `1px solid ${to.color}40` }}>
                          <Image src={to.image} alt={to.name} width={16} height={16} className="object-cover" />
                        </div>
                        <span className="text-[10px] font-bold" style={{ color: to.color }}>{to.name}</span>
                        <span className="ml-auto text-[9px] text-slate-700 shrink-0">{timeLabel(h.at)}</span>
                      </div>
                      {h.message && (
                        <p className="text-[10px] text-slate-500 leading-snug line-clamp-2">{h.message}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
