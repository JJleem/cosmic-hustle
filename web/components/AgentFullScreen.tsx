"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { X, BookOpen, FileInput, Users, MessageCircle, ChevronDown, ChevronUp } from "lucide-react";
import { AgentDef, AGENTS, DEPT_MAP, AgentStatus } from "@/lib/agents";
import { AllAgentSettings } from "@/lib/agentSettings";
import { Idea } from "@/components/AgentWorkspace";
import WikiViewer from "./dashboard/WikiViewer";
import WikiIngest from "./dashboard/WikiIngest";
import ChatPanel from "./workspaces/ChatPanel";
import PlanWorkspace from "./workspaces/PlanWorkspace";
import OverWorkspace from "./workspaces/OverWorkspace";
import PixelWorkspace from "./workspaces/PixelWorkspace";
import PingWorkspace from "./workspaces/PingWorkspace";
import FactWorkspace from "./workspaces/FactWorkspace";
import RootWorkspace from "./workspaces/RootWorkspace";
import BuzzWorkspace from "./workspaces/BuzzWorkspace";
import PockeWorkspace from "./workspaces/PockeWorkspace";
import React from "react";

// ── 인사팀 패널 ───────────────────────────────────────
function HRPanel({ agentSettings }: { agentSettings: AllAgentSettings }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div className="h-full overflow-y-auto px-6 py-5 space-y-2.5 scrollbar-hide">
      <p className="text-[9px] text-slate-600 tracking-widest uppercase font-bold mb-4">직원 명단 · {AGENTS.length}명</p>
      {AGENTS.map(agent => {
        const dept = DEPT_MAP[agent.departmentId];
        const settings = agentSettings[agent.id];
        const isExp = expanded === agent.id;
        return (
          <div key={agent.id}
            className="rounded-2xl border transition-all duration-200 overflow-hidden cursor-pointer"
            style={{ background: isExp ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)", borderColor: isExp ? `${agent.color}25` : "rgba(255,255,255,0.06)" }}
            onClick={() => setExpanded(isExp ? null : agent.id)}
          >
            <div className="flex items-center gap-3 p-3.5">
              <div className="relative w-9 h-9 rounded-full overflow-hidden shrink-0" style={{ outline: `1.5px solid ${agent.color}50`, outlineOffset: 1 }}>
                <Image src={agent.image} alt={agent.name} fill className="object-cover" sizes="36px" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">{agent.name}</span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: `${agent.color}15`, color: agent.color }}>{agent.title}</span>
                </div>
                <p className="text-[10px] text-slate-600 truncate mt-0.5">{agent.role}</p>
              </div>
              {dept && <span className="text-[9px] text-slate-700 shrink-0">{dept.label}</span>}
              {isExp ? <ChevronUp size={12} className="text-slate-600 shrink-0" /> : <ChevronDown size={12} className="text-slate-600 shrink-0" />}
            </div>
            {isExp && (
              <div className="px-4 pb-4 space-y-3" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <div className="pt-3 space-y-3">
                  <div>
                    <p className="text-[9px] text-slate-600 tracking-widest uppercase mb-1.5">성격 · 약점</p>
                    <p className="text-xs text-slate-400 leading-relaxed">{agent.personality}</p>
                    <p className="text-xs text-slate-600 leading-relaxed mt-1">{agent.weakness}</p>
                  </div>
                  {settings?.instruction && (
                    <div>
                      <p className="text-[9px] text-slate-600 tracking-widest uppercase mb-1.5">커스텀 지시사항</p>
                      <p className="text-xs text-slate-400 rounded-xl px-3 py-2 leading-relaxed" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>{settings.instruction}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-[9px] text-slate-600 tracking-widest uppercase mb-1.5">담당 업무</p>
                    <ul className="space-y-1">
                      {agent.responsibilities.map(r => (
                        <li key={r} className="flex items-start gap-2 text-xs text-slate-500">
                          <span className="w-1 h-1 rounded-full mt-1.5 shrink-0" style={{ background: agent.color }} />{r}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── 위키 워크스페이스 ─────────────────────────────────
type WikiTab = "knowledge" | "ingest" | "chat" | "hr";
const WIKI_TABS: Array<{ id: WikiTab; label: string; icon: React.ElementType }> = [
  { id: "knowledge", label: "지식베이스", icon: BookOpen },
  { id: "ingest",    label: "인제스트",   icon: FileInput },
  { id: "chat",      label: "채팅",       icon: MessageCircle },
  { id: "hr",        label: "인사팀",     icon: Users },
];

function WikiWorkspace({ agent, agentSettings }: { agent: AgentDef; agentSettings: AllAgentSettings }) {
  const [tab, setTab] = useState<WikiTab>("knowledge");
  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center gap-1 px-5 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        {WIKI_TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
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
        {tab === "knowledge" && <div className="p-5 h-full overflow-hidden"><WikiViewer /></div>}
        {tab === "ingest"    && <div className="p-5 h-full overflow-y-auto scrollbar-hide"><WikiIngest /></div>}
        {tab === "chat"      && <ChatPanel agent={agent} />}
        {tab === "hr"        && <HRPanel agentSettings={agentSettings} />}
      </div>
    </div>
  );
}

// ── 워크스페이스 라우터 ───────────────────────────────
function WorkspaceRouter({
  agent, agentSettings, pingIdeas, onNewProject, onStartProject,
}: {
  agent: AgentDef;
  agentSettings: AllAgentSettings;
  pingIdeas: Idea[];
  onNewProject?: () => void;
  onStartProject?: (topic: string) => void;
}) {
  switch (agent.id) {
    case "wiki":  return <WikiWorkspace agent={agent} agentSettings={agentSettings} />;
    case "plan":  return <PlanWorkspace agent={agent} onNewProject={onNewProject} />;
    case "over":  return <OverWorkspace agent={agent} />;
    case "pixel": return <PixelWorkspace agent={agent} />;
    case "ping":  return <PingWorkspace agent={agent} pingIdeas={pingIdeas} onStartProject={onStartProject} />;
    case "fact":  return <FactWorkspace agent={agent} />;
    case "root":  return <RootWorkspace agent={agent} />;
    case "buzz":  return <BuzzWorkspace agent={agent} />;
    case "run":   return <ChatPanel agent={agent} mono={true} />;
    case "ka":    return <ChatPanel agent={agent} />;
    case "pocke": return <PockeWorkspace agent={agent} />;
    default:      return <ChatPanel agent={agent} />;
  }
}

// ── 메인 컴포넌트 ─────────────────────────────────────
type Props = {
  agent: AgentDef;
  agentStatus: AgentStatus;
  lastMessage: string;
  agentSettings: AllAgentSettings;
  pingIdeas: Idea[];
  onNewProject?: () => void;
  onStartProject?: (topic: string) => void;
  onClose: () => void;
};

export default function AgentFullScreen({ agent, agentStatus, lastMessage, agentSettings, pingIdeas, onNewProject, onStartProject, onClose }: Props) {
  const dept = DEPT_MAP[agent.departmentId];
  const isActive = agentStatus === "active";

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const statusLabel: Record<AgentStatus, string> = {
    active: "작업 중", done: "완료", waiting: "대기 중", idle: "유휴", disabled: "비활성",
  };

  return (
    <div className="fixed inset-0 z-50 cosmic-bg flex flex-col animate-fadeIn">
      {/* ── 헤더 */}
      <header className="shrink-0 flex items-center gap-4 px-8 py-4"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(7,9,26,0.85)" }}
      >
        <div className="relative">
          {isActive && <div className="absolute inset-0 rounded-full animate-ping" style={{ background: agent.glow, transform: "scale(1.5)", opacity: 0.25 }} />}
          <div className="relative w-10 h-10 rounded-full overflow-hidden" style={{ outline: `2px solid ${agent.color}`, outlineOffset: 2 }}>
            <Image src={agent.image} alt={agent.name} fill className="object-cover" sizes="40px" />
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-sm font-bold" style={{ background: `linear-gradient(90deg, #fff 0%, ${agent.color} 100%)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              {agent.name}
            </h1>
            {dept && (
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${dept.color}12`, color: dept.color, border: `1px solid ${dept.color}25` }}>
                {dept.label}
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-600 mt-0.5">{agent.title} · {agent.role}</p>
        </div>
        {lastMessage && (
          <div className="ml-4 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs max-w-xs" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? "animate-pulse" : ""}`} style={{ background: isActive ? agent.color : "#334155" }} />
            <span className="text-slate-500 truncate">{lastMessage}</span>
          </div>
        )}
        <button onClick={onClose} className="ml-auto flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs text-slate-600 hover:text-slate-300 transition-all"
          style={{ border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <X size={11} />닫기 (ESC)
        </button>
      </header>

      {/* ── 바디 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 프로필 사이드바 */}
        <aside className="w-60 shrink-0 flex flex-col gap-4 p-5 overflow-y-auto scrollbar-hide"
          style={{ borderRight: "1px solid rgba(255,255,255,0.05)" }}
        >
          <div className="flex flex-col items-center gap-3 pt-2">
            <div className="relative rounded-full overflow-hidden"
              style={{ width: 88, height: 88, outline: `2px solid ${agent.color}`, outlineOffset: 4, boxShadow: `0 0 28px 6px ${agent.glow}` }}
            >
              <Image src={agent.image} alt={agent.name} fill className="object-cover" sizes="88px" />
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-white">{agent.name}</p>
              <p className="text-[10px] text-slate-600 mt-0.5">{agent.title}</p>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px]" style={{
              background: isActive ? `${agent.color}10` : "rgba(255,255,255,0.03)",
              border: `1px solid ${isActive ? agent.color + "30" : "rgba(255,255,255,0.06)"}`,
              color: isActive ? agent.color : "#475569",
            }}>
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? "animate-pulse" : ""}`} style={{ background: isActive ? agent.color : "#334155" }} />
              {statusLabel[agentStatus]}
            </div>
          </div>

          {[
            { label: "행성", content: agent.planet },
            { label: "성격", content: agent.personality },
            { label: "약점", content: agent.weakness },
          ].map(({ label, content }) => (
            <div key={label} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <p className="text-[9px] text-slate-700 tracking-widest uppercase mb-1.5">{label}</p>
              <p className="text-xs text-slate-400 leading-relaxed">{content}</p>
            </div>
          ))}

          <div>
            <p className="text-[9px] text-slate-700 tracking-widest uppercase mb-2">담당 업무</p>
            <ul className="space-y-1.5">
              {agent.responsibilities.map(r => (
                <li key={r} className="flex items-start gap-2 text-xs text-slate-500 leading-relaxed">
                  <span className="w-1 h-1 rounded-full mt-1.5 shrink-0" style={{ background: agent.color }} />{r}
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* 메인 */}
        <main className="flex-1 overflow-hidden" style={{ background: "rgba(255,255,255,0.01)" }}>
          <WorkspaceRouter
            agent={agent}
            agentSettings={agentSettings}
            pingIdeas={pingIdeas}
            onNewProject={onNewProject}
            onStartProject={onStartProject}
          />
        </main>
      </div>
    </div>
  );
}
