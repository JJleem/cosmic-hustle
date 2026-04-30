"use client";

import { useState } from "react";
import { Zap } from "lucide-react";
import { ProjectRecord } from "./ProjectHistory";
import { Idea } from "@/components/AgentWorkspace";

type Tab = "history" | "ideas";

type Props = {
  projects: ProjectRecord[];
  ideas: Idea[];
  onIdeaSelect?: (topic: string) => void;
};

export default function HistoryIdeaPanel({ projects, ideas, onIdeaSelect }: Props) {
  const [tab, setTab] = useState<Tab>("history");

  return (
    <div className="flex flex-col h-full">
      {/* 탭 헤더 */}
      <div className="flex items-center gap-1 mb-4 shrink-0">
        {(["history", "ideas"] as Tab[]).map((t) => (
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
            {t === "history" ? "내역" : (
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
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "history" ? (
          <HistoryList projects={projects} />
        ) : (
          <IdeaBoard ideas={ideas} onIdeaSelect={onIdeaSelect} />
        )}
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
