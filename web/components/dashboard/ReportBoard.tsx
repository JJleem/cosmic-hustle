"use client";

import { useState } from "react";
import { X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { AGENT_MAP } from "@/lib/agents";

export type Report = {
  id: string;
  agentId: string;
  topic: string;
  content: string;
  createdAt: Date;
};

function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/\n+/g, " ")
    .trim();
}

type Props = { reports: Report[] };

export default function ReportBoard({ reports }: Props) {
  const [selected, setSelected] = useState<Report | null>(null);

  return (
    <>
      <div className="flex flex-col h-full">
        <p className="text-[10px] text-slate-300 tracking-[0.2em] uppercase mb-4 font-bold">
          보고 현황
        </p>

        {reports.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-slate-400 text-xs">접수된 보고서 없음</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-2 scrollbar-hide">
            {reports.map((r) => {
              const agent = AGENT_MAP[r.agentId];
              return (
                <div
                  key={r.id}
                  onClick={() => setSelected(r)}
                  className="rounded-xl border border-slate-500 bg-slate-700/50 p-3 hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: `${agent?.color}25`, color: agent?.color, border: `1px solid ${agent?.color}60` }}
                    >
                      {agent?.name} · {agent?.role}
                    </span>
                    <span className="text-[9px] text-slate-400 ml-auto">
                      {r.createdAt.toLocaleDateString("ko-KR")}
                    </span>
                  </div>
                  <p className="text-xs text-white font-semibold truncate">{r.topic}</p>
                  <p className="text-[11px] text-slate-300 mt-1 line-clamp-2 leading-relaxed">
                    {stripMarkdown(r.content)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 리포트 모달 */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setSelected(null)}
        >
          <div
            className="relative w-full max-w-2xl max-h-[80vh] mx-4 rounded-2xl border border-slate-600 bg-[#0f1629] shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="shrink-0 flex items-center gap-3 px-6 py-4 border-b border-slate-700">
              {(() => {
                const agent = AGENT_MAP[selected.agentId];
                return (
                  <span
                    className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                    style={{ background: `${agent?.color}25`, color: agent?.color, border: `1px solid ${agent?.color}60` }}
                  >
                    {agent?.name} · {agent?.role}
                  </span>
                );
              })()}
              <p className="text-sm text-white font-semibold flex-1 truncate">{selected.topic}</p>
              <span className="text-[10px] text-slate-400">
                {selected.createdAt.toLocaleDateString("ko-KR")}
              </span>
              <button
                onClick={() => setSelected(null)}
                className="ml-2 text-slate-400 hover:text-white transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            {/* 모달 본문 */}
            <div className="flex-1 overflow-y-auto px-6 py-5 scrollbar-hide">
              <div className="report-body text-sm text-slate-300 leading-relaxed">
                <ReactMarkdown>{selected.content}</ReactMarkdown>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
