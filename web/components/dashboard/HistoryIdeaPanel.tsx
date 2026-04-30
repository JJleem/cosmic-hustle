"use client";

import { useState } from "react";
import { Zap, BarChart2 } from "lucide-react";
import { ProjectRecord } from "./ProjectHistory";
import { Idea } from "@/components/AgentWorkspace";
import { AGENT_MAP } from "@/lib/agents";

type Tab = "history" | "ideas" | "stats";

type ReportStat = { id: string; agentId: string; content: string; topic: string };

type Props = {
  projects: ProjectRecord[];
  ideas: Idea[];
  reports?: ReportStat[];
  agentDurations?: Record<string, number>;
  onIdeaSelect?: (topic: string) => void;
};

const WRITERS = [
  { id: "over",  label: "오버" },
  { id: "run",   label: "런" },
  { id: "pixel", label: "픽셀" },
  { id: "buzz",  label: "버즈" },
];

export default function HistoryIdeaPanel({ projects, ideas, reports = [], agentDurations = {}, onIdeaSelect }: Props) {
  const [tab, setTab] = useState<Tab>("history");

  return (
    <div className="flex flex-col h-full">
      {/* 탭 헤더 */}
      <div className="flex items-center gap-1 mb-4 shrink-0">
        {(["history", "ideas", "stats"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold tracking-[0.15em] uppercase transition-all"
            style={
              tab === t
                ? { background: "#1e293b", color: "#e2e8f0", border: "1px solid #334155" }
                : { background: "transparent", color: "#475569", border: "1px solid transparent" }
            }
          >
            {t === "history" && "내역"}
            {t === "ideas" && (
              <>
                <Zap size={9} />
                아이디어
                {ideas.length > 0 && (
                  <span
                    className="ml-0.5 px-1.5 py-0.5 rounded-full text-[8px] font-bold"
                    style={{ background: "#fbbf2420", color: "#fbbf24", border: "1px solid #fbbf2440" }}
                  >
                    {ideas.length}
                  </span>
                )}
              </>
            )}
            {t === "stats" && (
              <>
                <BarChart2 size={9} />
                통계
              </>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "history" && <HistoryList projects={projects} />}
        {tab === "ideas" && <IdeaBoard ideas={ideas} onIdeaSelect={onIdeaSelect} />}
        {tab === "stats" && <StatsPanel projects={projects} reports={reports} agentDurations={agentDurations} />}
      </div>
    </div>
  );
}

function HistoryList({ projects }: { projects: ProjectRecord[] }) {
  if (projects.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-slate-400 text-xs">완료된 프로젝트 없음</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto space-y-2 scrollbar-hide">
      {projects.map((p, i) => (
        <div
          key={p.id}
          className="flex items-start gap-3 rounded-xl border border-slate-500 bg-slate-700/50 p-3 hover:bg-slate-700 transition-colors cursor-pointer"
        >
          <span className="text-[10px] text-slate-400 mt-0.5 w-5 shrink-0 font-mono">
            {String(i + 1).padStart(2, "0")}
          </span>
          <div className="min-w-0">
            <p className="text-xs text-white font-semibold truncate">{p.topic}</p>
            <p className="text-[9px] text-slate-400 mt-0.5">
              {p.completedAt.toLocaleDateString("ko-KR")}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function StatsPanel({ projects, reports, agentDurations }: { projects: ProjectRecord[]; reports: ReportStat[]; agentDurations: Record<string, number> }) {
  const totalChars = reports.reduce((s, r) => s + r.content.length, 0);
  const avgChars = reports.length > 0 ? Math.round(totalChars / reports.length) : 0;
  const maxCount = Math.max(...WRITERS.map(({ id }) => reports.filter((r) => r.agentId === id).length), 1);

  return (
    <div className="h-full overflow-y-auto space-y-4 scrollbar-hide">
      {/* 요약 카드 3개 */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "완료 프로젝트", value: projects.length, unit: "건" },
          { label: "총 보고서", value: reports.length, unit: "건" },
          { label: "평균 분량", value: avgChars.toLocaleString(), unit: "자" },
        ].map(({ label, value, unit }) => (
          <div
            key={label}
            className="rounded-xl px-3 py-2.5 flex flex-col gap-1"
            style={{ background: "#0d1120", border: "1px solid #1a2235" }}
          >
            <p className="text-[8px] text-slate-600 tracking-widest uppercase">{label}</p>
            <p className="text-lg font-bold text-slate-100 leading-none">
              {value}<span className="text-[10px] text-slate-500 ml-0.5 font-normal">{unit}</span>
            </p>
          </div>
        ))}
      </div>

      {/* 에이전트별 보고서 수 */}
      <div className="rounded-xl px-3 py-3" style={{ background: "#0d1120", border: "1px solid #1a2235" }}>
        <p className="text-[9px] text-slate-600 tracking-widest uppercase mb-3">에이전트별 작성</p>
        <div className="flex flex-col gap-2.5">
          {WRITERS.map(({ id, label }) => {
            const agent = AGENT_MAP[id];
            const count = reports.filter((r) => r.agentId === id).length;
            const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
            if (count === 0) return null;
            return (
              <div key={id} className="flex items-center gap-2">
                <span className="text-[10px] w-8 shrink-0 font-semibold" style={{ color: agent?.color }}>{label}</span>
                <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, background: agent?.color ?? "#94a3b8" }}
                  />
                </div>
                <span className="text-[10px] text-slate-500 w-4 text-right shrink-0">{count}</span>
              </div>
            );
          })}
          {WRITERS.every(({ id }) => reports.filter((r) => r.agentId === id).length === 0) && (
            <p className="text-[10px] text-slate-700 text-center py-2">보고서 없음</p>
          )}
        </div>
      </div>

      {/* 에이전트 소요 시간 */}
      {Object.keys(agentDurations).length > 0 && (
        <div className="rounded-xl px-3 py-3" style={{ background: "#0d1120", border: "1px solid #1a2235" }}>
          <p className="text-[9px] text-slate-600 tracking-widest uppercase mb-2">이번 세션 소요 시간</p>
          <div className="flex flex-col gap-1.5">
            {Object.entries(agentDurations)
              .sort(([, a], [, b]) => b - a)
              .map(([id, ms]) => {
                const agent = AGENT_MAP[id];
                const maxMs = Math.max(...Object.values(agentDurations));
                return (
                  <div key={id} className="flex items-center gap-2">
                    <span className="text-[10px] w-8 shrink-0 font-semibold" style={{ color: agent?.color ?? "#94a3b8" }}>
                      {agent?.name ?? id}
                    </span>
                    <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${(ms / maxMs) * 100}%`, background: agent?.color ?? "#94a3b8" }}
                      />
                    </div>
                    <span className="text-[9px] text-slate-500 w-10 text-right shrink-0 font-mono">{fmtDuration(ms)}</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* 최근 완료 프로젝트 */}
      {projects.length > 0 && (
        <div className="rounded-xl px-3 py-3" style={{ background: "#0d1120", border: "1px solid #1a2235" }}>
          <p className="text-[9px] text-slate-600 tracking-widest uppercase mb-2">최근 완료</p>
          <div className="flex flex-col gap-1.5">
            {projects.slice(0, 3).map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <div className="w-1 h-1 rounded-full bg-emerald-500/60 shrink-0" />
                <p className="text-[10px] text-slate-400 truncate flex-1">{p.topic}</p>
                <p className="text-[9px] text-slate-700 shrink-0">{p.completedAt.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function IdeaBoard({ ideas, onIdeaSelect }: { ideas: Idea[]; onIdeaSelect?: (topic: string) => void }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (ideas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
          style={{ background: "#fbbf2415", border: "1px solid #fbbf2430" }}
        >
          ✨
        </div>
        <p className="text-xs text-slate-500">리서치 완료 후 핑이 아이디어를 캡처해요</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto space-y-2 scrollbar-hide">
      {ideas.map((idea, i) => (
        <div
          key={i}
          onMouseEnter={() => setHoveredIdx(i)}
          onMouseLeave={() => setHoveredIdx(null)}
          className="rounded-xl border p-3 transition-all"
          style={{
            background: hoveredIdx === i ? "#111827" : "#0d1120",
            borderColor: hoveredIdx === i ? "#fbbf2440" : "#fbbf2420",
          }}
        >
          <div className="flex items-start gap-2">
            <span style={{ color: "#fbbf24" }} className="text-[10px] mt-0.5 shrink-0 font-bold font-mono">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-white font-semibold leading-snug">{idea.title}</p>
              {idea.spark && (
                <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">{idea.spark}</p>
              )}
              {onIdeaSelect && hoveredIdx === i && (
                <button
                  onClick={() => onIdeaSelect(idea.title)}
                  className="mt-2 text-[9px] font-bold px-2.5 py-1 rounded-full transition-all"
                  style={{ background: "#fbbf2415", color: "#fbbf24", border: "1px solid #fbbf2440" }}
                >
                  이 아이디어로 시작 →
                </button>
              )}
            </div>
            <Zap size={10} style={{ color: "#fbbf2460" }} className="shrink-0 mt-0.5" />
          </div>
        </div>
      ))}
    </div>
  );
}
