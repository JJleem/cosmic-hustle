"use client";

import { useState } from "react";
import { AGENTS } from "@/lib/agents";
import { CheckCircle2 } from "lucide-react";

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

const AGENT_TAGLINES: Record<string, { checkin: string; clarify: string }> = {
  plan:  { checkin: "방향 잡았습니다. CEO님 승인 부탁드려요.",        clarify: "시작 전에 몇 가지 확인하고 싶어요." },
  wiki:  { checkin: "관련 지식 정리했어요. 이 맥락으로 가면 될까요?", clarify: "배경 지식 파악을 위해 여쭤볼게요." },
  pocke: { checkin: "볼따구에 정보 쑤셔넣었어요! 확인해주세요.",       clarify: "리서치 전에 범위를 정해야 해요." },
  ka:    { checkin: "찾았다! 분석 결과 공유드려요.",                   clarify: "분석 방향 잡기 전에 확인할게요." },
  over:  { checkin: "초안 완성했어요. 감동적이죠? (셀프 감동)",        clarify: "글 쓰기 전에 톤앤매너 확인할게요." },
  run:   { checkin: "이미 짰어요. 확인만 하시면 됩니다.",              clarify: "구현 전에 스펙 확인할게요." },
  pixel: { checkin: "여백이 완벽해요. 디자인 초안 보고해요.",          clarify: "디자인 전에 레퍼런스 확인할게요." },
  buzz:  { checkin: "바이럴 각이에요! 전략 보고드립니다.",             clarify: "마케팅 방향 잡기 전에 확인할게요." },
  fact:  { checkin: "무표정으로 검토했습니다. 수정사항 있어요.",        clarify: "검토 기준 확인할게요." },
  root:  { checkin: "배포 계획 수립했어요. 수동 배포는 범죄니까요.",    clarify: "배포 환경 확인할게요." },
  ping:  { checkin: "안테나에서 스파크가 튀었어요! 아이디어예요.",      clarify: "방향 확인하고 아이디어 모을게요." },
};

const CONTENT_LABEL: Record<string, string> = {
  plan:  "기획 방향",
  wiki:  "배경 지식",
  pocke: "수집된 데이터",
  ka:    "분석 결과",
  over:  "작성된 초안",
  run:   "구현 내용",
  pixel: "디자인 초안",
  buzz:  "마케팅 전략",
  fact:  "검토 결과",
  root:  "배포 계획",
  ping:  "아이디어 목록",
};

export default function CeoCheckin({ state, onRespond, onCancel }: Props) {
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const agent = AGENTS.find((a) => a.id === state.agentId);
  const taglines = AGENT_TAGLINES[state.agentId];
  const contentLabel = CONTENT_LABEL[state.agentId] ?? "작업 내용";

  const submit = (response: string) => {
    setSubmitted(true);
    setTimeout(() => {
      onRespond(state.sessionId, response);
      setAnswer("");
    }, 800);
  };

  return (
    <div
      className="fixed bottom-6 right-6 z-[70] w-[480px]"
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
              <span className="ml-1.5 text-[9px] font-normal text-slate-600">{agent?.role}</span>
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
              {taglines
                ? state.type === "clarify_request" ? taglines.clarify : taglines.checkin
                : state.type === "clarify_request" ? "시작 전 확인 요청" : "체크인 요청"}
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
              >
                중단
              </button>
            )}
          </div>
        </div>

        {/* 내용 */}
        {state.type === "clarify_request" ? (
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
        ) : (
          <>
            <div
              className="rounded-xl px-3 py-2.5 flex flex-col gap-1.5"
              style={{ background: "#0f1928", border: "1px solid #1a2a40" }}
            >
              <p className="text-[9px] text-slate-600 tracking-widest uppercase mb-0.5">{contentLabel}</p>
              <p className="text-[11px] text-slate-400 leading-relaxed mb-1">{state.summary}</p>
              {state.keyFacts.length > 0 && (
                <div className="flex flex-col gap-1.5 max-h-44 overflow-y-auto pr-0.5 border-t border-slate-800 pt-2">
                  {state.keyFacts.map((f, i) => (
                    <div key={i} className="flex gap-2 text-xs text-slate-400 leading-snug">
                      <span className="shrink-0 mt-0.5" style={{ color: agent?.color ?? "#34d399", opacity: 0.6 }}>▸</span>
                      <span className="break-words whitespace-pre-wrap">{f}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* 제출 완료 상태 */}
        {submitted ? (
          <div
            className="flex items-center gap-2.5 rounded-xl px-4 py-3"
            style={{ background: `${agent?.color ?? "#34d399"}10`, border: `1px solid ${agent?.color ?? "#34d399"}30` }}
          >
            <CheckCircle2 size={14} style={{ color: agent?.color ?? "#34d399" }} />
            <p className="text-xs font-medium" style={{ color: agent?.color ?? "#4ade80" }}>
              {answer.trim() ? "지시사항 반영해서 계속할게요." : "네, 이 방향으로 계속할게요."}
            </p>
          </div>
        ) : (
          <>
            {/* CEO 지시사항 입력 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] text-slate-600 tracking-widest uppercase px-0.5">
                CEO 지시사항
                <span className="ml-2 text-slate-700 normal-case tracking-normal">
                  {state.type === "ceo_checkin" ? "· 없으면 바로 승인" : "· ⌘Enter 제출"}
                </span>
              </label>
              <textarea
                autoFocus
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { submit(answer); return; }
                  if (e.key === "Enter" && !e.shiftKey && !answer.trim()) {
                    e.preventDefault();
                    submit("");
                  }
                }}
                placeholder={
                  state.type === "clarify_request"
                    ? "답변을 입력하세요..."
                    : "방향 수정이 필요하면 입력... (Enter = 바로 승인)"
                }
                rows={2}
                className="rounded-xl px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-700 resize-none focus:outline-none transition-all"
                style={{
                  background: "#0c1422",
                  border: answer.trim() ? `1px solid ${agent?.color ?? "#3b82f6"}60` : "1px solid #1e3050",
                }}
              />
            </div>

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
                    className="flex-1 text-xs py-2 rounded-xl border font-semibold transition-all disabled:opacity-25"
                    style={answer.trim()
                      ? { background: `${agent?.color ?? "#3b82f6"}15`, border: `1px solid ${agent?.color ?? "#3b82f6"}50`, color: agent?.color ?? "#93c5fd" }
                      : { borderColor: "#1e2535", color: "#475569" }}
                  >
                    {answer.trim() ? "지시하며 진행 →" : "지시하며 진행"}
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
          </>
        )}
      </div>
    </div>
  );
}
