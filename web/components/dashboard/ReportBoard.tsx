"use client";

import { useState, useEffect } from "react";
import { X, Download, Copy, Check } from "lucide-react";
import Image from "next/image";
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

function downloadMarkdown(report: Report) {
  const filename = `${report.topic.replace(/[^a-zA-Z0-9가-힣]/g, "_")}_${report.agentId}.md`;
  const header = `# ${report.topic}\n\n> 작성: ${AGENT_MAP[report.agentId]?.name ?? report.agentId} · ${new Date(report.createdAt).toLocaleDateString("ko-KR")}\n\n---\n\n`;
  const blob = new Blob([header + report.content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type Props = { reports: Report[] };

export default function ReportBoard({ reports }: Props) {
  const [selected, setSelected] = useState<Report | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setSelected(null); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleCopy = async () => {
    if (!selected) return;
    await navigator.clipboard.writeText(selected.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
                  onClick={() => { setSelected(r); setCopied(false); }}
                  className="rounded-xl border border-slate-500 bg-slate-700/50 p-3 hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    {agent?.image && (
                      <div className="w-5 h-5 rounded-full overflow-hidden shrink-0" style={{ outline: `1px solid ${agent.color}60` }}>
                        <Image src={agent.image} alt={agent.name} width={20} height={20} className="object-cover" />
                      </div>
                    )}
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

      {/* 리포트 상세 모달 */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm"
          onClick={() => setSelected(null)}
        >
          <div
            className="relative w-full max-w-3xl max-h-[88vh] mx-6 rounded-2xl border border-slate-600 bg-[#0c1220] shadow-2xl flex flex-col animate-fadeIn"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="shrink-0 flex items-center gap-3 px-6 py-4 border-b border-slate-700/80">
              {(() => {
                const agent = AGENT_MAP[selected.agentId];
                return (
                  <div className="flex items-center gap-2.5 shrink-0">
                    {agent?.image && (
                      <div
                        className="w-8 h-8 rounded-full overflow-hidden shrink-0"
                        style={{ outline: `2px solid ${agent.color}50`, outlineOffset: 2 }}
                      >
                        <Image src={agent.image} alt={agent.name} width={32} height={32} className="object-cover" />
                      </div>
                    )}
                    <div>
                      <p className="text-[11px] font-bold leading-none" style={{ color: agent?.color }}>
                        {agent?.name}
                      </p>
                      <p className="text-[9px] text-slate-400 mt-0.5">{agent?.role}</p>
                    </div>
                  </div>
                );
              })()}

              <div className="w-px h-6 bg-slate-700 shrink-0" />

              <p className="text-sm text-white font-semibold flex-1 min-w-0 truncate">{selected.topic}</p>

              <span className="text-[10px] text-slate-500 shrink-0">
                {selected.createdAt.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })}
              </span>

              {/* 액션 버튼 */}
              <div className="flex items-center gap-1 shrink-0 ml-1">
                <button
                  onClick={handleCopy}
                  title="클립보드 복사"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
                >
                  {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  <span>{copied ? "복사됨" : "복사"}</span>
                </button>
                <button
                  onClick={() => downloadMarkdown(selected)}
                  title="마크다운 다운로드"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
                >
                  <Download size={12} />
                  <span>저장</span>
                </button>
                <div className="w-px h-4 bg-slate-700" />
                <button
                  onClick={() => setSelected(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* 본문 */}
            <div className="flex-1 overflow-y-auto px-8 py-6 scrollbar-hide">
              <div className="report-body text-sm text-slate-300 leading-relaxed">
                <ReactMarkdown>{selected.content}</ReactMarkdown>
              </div>
            </div>

            {/* 푸터 */}
            <div className="shrink-0 px-8 py-3 border-t border-slate-800 flex items-center justify-between">
              <span className="text-[10px] text-slate-600">
                {selected.content.length.toLocaleString()}자
              </span>
              <button
                onClick={() => setSelected(null)}
                className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
              >
                닫기 (Esc)
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
