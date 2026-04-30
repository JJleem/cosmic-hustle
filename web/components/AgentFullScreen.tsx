"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { X, Send, BookOpen, FileInput, Users, MessageCircle, ChevronDown, ChevronUp } from "lucide-react";
import { AgentDef, AGENTS, DEPT_MAP, AgentStatus } from "@/lib/agents";
import { AllAgentSettings } from "@/lib/agentSettings";
import WikiViewer from "./dashboard/WikiViewer";
import WikiIngest from "./dashboard/WikiIngest";

// ── 에이전트별 인사 & 퀵액션 ─────────────────────────
const AGENT_CONFIG: Record<string, { greeting: string; actions: Array<{ label: string; prompt: string }> }> = {
  wiki:  { greeting: "원하시는 게 있으세요?",                      actions: [{ label: "지식 요약", prompt: "현재 위키에 어떤 내용이 저장되어 있는지 요약해줘" }] },
  pocke: { greeting: "뭘 찾아드릴까요? 볼따구 비어있어요.",         actions: [{ label: "웹 검색", prompt: "검색해줘: " }] },
  ka:    { greeting: "데이터 있어요? 분석해드릴게요.",               actions: [{ label: "패턴 분석", prompt: "아래 데이터를 분석해줘:\n" }] },
  over:  { greeting: "뭘 써드릴까요... 눈물이 날 것 같은 걸.",      actions: [{ label: "글 써주기", prompt: "아래 내용으로 글을 써줘:\n" }] },
  fact:  { greeting: ".",                                            actions: [{ label: "팩트 체크", prompt: "아래 내용을 팩트체크해줘:\n" }] },
  ping:  { greeting: "오! 번뜩! 뭔가 있어요?",                      actions: [{ label: "아이디어", prompt: "이 주제로 아이디어를 내줘: " }] },
  plan:  { greeting: "어떤 리서치를 원하세요?",                      actions: [{ label: "태스크 분해", prompt: "이 주제를 리서치 태스크로 분해해줘: " }] },
  run:   { greeting: "이미 짰어요. 뭘 만들까요?",                    actions: [{ label: "코드 작성", prompt: "아래 기능을 구현해줘:\n" }] },
  pixel: { greeting: "폰트 고민하고 있었어요. 뭘 만들까요?",         actions: [{ label: "UI 설계", prompt: "아래 화면을 설계해줘:\n" }] },
  buzz:  { greeting: "바이럴 각이에요? 뭘 마케팅할까요?",            actions: [{ label: "전략 수립", prompt: "아래 제품의 마케팅 전략을 짜줘:\n" }] },
  root:  { greeting: "수동 배포는 범죄예요. 뭘 배포할까요?",         actions: [{ label: "배포 계획", prompt: "아래 기능의 배포 계획을 짜줘:\n" }] },
};

type Message = { id: string; role: "agent" | "user"; text: string; loading?: boolean };

