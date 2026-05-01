"use client";

import { useState, useEffect } from "react";
import { MessageCircle, FolderOpen, LayoutList, Plus, Clock } from "lucide-react";
import { AgentDef } from "@/lib/agents";
import ChatPanel from "./ChatPanel";

type Session = { id: string; topic: string; completedAt: number | null; status: string; createdAt: number };

const TASK_TYPES = [
  { id: "research",   label: "리서치 보고서",  desc: "주제 조사 후 구조화된 리포트",        emoji: "🔬" },
  { id: "blog",       label: "블로그 포스팅",   desc: "SEO 최적화된 블로그 글",              emoji: "✍️" },
  { id: "tech",       label: "기술 리서치",     desc: "기술 스택·아키텍처 분석",             emoji: "⚙️" },
  { id: "marketing",  label: "마케팅 전략",     desc: "GTM·캠페인·채널 전략",               emoji: "📣" },
  { id: "design_ux",  label: "UX 리서치",       desc: "사용자 조사·플로우·와이어프레임",     emoji: "🧩" },
  { id: "design_ui",  label: "UI 디자인",       desc: "HTML·CSS 컴포넌트 직접 생성",        emoji: "🎨" },
  { id: "dev",        label: "개발 구현",       desc: "실제 코드 작성·기능 구현",            emoji: "💻" },
  { id: "dev_plan",   label: "개발 기획서",     desc: "기능 정의·기술 선택·일정",            emoji: "📋" },
  { id: "dev_spec",   label: "기능 명세서",     desc: "API·DB·컴포넌트 스펙",               emoji: "📄" },
];

type Tab = "chat" | "history" | "tasks";

export default function PlanWorkspace({ agent, onNewProject }: { agent: AgentDef; onNewProject?: () => void }) {
  const [tab, setTab] = useState<Tab>("history");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/sessions")
      .then(r => r.json())
      .then((data: Session[]) => setSessions(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const TABS = [
    { id: "history" as Tab, label: "프로젝트 히스토리", icon: FolderOpen },
    { id: "tasks"   as Tab, label: "태스크 타입",        icon: LayoutList },
    { id: "chat"    as Tab, label: "채팅",               icon: MessageCircle },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* 탭 + 새 프로젝트 */}
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
        <button onClick={onNewProject}
          className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all"
          style={{ background: `${agent.color}18`, color: agent.color, border: `1px solid ${agent.color}35` }}
        >
          <Plus size={11} />새 프로젝트
        </button>
      </div>

      <div className="flex-1 overflow-hidden">
        {/* 히스토리 */}
        {tab === "history" && (
          <div className="h-full overflow-y-auto px-6 py-5 space-y-2.5 scrollbar-hide">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: `${agent.color}30`, borderTopColor: agent.color }} />
              </div>
            ) : sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 gap-3">
                <FolderOpen size={32} className="text-slate-700" />
                <p className="text-sm text-slate-600">아직 완료된 프로젝트가 없어요</p>
                <button onClick={onNewProject}
                  className="text-xs px-4 py-2 rounded-xl transition-all"
                  style={{ background: `${agent.color}15`, color: agent.color, border: `1px solid ${agent.color}30` }}
                >
                  첫 프로젝트 시작하기
                </button>
              </div>
            ) : (
              sessions.map((s, i) => (
                <div key={s.id} className="flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all"
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <span className="text-[10px] font-bold text-slate-700 w-5 text-right shrink-0">{sessions.length - i}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 truncate">{s.topic}</p>
                    {s.completedAt && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <Clock size={9} className="text-slate-700" />
                        <span className="text-[10px] text-slate-600">
                          {new Date(s.completedAt * 1000).toLocaleDateString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    )}
                  </div>
                  <span className="shrink-0 text-[9px] px-2 py-0.5 rounded-full"
                    style={{ background: s.status === "done" ? "rgba(52,211,153,0.1)" : "rgba(251,191,36,0.1)", color: s.status === "done" ? "#34d399" : "#fbbf24" }}
                  >
                    {s.status === "done" ? "완료" : "진행중"}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {/* 태스크 타입 */}
        {tab === "tasks" && (
          <div className="h-full overflow-y-auto px-6 py-5 scrollbar-hide">
            <p className="text-[9px] text-slate-600 tracking-widest uppercase font-bold mb-4">지원 태스크 타입 · {TASK_TYPES.length}개</p>
            <div className="grid grid-cols-2 gap-3">
              {TASK_TYPES.map(t => (
                <div key={t.id} className="rounded-2xl px-4 py-3.5 transition-all"
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-base">{t.emoji}</span>
                    <span className="text-xs font-semibold text-slate-200">{t.label}</span>
                  </div>
                  <p className="text-[10px] text-slate-600 leading-relaxed">{t.desc}</p>
                  <span className="text-[9px] font-mono text-slate-700 mt-2 block">{t.id}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 채팅 */}
        {tab === "chat" && <ChatPanel agent={agent} />}
      </div>
    </div>
  );
}
