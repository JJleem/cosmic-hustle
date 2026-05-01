"use client";

import { useState, useEffect } from "react";
import { MessageCircle, FileText, Clock } from "lucide-react";
import { AgentDef } from "@/lib/agents";
import ChatPanel from "./ChatPanel";

type Report = { id: string; topic: string; content: string; createdAt: number };
type Tab = "reports" | "chat";

export default function OverWorkspace({ agent }: { agent: AgentDef }) {
  const [tab, setTab] = useState<Tab>("reports");
  const [reports, setReports] = useState<Report[]>([]);
  const [selected, setSelected] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/reports?agentId=over")
      .then(r => r.json())
      .then((data: Report[]) => setReports(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const TABS = [
    { id: "reports" as Tab, label: "내 보고서", icon: FileText },
    { id: "chat"    as Tab, label: "채팅",      icon: MessageCircle },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center gap-1 px-5 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => { setTab(id); setSelected(null); }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium transition-all"
            style={tab === id
              ? { background: `${agent.color}15`, color: agent.color, border: `1px solid ${agent.color}30` }
              : { color: "#475569", border: "1px solid transparent" }}
          >
            <Icon size={11} />{label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === "chat" && <ChatPanel agent={agent} />}

        {tab === "reports" && !selected && (
          <div className="h-full overflow-y-auto px-6 py-5 space-y-2.5 scrollbar-hide">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: `${agent.color}30`, borderTopColor: agent.color }} />
              </div>
            ) : reports.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 gap-3">
                <FileText size={32} className="text-slate-700" />
                <p className="text-sm text-slate-600">아직 작성한 보고서가 없어요</p>
                <p className="text-[11px] text-slate-700">새 프로젝트를 시작하면 여기에 쌓여요</p>
              </div>
            ) : (
              reports.map(r => (
                <button key={r.id} onClick={() => setSelected(r)}
                  className="w-full text-left flex items-start gap-4 px-4 py-3.5 rounded-2xl transition-all hover:opacity-80"
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <FileText size={14} style={{ color: agent.color, marginTop: 2, flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 truncate">{r.topic}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Clock size={9} className="text-slate-700" />
                      <span className="text-[10px] text-slate-600">
                        {new Date(r.createdAt * 1000).toLocaleDateString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {tab === "reports" && selected && (
          <div className="flex flex-col h-full">
            <div className="shrink-0 px-6 py-3 flex items-center gap-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <button onClick={() => setSelected(null)} className="text-xs text-slate-600 hover:text-slate-300 transition-colors">← 목록</button>
              <span className="text-xs text-slate-400 truncate">{selected.topic}</span>
            </div>
            <div className="flex-1 overflow-y-auto px-8 py-6 scrollbar-hide">
              <pre className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap font-sans">{selected.content}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
