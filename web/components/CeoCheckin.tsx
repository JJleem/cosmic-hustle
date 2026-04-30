"use client";

import { useState } from "react";
import { AGENTS } from "@/lib/agents";

type ClarifyRequest = {
  type: "clarify_request";
  sessionId: string;
  agentId: string;
  questions: string[];
};

type CeoCheckin = {
  type: "ceo_checkin";
  sessionId: string;
  agentId: string;
  summary: string;
  keyFacts: string[];
};

export type CeoCheckinState = ClarifyRequest | CeoCheckin;

type Props = {
  state: CeoCheckinState;
  onRespond: (sessionId: string, response: string) => void;
  onCancel?: () => void;
};

const CONTENT_LABEL: Record<string, string> = {
  plan:  "기획 내용",
  wiki:  "배경 지식",
  pocke: "수집된 데이터",
  ka:    "분석 결과",
  over:  "작성된 초안",
  run:   "구현 내용",
  pixel: "디자인 초안",
  buzz:  "마케팅 전략",
  fact:  "최종 결과물",
  root:  "배포 계획",
  ping:  "아이디어 목록",
};

export default function CeoCheckin({ state, onRespond, onCancel }: Props) {
  const [answer, setAnswer] = useState("");
  const agent = AGENTS.find((a) => a.id === state.agentId);
  const contentLabel = CONTENT_LABEL[state.agentId] ?? "작업 내용";

  const submit = (response: string) => {
    onRespond(state.sessionId, response);
    setAnswer("");
  };

  return (
    <div
      className="fixed bottom-6 right-6 z-[70] w-[460px]"
      style={{ animation: "slideUp 0.25s ease-out" }}
    >
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div
        className="rounded-2xl flex flex-col gap-4 p-5"
        style={{
          background: "#090e1a",
          border: `1px solid ${agent?.color ?? "#334155"}30`,
          boxShadow: `0 0 40px ${agent?.color ?? "#334155"}12, 0 8px 32px rgba(0,0,0,0.5)`,
        }}
      >
        {/* 에이전트 헤더 */}
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-full overflow-hidden shrink-0"
            style={{ border: `2px solid ${agent?.color ?? "#334155"}50` }}
          >
            {agent?.image ? (
              <img src={agent.image} alt={agent.name} className="w-full h-full object-cover object-top" />
            ) : (
              <div className="w-full h-full" style={{ background: agent?.color ?? "#334155" }} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold" style={{ color: agent?.color ?? "#94a3b8" }}>
              {agent?.name ?? state.agentId}
            </p>
            <p className="text-[10px] text-slate-500 truncate">
              {state.type === "clarify_request" ? "시작 전 확인 요청" : "체크인 요청"}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ background: agent?.color ?? "#94a3b8" }}
            />
            {onCancel && (
              <button
                onClick={onCancel}
                className="text-[10px] text-slate-500 hover:text-red-400 transition-colors px-2 py-1 rounded-lg hover:bg-red-400/10"
                title="프로젝트 중단"
              >
                중단
              </button>
            )}
          </div>
        </div>

        {/* 내용 */}
        {state.type === "clarify_request" ? (
          <>
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-semibold text-slate-100">시작하기 전에 확인할게요.</p>
              <p className="text-xs text-slate-500">팀이 작업을 시작하기 전에 아래 내용을 명확히 해주세요.</p>
            </div>
            <div className="flex flex-col gap-2">
              {state.questions.map((q, i) => (
                <div
                  key={i}
                  className="flex gap-2.5 rounded-xl px-3 py-2.5 text-xs text-slate-300 leading-relaxed"
                  style={{ background: "#0f1928", border: "1px solid #1a2a40" }}
                >
                  <span className="shrink-0" style={{ color: agent?.color ?? "#3b82f6" }}>Q.</span>
                  {q}
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold text-slate-100">이 방향으로 계속할까요?</p>
              <p className="text-xs text-slate-500">{state.summary}</p>
            </div>
            {state.keyFacts.length > 0 && (
              <div
                className="rounded-xl px-3 py-2.5 flex flex-col gap-1.5"
                style={{ background: "#0f1928", border: "1px solid #1a2a40" }}
              >
                <p className="text-[9px] text-slate-600 tracking-widest uppercase mb-0.5 sticky top-0">
                  {contentLabel}
                </p>
                <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto pr-0.5">
                  {state.keyFacts.map((f, i) => (
                    <div key={i} className="flex gap-2 text-xs text-slate-400 leading-snug">
                      <span className="shrink-0 mt-0.5" style={{ color: agent?.color ?? "#34d399", opacity: 0.6 }}>▸</span>
                      <span className="break-words whitespace-pre-wrap">{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* 입력 */}
        <textarea
          autoFocus
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { submit(answer); return; }
            // 빈 입력 상태에서 Enter = 승인 (ceo_checkin) / 그냥 진행 (clarify_request)
            if (e.key === "Enter" && !e.shiftKey && !answer.trim()) {
              e.preventDefault();
              submit("");
            }
          }}
          placeholder={
            state.type === "clarify_request"
              ? "답변 입력... (⌘Enter 제출)"
              : "방향 수정이 필요하면 입력... (없으면 그냥 승인)"
          }
          rows={2}
          className="rounded-xl px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-700 resize-none focus:outline-none"
          style={{ background: "#0c1422", border: "1px solid #1e3050" }}
        />

        {/* 버튼 */}
        <div className="flex gap-2">
          {state.type === "clarify_request" ? (
            <>
              <button
                onClick={() => submit("")}
                className="flex-1 text-xs py-2 rounded-xl border transition-all hover:bg-slate-800"
                style={{ borderColor: "#1e2535", color: "#64748b" }}
              >
                그냥 진행
              </button>
              <button
                onClick={() => submit(answer)}
                disabled={!answer.trim()}
                className="flex-1 text-xs py-2 rounded-xl font-semibold transition-all disabled:opacity-30"
                style={{ background: `${agent?.color ?? "#3b82f6"}20`, border: `1px solid ${agent?.color ?? "#3b82f6"}50`, color: agent?.color ?? "#93c5fd" }}
              >
                확인 완료
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => submit(answer)}
                disabled={!answer.trim()}
                className="flex-1 text-xs py-2 rounded-xl border transition-all hover:bg-slate-800 disabled:opacity-30"
                style={{ borderColor: "#1e2535", color: "#64748b" }}
              >
                방향 수정 후 진행
              </button>
              <button
                onClick={() => submit("")}
                className="flex-1 text-xs py-2 rounded-xl font-semibold transition-all"
                style={{ background: `${agent?.color ?? "#34d399"}20`, border: `1px solid ${agent?.color ?? "#34d399"}50`, color: agent?.color ?? "#4ade80" }}
              >
                이 방향 맞아요 ✓
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
