"use client";

import { useEffect, useRef, useState } from "react";
import { AGENTS, AGENT_MAP, PIPELINE, AgentStatus } from "@/lib/agents";
import AgentImage from "./AgentImage";

type ChatEntry = { id: string; agentId: string; text: string; at: Date };

type DraftVersion = { version: number; content: string; prevFeedback: string };

type Props = {
  topic: string;
  agentStatus: Record<string, AgentStatus>;
  agentExpression: Record<string, string | null>;
  speaking: Record<string, boolean>;
  lastMessage: Record<string, string>;
  streamLog: Record<string, string>;
  chatFeed: ChatEntry[];
  liveDraft: { agentId: string; topic: string; content: string } | null;
  agentDurations: Record<string, number>;
  thinkingHint: Record<string, string>;
  draftVersions: DraftVersion[];
  agentStartTs: Record<string, number>;
  sessionStartTs: number;
  onStop: () => void;
};

function lineDiff(oldText: string, newText: string): Array<{ text: string; type: "same" | "added" }> {
  const oldSet = new Set(oldText.split("\n"));
  return newText.split("\n").map((line) => ({
    text: line,
    type: oldSet.has(line) ? "same" : "added",
  }));
}

function fmtMs(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

export default function ProjectWorkView({
  topic,
  agentStatus,
  agentExpression,
  speaking,
  lastMessage,
  streamLog,
  chatFeed,
  liveDraft,
  agentDurations,
  thinkingHint,
  draftVersions,
  agentStartTs,
  sessionStartTs,
  onStop,
}: Props) {
  const logRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const [confirmStop, setConfirmStop] = useState(false);
  const [pinnedAgentId, setPinnedAgentId] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [showGantt, setShowGantt] = useState(false);
  const [liveElapsed, setLiveElapsed] = useState(0);
  const activeStartRef = useRef<number>(Date.now());

  // 가장 최근 스트림이 들어온 에이전트를 추적 — 병렬 실행 시 위키+포케 둘 다 표시 가능
  const prevStreamLens = useRef<Record<string, number>>({});
  const [lastStreamedId, setLastStreamedId] = useState<string | null>(null);
  useEffect(() => {
    for (const agentId of Object.keys(streamLog)) {
      const cur = streamLog[agentId]?.length ?? 0;
      const prev = prevStreamLens.current[agentId] ?? 0;
      if (cur > prev && agentStatus[agentId] === "active") {
        setLastStreamedId(agentId);
      }
    }
    prevStreamLens.current = Object.fromEntries(
      Object.keys(streamLog).map((id) => [id, streamLog[id]?.length ?? 0])
    );
  }, [streamLog, agentStatus]);

  // 핀된 에이전트 > 가장 최근 스트림 에이전트 > 첫번째 활성 > 마지막 완료 순서
  const autoAgent =
    (lastStreamedId && agentStatus[lastStreamedId] === "active" ? AGENT_MAP[lastStreamedId] : null) ??
    AGENTS.find((a) => agentStatus[a.id] === "active") ??
    [...AGENTS].reverse().find((a) => agentStatus[a.id] === "done") ??
    AGENTS.find((a) => agentStatus[a.id] !== "disabled") ??
    AGENTS[0];
  const displayAgent = (pinnedAgentId ? AGENT_MAP[pinnedAgentId] : null) ?? autoAgent;

  // disabled 상태가 아닌 스테이지만 파이프라인에 표시
  const visiblePipeline = PIPELINE.filter((stage) =>
    stage.ids.some((id) => agentStatus[id] !== "disabled")
  );

  const activeStageIdx = visiblePipeline.findIndex((s) =>
    s.ids.some((id) => agentStatus[id] === "active")
  );

  // agent_done 이후에도 마지막 에이전트 로그를 유지 (activeAgentId가 null이 돼도 내용 사라지지 않음)
  const targetLog = streamLog[displayAgent.id] ?? "";
  const isSpeaking = speaking[displayAgent.id];
  const msg = lastMessage[displayAgent.id] ?? "";

  // 타이핑 애니메이션: streamLog → displayedLog를 글자 단위로 따라감
  const [displayedLog, setDisplayedLog] = useState("");
  const typeStateRef = useRef({ target: "", pos: 0, agentId: "" });
  const rafRef = useRef<number | null>(null);
  const displayAgentId = displayAgent.id;

  useEffect(() => {
    // displayAgent가 바뀔 때만 초기화 (activeAgentId 기반 X → done 후에도 안 리셋)
    if (typeStateRef.current.agentId !== displayAgentId) {
      typeStateRef.current = { target: "", pos: 0, agentId: displayAgentId };
      setDisplayedLog("");
    }
    typeStateRef.current.target = targetLog;

    const tick = () => {
      const s = typeStateRef.current;
      if (s.pos < s.target.length) {
        // 한 프레임에 3자씩 → 약 180자/초 (60fps 기준) — 읽을 수 있는 속도
        const next = Math.min(s.pos + 3, s.target.length);
        s.pos = next;
        setDisplayedLog(s.target.slice(0, next));
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);

    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [targetLog, displayAgentId]);

  // 로그 자동 스크롤
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [displayedLog]);

  // 채팅 피드 자동 스크롤
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [chatFeed]);

  // 활성 에이전트 바뀔 때마다 live timer 리셋
  useEffect(() => {
    const activeAgent = AGENTS.find((a) => agentStatus[a.id] === "active");
    if (!activeAgent) { setLiveElapsed(0); return; }
    activeStartRef.current = Date.now();
    setLiveElapsed(0);
    const tick = setInterval(() => setLiveElapsed(Date.now() - activeStartRef.current), 1000);
    return () => clearInterval(tick);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [AGENTS.find((a) => agentStatus[a.id] === "active")?.id]);

  return (
    <div
      className="fixed inset-0 z-50 flex"
      style={{ background: "#070b14" }}
    >
      {/* 왼쪽 — 에이전트 패널 */}
      <div
        className="w-80 shrink-0 flex flex-col items-center justify-center gap-6 px-8 py-10 relative border-r"
        style={{ borderColor: `${displayAgent.color}15`, background: `${displayAgent.color}04` }}
      >
        {/* 배경 글로우 */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at 50% 40%, ${displayAgent.glow} 0%, transparent 65%)`,
            opacity: 0.12,
          }}
        />

        {/* 말풍선 */}
        {msg && isSpeaking && (
          <div
            className="absolute top-10 left-1/2 -translate-x-1/2 z-10 animate-fadeIn w-56"
          >
            <div
              className="rounded-2xl rounded-b-sm px-4 py-2.5 text-xs text-slate-200 leading-relaxed text-center"
              style={{
                background: "#0f1521",
                border: `1px solid ${displayAgent.color}40`,
                boxShadow: `0 4px 24px ${displayAgent.glow}`,
              }}
            >
              {msg}
              <div
                className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45"
                style={{
                  background: "#0f1521",
                  borderRight: `1px solid ${displayAgent.color}40`,
                  borderBottom: `1px solid ${displayAgent.color}40`,
                }}
              />
            </div>
          </div>
        )}

        {/* 에이전트 이미지 */}
        <div className="relative mt-10">
          <div
            className="absolute inset-0 rounded-full animate-ping"
            style={{
              background: displayAgent.glow,
              transform: "scale(1.5)",
              opacity: 0.15,
              animationDuration: "2s",
            }}
          />
          <div
            className="relative rounded-full overflow-hidden"
            style={{
              width: 140,
              height: 140,
              outline: `2px solid ${displayAgent.color}`,
              outlineOffset: 4,
              boxShadow: `0 0 40px 8px ${displayAgent.glow}`,
            }}
          >
            <AgentImage
              defaultSrc={displayAgent.image}
              size={140}
              status="active"
              expression={agentExpression[displayAgent.id] ?? null}
            />
          </div>
        </div>

        {/* 이름 & 직책 */}
        <div className="relative text-center">
          <p className="text-2xl font-bold" style={{ color: displayAgent.color }}>
            {displayAgent.name}
          </p>
          <p className="text-sm text-slate-400 mt-0.5">
            {displayAgent.title} · {displayAgent.role}
          </p>
        </div>

        {/* 프로젝트 주제 */}
        <div
          className="relative w-full rounded-xl px-4 py-3"
          style={{
            background: "#0c1020",
            border: `1px solid ${displayAgent.color}20`,
          }}
        >
          <p className="text-[10px] text-slate-500 tracking-widest uppercase mb-1">Project</p>
          <p className="text-sm text-slate-200 font-medium leading-snug">{topic}</p>
        </div>

        {/* 담당 업무 */}
        <div className="relative w-full">
          <p className="text-[10px] text-slate-600 tracking-widest uppercase mb-2">담당 업무</p>
          <ul className="flex flex-col gap-1.5">
            {displayAgent.responsibilities.map((r, i) => (
              <li key={i} className="flex items-center gap-2 text-xs text-slate-400">
                <span style={{ color: `${displayAgent.color}80` }}>▸</span>
                {r}
              </li>
            ))}
          </ul>
        </div>

        {/* 파이프라인 진행 — 활성 에이전트만 표시 */}
        <div className="relative w-full mt-auto">
          <p className="text-[10px] text-slate-600 tracking-widest uppercase mb-2">Pipeline</p>
          <div className="flex items-center gap-1 flex-wrap">
            {visiblePipeline.map((stage, i) => {
              const stageAgent = AGENT_MAP[stage.ids[0]];
              const isActive = i === activeStageIdx;
              const isDone = activeStageIdx !== -1 && i < activeStageIdx;
              return (
                <div key={stage.ids.join("+")} className="flex items-center gap-1">
                  {i > 0 && (
                    <div
                      className="w-3 h-px"
                      style={{
                        background: isDone ? `${stageAgent.color}50` : "#1a2030",
                      }}
                    />
                  )}
                  <div
                    className="px-2 py-0.5 rounded-full text-[9px] font-semibold transition-all"
                    style={
                      isActive
                        ? {
                            background: `${stageAgent.color}20`,
                            border: `1px solid ${stageAgent.color}60`,
                            color: stageAgent.color,
                          }
                        : isDone
                        ? {
                            background: `${stageAgent.color}08`,
                            border: `1px solid ${stageAgent.color}20`,
                            color: `${stageAgent.color}50`,
                          }
                        : {
                            background: "transparent",
                            border: "1px solid #1a2030",
                            color: "#2a3347",
                          }
                    }
                  >
                    {stage.ids.length > 1
                      ? stage.ids.map((id) => AGENT_MAP[id]?.name ?? id).join("+")
                      : stageAgent.name}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 오른쪽 — 스트리밍 로그 + 채팅 피드 */}
      <div className="flex-1 flex overflow-hidden">

        {/* 스트리밍 로그 */}
        <div className="flex-1 flex flex-col overflow-hidden border-r" style={{ borderColor: "#0f1520" }}>
          {/* 에이전트 선택 썸네일 스트립 */}
          <div
            className="shrink-0 flex items-center gap-1.5 px-4 py-2 border-b overflow-x-auto scrollbar-hide"
            style={{ borderColor: "#0f1520", background: "#060a10" }}
          >
            {AGENTS.filter((a) => agentStatus[a.id] !== "disabled" && agentStatus[a.id] !== "waiting").map((a) => {
              const isActive = agentStatus[a.id] === "active";
              const isDone = agentStatus[a.id] === "done";
              const isPinned = pinnedAgentId === a.id;
              const isAuto = !pinnedAgentId && a.id === autoAgent.id;
              return (
                <button
                  key={a.id}
                  onClick={() => setPinnedAgentId(isPinned ? null : a.id)}
                  title={`${a.name} 로그 보기`}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-lg shrink-0 transition-all"
                  style={
                    isPinned || isAuto
                      ? { background: `${a.color}18`, border: `1px solid ${a.color}50` }
                      : { background: "transparent", border: "1px solid transparent", opacity: 0.5 }
                  }
                >
                  <div
                    className="w-4 h-4 rounded-full overflow-hidden shrink-0"
                    style={{ outline: `1px solid ${a.color}${isActive ? "90" : "40"}` }}
                  >
                    <img src={a.image} alt={a.name} className="w-full h-full object-cover object-top" />
                  </div>
                  <span className="text-[9px] font-bold" style={{ color: isActive || isPinned || isAuto ? a.color : `${a.color}80` }}>
                    {a.name}
                  </span>
                  {isActive && <div className="w-1 h-1 rounded-full animate-pulse" style={{ background: a.color }} />}
                  {isDone && (
                    <span className="text-[8px] font-mono tabular-nums" style={{ color: `${a.color}60` }}>
                      {agentDurations[a.id] ? fmtMs(agentDurations[a.id]) : "✓"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* 버전 히스토리 + 타임라인 탭 */}
          {(draftVersions.length > 0 || Object.keys(agentStartTs).length > 0) && (
            <div
              className="shrink-0 flex items-center gap-2 px-4 py-1.5 border-b overflow-x-auto scrollbar-hide"
              style={{ borderColor: "#0f1520", background: "#050810" }}
            >
              <button
                onClick={() => { setSelectedVersion(null); setShowGantt(false); }}
                className="text-[9px] px-2 py-0.5 rounded-full transition-all shrink-0"
                style={selectedVersion === null && !showGantt
                  ? { background: "rgba(139,92,246,0.2)", border: "1px solid rgba(139,92,246,0.4)", color: "#a78bfa" }
                  : { background: "transparent", border: "1px solid #1a2030", color: "#3a4560" }}
              >
                Live
              </button>
              {draftVersions.map((v) => (
                <button
                  key={v.version}
                  onClick={() => { setSelectedVersion(v.version); setShowGantt(false); }}
                  title={v.prevFeedback ? `이전 피드백: ${v.prevFeedback}` : undefined}
                  className="text-[9px] px-2 py-0.5 rounded-full transition-all shrink-0"
                  style={selectedVersion === v.version
                    ? { background: "rgba(139,92,246,0.2)", border: "1px solid rgba(139,92,246,0.4)", color: "#a78bfa" }
                    : { background: "transparent", border: "1px solid #1a2030", color: "#3a4560" }}
                >
                  v{v.version}{v.version === draftVersions[draftVersions.length - 1].version ? " ★" : ""}
                </button>
              ))}
              <div className="w-px h-3 shrink-0" style={{ background: "#1a2030" }} />
              <button
                onClick={() => { setShowGantt(!showGantt); setSelectedVersion(null); }}
                className="text-[9px] px-2 py-0.5 rounded-full transition-all shrink-0"
                style={showGantt
                  ? { background: "rgba(16,185,129,0.2)", border: "1px solid rgba(16,185,129,0.4)", color: "#34d399" }
                  : { background: "transparent", border: "1px solid #1a2030", color: "#3a4560" }}
              >
                📊 타임라인
              </button>
            </div>
          )}

          {/* 헤더 */}
          <div
            className="shrink-0 px-6 py-3 flex items-center gap-3 border-b"
            style={{ borderColor: "#0f1520" }}
          >
            <div
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ background: displayAgent.color }}
            />
            <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: displayAgent.color }}>
              {pinnedAgentId ? "Pinned" : "Live"} Output
            </span>
            <span className="text-xs text-slate-600 ml-1">— {displayAgent.name}</span>
            {/* 현재 에이전트 live 타이머 or 완료 소요 시간 */}
            {agentStatus[displayAgent.id] === "active" && liveElapsed > 0 && (
              <span className="text-[10px] font-mono tabular-nums" style={{ color: `${displayAgent.color}80` }}>
                {fmtMs(liveElapsed)}
              </span>
            )}
            {agentStatus[displayAgent.id] === "done" && agentDurations[displayAgent.id] && (
              <span className="text-[10px] font-mono tabular-nums text-slate-600">
                {fmtMs(agentDurations[displayAgent.id])}
              </span>
            )}
            {pinnedAgentId && (
              <button
                onClick={() => setPinnedAgentId(null)}
                className="text-[10px] text-slate-700 hover:text-slate-400 transition-colors"
              >
                핀 해제
              </button>
            )}
            <button
              onClick={() => setConfirmStop(true)}
              className="ml-auto text-[11px] px-3 py-1.5 rounded-full border transition-all hover:bg-red-950/40"
              style={{ borderColor: "#3a1a1a", color: "#7a3535" }}
            >
              작업 중단
            </button>
          </div>

          {/* 로그 영역 */}
          <div
            ref={logRef}
            className="flex-1 overflow-y-auto px-6 py-5 font-mono text-xs leading-relaxed"
            style={{ color: "#8899aa" }}
          >
            {showGantt ? (() => {
              const now = Date.now();
              const ganttAgents = AGENTS.filter((a) => agentStartTs[a.id] && agentStatus[a.id] !== "disabled" && agentStatus[a.id] !== "waiting");
              if (ganttAgents.length === 0) return <p className="text-slate-700 text-xs mt-4">아직 실행된 에이전트가 없어요.</p>;
              const base = sessionStartTs || Math.min(...ganttAgents.map((a) => agentStartTs[a.id]));
              const ends = ganttAgents.map((a) => {
                const start = agentStartTs[a.id] - base;
                const dur = agentDurations[a.id] ?? Math.max(0, now - agentStartTs[a.id]);
                return start + dur;
              });
              const totalMs = Math.max(...ends, 1);
              // 고정 SVG 너비로 calc() 없이 수치 계산
              const SVG_W = 560;
              const LABEL_W = 52;
              const DUR_W = 48;
              const BAR_AREA = SVG_W - LABEL_W - DUR_W;
              const ROW_H = 28;
              const BAR_H = 14;
              const svgH = ganttAgents.length * ROW_H + 28;
              return (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 pb-2 border-b" style={{ borderColor: "#1a2535" }}>
                    <span className="text-[10px] tracking-widest uppercase font-bold" style={{ color: "#34d399" }}>📊 타임라인</span>
                    <span className="text-[10px] text-slate-600">총 {fmtMs(totalMs)}</span>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                  <svg width={SVG_W} height={svgH}>
                    {/* 눈금선 */}
                    {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                      const gx = LABEL_W + BAR_AREA * t;
                      return (
                        <g key={t}>
                          <line x1={gx} y1={0} x2={gx} y2={svgH - 18} stroke="#1a2535" strokeWidth={1} strokeDasharray="3,3" />
                          <text x={gx} y={svgH - 4} fill="#2a3a50" fontSize={7} textAnchor="middle" fontFamily="monospace">{fmtMs(totalMs * t)}</text>
                        </g>
                      );
                    })}
                    {ganttAgents.map((agent, i) => {
                      const relStart = agentStartTs[agent.id] - base;
                      const dur = agentDurations[agent.id] ?? Math.max(0, now - agentStartTs[agent.id]);
                      const isActive = agentStatus[agent.id] === "active";
                      const y = i * ROW_H + 4;
                      const bx = LABEL_W + (relStart / totalMs) * BAR_AREA;
                      const bw = Math.max((Math.max(dur, totalMs * 0.005) / totalMs) * BAR_AREA, 4);
                      return (
                        <g key={agent.id}>
                          <text x={LABEL_W - 4} y={y + BAR_H / 2 + 4} fill={`${agent.color}90`} fontSize={8} textAnchor="end" fontFamily="monospace">{agent.name}</text>
                          {/* 배경 트랙 */}
                          <rect x={LABEL_W} y={y} width={BAR_AREA} height={BAR_H} fill="#0a0f1a" rx={3} />
                          {/* 실제 바 */}
                          <rect x={bx} y={y} width={bw} height={BAR_H} fill={isActive ? `${agent.color}50` : `${agent.color}30`} stroke={agent.color} strokeWidth={1} rx={3} />
                          {isActive && (
                            <rect x={bx} y={y} width={bw} height={BAR_H} fill={`${agent.color}20`} rx={3} opacity={0.8} />
                          )}
                          <text x={LABEL_W + BAR_AREA + 4} y={y + BAR_H / 2 + 4} fill={`${agent.color}70`} fontSize={8} fontFamily="monospace">
                            {fmtMs(dur)}{isActive ? "⏱" : ""}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                  </div>
                </div>
              );
            })() : selectedVersion !== null ? (() => {
              const vData = draftVersions.find((v) => v.version === selectedVersion);
              if (!vData) return null;
              const prevData = draftVersions.find((v) => v.version === selectedVersion - 1);
              const lines = prevData ? lineDiff(prevData.content, vData.content) : vData.content.split("\n").map((t) => ({ text: t, type: "same" as const }));
              const addedCount = lines.filter((l) => l.type === "added").length;
              return (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 pb-2 border-b mb-1" style={{ borderColor: "#1a2535" }}>
                    <span className="text-[10px] tracking-widest uppercase font-bold" style={{ color: "#a78bfa" }}>v{selectedVersion}</span>
                    {vData.prevFeedback && (
                      <span className="text-[10px] text-slate-600 italic truncate max-w-xs">팩트 피드백: {vData.prevFeedback.slice(0, 80)}</span>
                    )}
                    {prevData && addedCount > 0 && (
                      <span className="ml-auto text-[9px] px-2 py-0.5 rounded-full" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", color: "#4ade80" }}>
                        +{addedCount}줄 변경
                      </span>
                    )}
                  </div>
                  <pre className="whitespace-pre-wrap break-words text-[11px] leading-relaxed" style={{ fontFamily: "inherit" }}>
                    {lines.map((line, i) => (
                      <span
                        key={i}
                        className="block"
                        style={line.type === "added"
                          ? { color: "#86efac", background: "rgba(34,197,94,0.06)", borderLeft: "2px solid rgba(34,197,94,0.4)", paddingLeft: "6px", marginLeft: "-8px" }
                          : { color: "#6b7d96" }}
                      >
                        {line.text || " "}
                      </span>
                    ))}
                  </pre>
                </div>
              );
            })() : displayedLog ? (
              <pre className="whitespace-pre-wrap break-words">{displayedLog}<span className="animate-pulse" style={{ color: displayAgent.color }}>▋</span></pre>
            ) : liveDraft ? (
              <div className="flex flex-col gap-3">
                {/* 초안 헤더 */}
                <div className="flex items-center gap-2 pb-2 border-b" style={{ borderColor: "#1a2535" }}>
                  <span className="text-[10px] tracking-widest uppercase font-bold" style={{ color: "#a78bfa" }}>
                    📝 초안
                  </span>
                  <span className="text-[10px] text-slate-600">— {AGENT_MAP[liveDraft.agentId]?.name ?? liveDraft.agentId} 작성 · 팩트 검토 중</span>
                  <div className="ml-auto flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="w-1 h-1 rounded-full animate-bounce" style={{ background: "#a78bfa", opacity: 0.6, animationDelay: `${i * 150}ms` }} />
                    ))}
                  </div>
                </div>
                {/* 초안 내용 */}
                <pre className="whitespace-pre-wrap break-words text-[11px] leading-relaxed" style={{ color: "#6b7d96", fontFamily: "inherit" }}>
                  {liveDraft.content}
                </pre>
              </div>
            ) : (
              <div className="flex flex-col gap-3 mt-4">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="w-1.5 h-1.5 rounded-full animate-bounce"
                        style={{
                          background: displayAgent.color,
                          opacity: 0.5,
                          animationDelay: `${i * 200}ms`,
                        }}
                      />
                    ))}
                  </div>
                  <span className="text-xs" style={{ color: `${displayAgent.color}80` }}>
                    {displayAgent.name} 처리 중...
                  </span>
                </div>
                {thinkingHint[displayAgent.id] && (
                  <p className="text-[11px] italic" style={{ color: `${displayAgent.color}55` }}>
                    💭 {thinkingHint[displayAgent.id]}
                  </p>
                )}
                {msg && (
                  <p className="text-xs leading-relaxed italic" style={{ color: `${displayAgent.color}55` }}>
                    &ldquo;{msg}&rdquo;
                  </p>
                )}
              </div>
            )}
          </div>


        </div>

        {/* 채팅 피드 — 직원 간 대화 */}
        <div className="w-64 shrink-0 flex flex-col overflow-hidden">
          <div
            className="shrink-0 px-4 py-4 border-b flex items-center gap-2"
            style={{ borderColor: "#0f1520" }}
          >
            <span className="text-[10px] text-slate-600 tracking-widest uppercase font-bold">팀 커뮤니케이션</span>
          </div>
          <div
            ref={chatRef}
            className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2"
          >
            {chatFeed.length === 0 ? (
              <p className="text-[10px] text-slate-800 text-center mt-4">대기 중...</p>
            ) : (
              chatFeed.map((entry) => {
                const agent = AGENT_MAP[entry.agentId];
                if (!agent) return null;
                const isStart = entry.text.startsWith("[시작]");
                const isDone = entry.text.startsWith("[완료]");
                const displayText = isStart
                  ? entry.text.slice(4).trim()
                  : isDone
                  ? entry.text.slice(4).trim()
                  : entry.text;
                return (
                  <div key={entry.id} className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-3 h-3 rounded-full shrink-0 flex items-center justify-center text-[6px] font-bold"
                        style={{ background: `${agent.color}20`, border: `1px solid ${agent.color}40`, color: agent.color }}
                      >
                        {isStart ? "▶" : isDone ? "✓" : "·"}
                      </div>
                      <span className="text-[9px] font-bold" style={{ color: `${agent.color}90` }}>
                        {agent.name}
                      </span>
                    </div>
                    <p
                      className="text-[10px] leading-snug pl-4.5 ml-[18px]"
                      style={{ color: isDone ? `${agent.color}60` : "#64748b" }}
                    >
                      {displayText}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* 중단 확인 다이얼로그 */}
      {confirmStop && (
        <div className="absolute inset-0 z-60 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)" }}>
          <div
            className="rounded-2xl px-8 py-7 flex flex-col gap-5 w-80"
            style={{ background: "#0d1120", border: "1px solid #3a1a1a" }}
          >
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-red-400">작업을 중단할까요?</p>
              <p className="text-xs text-slate-500 leading-relaxed">
                지금까지 진행한 데이터가 모두 사라집니다.
                저장된 리포트가 없다면 복구할 수 없어요.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmStop(false)}
                className="flex-1 text-xs py-2 rounded-xl border transition-all hover:bg-slate-800"
                style={{ borderColor: "#1e2535", color: "#94a3b8" }}
              >
                계속 진행
              </button>
              <button
                onClick={onStop}
                className="flex-1 text-xs py-2 rounded-xl font-semibold transition-all"
                style={{ background: "#3a1010", border: "1px solid #6b2020", color: "#f87171" }}
              >
                중단
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
