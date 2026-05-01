"use client";

import { useState } from "react";
import { MessageCircle, Megaphone, TrendingUp, Zap } from "lucide-react";
import { AgentDef } from "@/lib/agents";
import ChatPanel from "./ChatPanel";

type Tab = "templates" | "chat";

const TEMPLATES = [
  {
    id: "launch",
    emoji: "🚀",
    label: "런치 전략",
    desc: "신제품·신서비스 출시 마케팅 플랜",
    prompt: "다음 제품의 런치 전략을 짜줘 (채널별 전술, 런치 시퀀스, KPI 포함):\n\n제품: ",
  },
  {
    id: "viral",
    emoji: "🔥",
    label: "바이럴 콘텐츠",
    desc: "SNS 바이럴 콘텐츠 아이디어",
    prompt: "다음 주제로 바이럴 가능성 높은 콘텐츠 아이디어 5개를 짜줘:\n\n주제: ",
  },
  {
    id: "gtm",
    emoji: "🎯",
    label: "GTM 전략",
    desc: "Go-To-Market 전략 수립",
    prompt: "다음 제품의 GTM 전략을 짜줘 (타겟, 포지셔닝, 채널, 가격):\n\n제품: ",
  },
  {
    id: "copy",
    emoji: "✍️",
    label: "카피라이팅",
    desc: "광고·랜딩페이지 카피 작성",
    prompt: "다음 제품의 광고 카피를 3개 버전으로 작성해줘 (헤드라인 + 서브헤드라인 + CTA):\n\n제품: ",
  },
  {
    id: "growth",
    emoji: "📈",
    label: "그로스 해킹",
    desc: "빠른 사용자 획득 전략",
    prompt: "다음 서비스의 그로스 해킹 전략을 짜줘 (AARRR 프레임워크 기반):\n\n서비스: ",
  },
  {
    id: "brand",
    emoji: "💎",
    label: "브랜드 전략",
    desc: "브랜드 아이덴티티 & 포지셔닝",
    prompt: "다음 브랜드의 아이덴티티 전략을 짜줘 (미션, 가치, 톤앤매너, 경쟁 포지셔닝):\n\n브랜드: ",
  },
];

export default function BuzzWorkspace({ agent }: { agent: AgentDef }) {
  const [tab, setTab] = useState<Tab>("templates");
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null);

  const TABS = [
    { id: "templates" as Tab, label: "마케팅 템플릿", icon: Megaphone },
    { id: "chat"      as Tab, label: "채팅",          icon: MessageCircle },
  ];

  const handleTemplate = (prompt: string) => {
    setSelectedPrompt(prompt);
    setTab("chat");
  };

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center gap-1 px-5 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => { setTab(id); if (id === "templates") setSelectedPrompt(null); }}
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
        {tab === "chat" && <ChatPanel agent={agent} initialInput={selectedPrompt ?? undefined} />}

        {tab === "templates" && (
          <div className="h-full overflow-y-auto px-6 py-5 scrollbar-hide">
            <p className="text-[9px] text-slate-600 tracking-widest uppercase font-bold mb-4">마케팅 템플릿 · {TEMPLATES.length}개</p>
            <div className="grid grid-cols-2 gap-3">
              {TEMPLATES.map(t => (
                <button key={t.id} onClick={() => handleTemplate(t.prompt)}
                  className="group text-left rounded-2xl px-4 py-4 transition-all hover:opacity-80"
                  style={{ background: "rgba(255,255,255,0.02)", border: `1px solid rgba(255,255,255,0.05)` }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-base">{t.emoji}</span>
                    <span className="text-xs font-semibold text-slate-200">{t.label}</span>
                    <TrendingUp size={10} className="ml-auto text-slate-700 group-hover:text-slate-500 transition-colors" />
                  </div>
                  <p className="text-[10px] text-slate-600 leading-relaxed">{t.desc}</p>
                  <div className="flex items-center gap-1 mt-3">
                    <Zap size={9} style={{ color: agent.color }} />
                    <span className="text-[9px]" style={{ color: agent.color }}>바이럴 각</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
