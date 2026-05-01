"use client";

import { useState, useEffect } from "react";
import { MessageCircle, Layers, Clock, ExternalLink } from "lucide-react";
import { AgentDef } from "@/lib/agents";
import ChatPanel from "./ChatPanel";

type Report = { id: string; topic: string; content: string; createdAt: number };
type Tab = "designs" | "chat";
type ViewMode = "preview" | "code";

function HtmlPreview({ html }: { html: string }) {
  const isHtml = html.trim().startsWith("<") && html.includes("</");
  const [mode, setMode] = useState<ViewMode>("preview");

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center gap-2 px-4 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        {(["preview", "code"] as ViewMode[]).map(m => (
          <button key={m} onClick={() => setMode(m)}
            className="text-[10px] px-3 py-1 rounded-full transition-all"
            style={mode === m
              ? { background: "rgba(253,186,116,0.15)", color: "#fdba74", border: "1px solid rgba(253,186,116,0.3)" }
              : { color: "#475569", border: "1px solid transparent" }}
          >
            {m === "preview" ? "프리뷰" : "코드"}
          </button>
        ))}
        {isHtml && (
          <button onClick={() => {
            const w = window.open(); if (w) { w.document.write(html); w.document.close(); }
          }} className="ml-auto flex items-center gap-1 text-[10px] text-slate-600 hover:text-slate-300 transition-colors">
            <ExternalLink size={10} />새 탭
          </button>
        )}
      </div>
      <div className="flex-1 overflow-hidden">
        {mode === "preview" && isHtml ? (
          <iframe
            srcDoc={html}
            className="w-full h-full border-0 bg-white"
            sandbox="allow-scripts"
            title="design preview"
          />
        ) : (
          <div className="h-full overflow-y-auto px-6 py-4 scrollbar-hide">
            <pre className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap font-mono">{html}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PixelWorkspace({ agent }: { agent: AgentDef }) {
  const [tab, setTab] = useState<Tab>("designs");
  const [designs, setDesigns] = useState<Report[]>([]);
  const [selected, setSelected] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/reports?agentId=pixel")
      .then(r => r.json())
      .then((data: Report[]) => setDesigns(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const TABS = [
    { id: "designs" as Tab, label: "내 디자인", icon: Layers },
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

        {tab === "designs" && !selected && (
          <div className="h-full overflow-y-auto px-6 py-5 space-y-2.5 scrollbar-hide">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: `${agent.color}30`, borderTopColor: agent.color }} />
              </div>
            ) : designs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 gap-3">
                <Layers size={32} className="text-slate-700" />
                <p className="text-sm text-slate-600">아직 디자인 작업물이 없어요</p>
                <p className="text-[11px] text-slate-700">UI 디자인 태스크를 시작하면 여기에 쌓여요</p>
              </div>
            ) : (
              designs.map(d => (
                <button key={d.id} onClick={() => setSelected(d)}
                  className="w-full text-left flex items-start gap-4 px-4 py-3.5 rounded-2xl transition-all hover:opacity-80"
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <Layers size={14} style={{ color: agent.color, marginTop: 2, flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 truncate">{d.topic}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Clock size={9} className="text-slate-700" />
                      <span className="text-[10px] text-slate-600">
                        {new Date(d.createdAt * 1000).toLocaleDateString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {d.content.trim().startsWith("<") && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(253,186,116,0.1)", color: "#fdba74" }}>HTML</span>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {tab === "designs" && selected && (
          <div className="flex flex-col h-full">
            <div className="shrink-0 px-6 py-3 flex items-center gap-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <button onClick={() => setSelected(null)} className="text-xs text-slate-600 hover:text-slate-300 transition-colors">← 목록</button>
              <span className="text-xs text-slate-400 truncate">{selected.topic}</span>
            </div>
            <div className="flex-1 overflow-hidden">
              <HtmlPreview html={selected.content} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