// ── 채팅 패널 ─────────────────────────────────────────
function ChatPanel({ agent }: { agent: AgentDef }) {
  const cfg = AGENT_CONFIG[agent.id] ?? { greeting: "무엇을 도와드릴까요?", actions: [] };
  const [messages, setMessages] = useState<Message[]>([{ id: "init", role: "agent", text: cfg.greeting }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const addMsg = (role: "agent" | "user", text: string, isLoading = false) => {
    const id = crypto.randomUUID();
    setMessages(prev => [...prev, { id, role, text, loading: isLoading }]);
    return id;
  };
  const updateMsg = (id: string, text: string) =>
    setMessages(prev => prev.map(m => m.id === id ? { ...m, text, loading: false } : m));

  const send = async (prompt: string) => {
    if (loading) return;
    setLoading(true);
    const lid = addMsg("agent", "...", true);
    try {
      const res = await fetch(`/api/agent/${agent.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: prompt }),
      });
      if (!res.ok || !res.body) throw new Error();
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = ""; let result = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(line.slice(6)) as { type: string; result?: { result?: string } };
            if (ev.type === "complete" && ev.result?.result) result = ev.result.result;
          } catch { /* ignore */ }
        }
      }
      updateMsg(lid, result || "완료했어요.");
    } catch { updateMsg(lid, "오류가 생겼어요."); }
    finally { setLoading(false); }
  };

  const handleSend = () => {
    const t = input.trim(); if (!t || loading) return;
    addMsg("user", t); setInput(""); send(t);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5 scrollbar-hide">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} gap-3`}>
            {msg.role === "agent" && (
              <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 relative mt-0.5" style={{ outline: `1px solid ${agent.color}40`, outlineOffset: 1 }}>
                <Image src={agent.image} alt="" fill className="object-cover" sizes="32px" />
              </div>
            )}
            <div
              className={`max-w-[68%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.loading ? "animate-pulse" : ""}`}
              style={msg.role === "agent"
                ? { background: "rgba(255,255,255,0.04)", border: `1px solid ${agent.color}20`, color: "#cbd5e1" }
                : { background: `${agent.color}14`, border: `1px solid ${agent.color}28`, color: "#f1f5f9" }
              }
            >
              <pre className="whitespace-pre-wrap font-sans">{msg.text}</pre>
            </div>
          </div>
        ))}
        {messages.length === 1 && !loading && cfg.actions.length > 0 && (
          <div className="flex flex-wrap gap-2 pl-11">
            {cfg.actions.map(a => (
              <button key={a.label} onClick={() => setInput(a.prompt)}
                className="text-xs px-4 py-2 rounded-full border transition-all hover:opacity-80"
                style={{ borderColor: `${agent.color}40`, color: agent.color, background: `${agent.color}08` }}
              >{a.label}</button>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 px-8 py-5" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="flex items-center gap-3 rounded-2xl px-5 py-3.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <input
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={`${agent.name}에게 말하기...`} disabled={loading}
            className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-700 focus:outline-none"
          />
          <button onClick={handleSend} disabled={!input.trim() || loading}
            className="w-8 h-8 flex items-center justify-center rounded-full transition-all disabled:opacity-25"
            style={{ background: `${agent.color}20`, border: `1px solid ${agent.color}40` }}
          >
            <Send size={13} style={{ color: agent.color }} />
          </button>
        </div>
      </div>
    </div>
  );
}

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
          <div key={agent.id} className="rounded-2xl border transition-all duration-200 overflow-hidden cursor-pointer"
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
  { id: "knowledge", label: "지식베이스",  icon: BookOpen },
  { id: "ingest",    label: "인제스트",    icon: FileInput },
  { id: "chat",      label: "채팅",        icon: MessageCircle },
  { id: "hr",        label: "인사팀",      icon: Users },
];

import React from "react";

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
              : { color: "#475569", border: "1px solid transparent" }
            }
          >
            <Icon size={11} />{label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        {tab === "knowledge" && <WikiViewer />}
        {tab === "ingest"    && <div className="p-5 h-full overflow-y-auto scrollbar-hide"><WikiIngest /></div>}
        {tab === "chat"      && <ChatPanel agent={agent} />}
        {tab === "hr"        && <HRPanel agentSettings={agentSettings} />}
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────
type Props = {
  agent: AgentDef;
  agentStatus: AgentStatus;
  lastMessage: string;
  agentSettings: AllAgentSettings;
  onClose: () => void;
};

export default function AgentFullScreen({ agent, agentStatus, lastMessage, agentSettings, onClose }: Props) {
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
      {/* ── 헤더 ──────────────────────────────── */}
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

      {/* ── 바디 ──────────────────────────────── */}
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
          {agent.id === "wiki"
            ? <WikiWorkspace agent={agent} agentSettings={agentSettings} />
            : <ChatPanel agent={agent} />
          }
        </main>
      </div>
    </div>
  );
}
