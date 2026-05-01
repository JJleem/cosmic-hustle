"use client";

import { useState } from "react";
import { MessageCircle, Terminal, CheckSquare, Square } from "lucide-react";
import { AgentDef } from "@/lib/agents";
import ChatPanel from "./ChatPanel";

type Tab = "checklist" | "terminal";

const DEPLOY_CHECKS = [
  { id: "env",     label: "환경변수 확인",         desc: ".env.production 체크" },
  { id: "build",   label: "빌드 테스트",           desc: "npm run build 통과 확인" },
  { id: "test",    label: "테스트 통과",           desc: "유닛·통합 테스트 all green" },
  { id: "review",  label: "코드 리뷰 완료",        desc: "PR approval 2명 이상" },
  { id: "backup",  label: "DB 백업",              desc: "배포 전 스냅샷 생성" },
  { id: "canary",  label: "카나리 배포",           desc: "10% 트래픽 먼저 전환" },
  { id: "monitor", label: "모니터링 알림 확인",    desc: "에러율·레이턴시 정상" },
  { id: "rollback",label: "롤백 플랜 준비",        desc: "이전 버전 태그 확인" },
];

export default function RootWorkspace({ agent }: { agent: AgentDef }) {
  const [tab, setTab] = useState<Tab>("checklist");
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const toggleCheck = (id: string) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const progress = Math.round((checked.size / DEPLOY_CHECKS.length) * 100);
  const allDone = checked.size === DEPLOY_CHECKS.length;

  const TABS = [
    { id: "checklist" as Tab, label: "배포 체크리스트", icon: CheckSquare },
    { id: "terminal"  as Tab, label: "터미널 채팅",     icon: Terminal },
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
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === "terminal" && <ChatPanel agent={agent} mono={true} />}

        {tab === "checklist" && (
          <div className="h-full overflow-y-auto px-6 py-5 scrollbar-hide">
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[9px] text-slate-600 tracking-widest uppercase font-bold">배포 체크리스트</p>
                <span className="text-[10px] font-bold" style={{ color: allDone ? agent.color : "#475569" }}>
                  {checked.size}/{DEPLOY_CHECKS.length}
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${progress}%`, background: allDone ? agent.color : `linear-gradient(90deg, ${agent.color}80, ${agent.color})` }} />
              </div>
              {allDone && (
                <p className="text-xs mt-2 text-center animate-fadeIn" style={{ color: agent.color }}>
                  수동 배포는 범죄예요. 자동화 시스템으로 갑니다. 🚀
                </p>
              )}
            </div>

            <div className="space-y-2">
              {DEPLOY_CHECKS.map(item => {
                const isChecked = checked.has(item.id);
                return (
                  <button key={item.id} onClick={() => toggleCheck(item.id)}
                    className="w-full flex items-start gap-3 px-4 py-3.5 rounded-2xl text-left transition-all"
                    style={{
                      background: isChecked ? `${agent.color}08` : "rgba(255,255,255,0.02)",
                      border: `1px solid ${isChecked ? agent.color + "30" : "rgba(255,255,255,0.05)"}`,
                    }}
                  >
                    {isChecked
                      ? <CheckSquare size={14} style={{ color: agent.color, flexShrink: 0, marginTop: 1 }} />
                      : <Square size={14} className="text-slate-700 shrink-0 mt-0.5" />
                    }
                    <div>
                      <p className="text-xs font-medium" style={{ color: isChecked ? agent.color : "#94a3b8" }}>{item.label}</p>
                      <p className="text-[10px] text-slate-600 mt-0.5">{item.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            <button onClick={() => setChecked(new Set())}
              className="mt-4 w-full text-xs text-slate-700 hover:text-slate-500 transition-colors py-2">
              초기화
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
