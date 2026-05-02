"use client";

import { useState } from "react";
import { MessageCircle, Sparkles, Zap, Play } from "lucide-react";
import { AgentDef } from "@/lib/agents";
import { Idea } from "@/components/AgentWorkspace";
import ChatPanel from "./ChatPanel";

type Tab = "ideas" | "chat";

export default function PingWorkspace({ agent, pingIdeas, onStartProject }: { agent: AgentDef; pingIdeas: Idea[]; onStartProject?: (topic: string) => void }) {
  const [tab, setTab] = useState<Tab>("ideas");

  const TABS = [
    { id: "ideas" as Tab, label: "아이디어 보드", icon: Sparkles },
    { id: "chat"  as Tab, label: "채팅",          icon: MessageCircle },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center gap-1 px-5 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium transition-all"
            style={tab === id
              ? { background: `${agent.color}15`, color: agent.color, border: `1px solid ${agent.color}30` }
              : { color: "#475569", border: "1px solid transparent" }}
          >
            <Icon size={11} />{label}
          </button>
        ))}
        {pingIdeas.length > 0 && (
          <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${agent.color}15`, color: agent.color }}>
            {pingIdeas.length}개
          </span>
        )}
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === "chat" && <ChatPanel agent={agent} />}

        {tab === "ideas" && (
          <div className="h-full overflow-y-auto px-6 py-5 scrollbar-hide">
            {pingIdeas.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 gap-3">
                <div className="relative">
                  <Zap size={32} className="text-slate-700" />
                  <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full animate-ping" style={{ background: agent.color, opacity: 0.4 }} />
                </div>
                <p className="text-sm text-slate-600">아직 캡처된 아이디어가 없어요</p>
                <p className="text-[11px] text-slate-700">리서치가 완료되면 핑이 아이디어를 여기에 모아줘요</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[9px] text-slate-600 tracking-widest uppercase font-bold mb-4">캡처된 아이디어 · {pingIdeas.length}개</p>
                {pingIdeas.map((idea, i) => (
                  <div key={i} className="group relative rounded-2xl px-4 py-4 transition-all"
                    style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${agent.color}15` }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: `${agent.color}15` }}>
                        <Zap size={9} style={{ color: agent.color }} />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-slate-200 leading-relaxed font-medium">{idea.title}</p>
                        {idea.spark && (
                          <p className="text-xs text-slate-500 leading-relaxed mt-1.5">{idea.spark}</p>
                        )}
                        {onStartProject && (
                          <button
                            onClick={() => onStartProject(idea.title)}
                            className="flex items-center gap-1 mt-2 text-[10px] px-2.5 py-1 rounded-full transition-all hover:opacity-80"
                            style={{ background: `${agent.color}12`, color: agent.color, border: `1px solid ${agent.color}25` }}
                          >
                            <Play size={8} />리서치 시작
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
