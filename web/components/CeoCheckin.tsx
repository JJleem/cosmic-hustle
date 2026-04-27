"use client";

import { useState } from "react";

type ClarifyRequest = {
  type: "clarify_request";
  sessionId: string;
  questions: string[];
};

type CeoCheckin = {
  type: "ceo_checkin";
  sessionId: string;
  summary: string;
  keyFacts: string[];
};

export type CeoCheckinState = ClarifyRequest | CeoCheckin;

type Props = {
  state: CeoCheckinState;
  onRespond: (sessionId: string, response: string) => void;
};

export default function CeoCheckin({ state, onRespond }: Props) {
  const [answer, setAnswer] = useState("");

  const submit = (response: string) => {
    onRespond(state.sessionId, response);
    setAnswer("");
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="w-[420px] rounded-2xl flex flex-col gap-5 p-7"
        style={{
          background: "#090e1a",
          border: "1px solid #1e3050",
          boxShadow: "0 0 60px rgba(99,179,237,0.08)",
        }}
      >
        {state.type === "clarify_request" ? (
          <>
            {/* 의도 확인 */}
            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] tracking-[0.2em] uppercase text-sky-400/60">CEO 확인 필요</p>
              <p className="text-sm font-semibold text-slate-100">
                잠깐, 확인이 필요해요
              </p>
              <p className="text-xs text-slate-500">
                팀이 작업을 시작하기 전에 아래 내용을 명확히 해주세요.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              {state.questions.map((q, i) => (
                <div
                  key={i}
                  className="flex gap-2.5 rounded-xl px-4 py-3 text-xs text-slate-300 leading-relaxed"
                  style={{ background: "#0f1928", border: "1px solid #1a2a40" }}
                >
                  <span style={{ color: "#3b82f6" }}>Q.</span>
                  {q}
                </div>
              ))}
            </div>

            <textarea
              autoFocus
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(answer);
              }}
              placeholder="답변을 입력하세요... (⌘Enter로 제출)"
              rows={3}
              className="rounded-xl px-4 py-3 text-sm text-slate-200 placeholder:text-slate-700 resize-none focus:outline-none"
              style={{
                background: "#0c1422",
                border: "1px solid #1e3050",
              }}
            />

            <div className="flex gap-2">
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
                style={{
                  background: "linear-gradient(135deg, #1e3a5f, #2a4f7c)",
                  border: "1px solid #2a5a9c",
                  color: "#93c5fd",
                }}
              >
                확인 완료
              </button>
            </div>
          </>
        ) : (
          <>
            {/* CEO 중간 체크인 */}
            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] tracking-[0.2em] uppercase text-emerald-400/60">포케 완료 — CEO 확인</p>
              <p className="text-sm font-semibold text-slate-100">
                이 방향으로 분석할까요?
              </p>
              <p className="text-xs text-slate-500">{state.summary}</p>
            </div>

            {state.keyFacts.length > 0 && (
              <div
                className="rounded-xl px-4 py-3 flex flex-col gap-1.5"
                style={{ background: "#0f1928", border: "1px solid #1a2a40" }}
              >
                <p className="text-[10px] text-slate-600 tracking-widest uppercase mb-1">수집된 핵심 팩트</p>
                {state.keyFacts.map((f, i) => (
                  <div key={i} className="flex gap-2 text-xs text-slate-400 leading-snug">
                    <span style={{ color: "#34d399", opacity: 0.6 }}>▸</span>
                    {f}
                  </div>
                ))}
              </div>
            )}

            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(answer);
              }}
              placeholder="방향을 바꾸고 싶다면 여기에 입력... (없으면 그냥 승인)"
              rows={2}
              className="rounded-xl px-4 py-3 text-sm text-slate-200 placeholder:text-slate-700 resize-none focus:outline-none"
              style={{
                background: "#0c1422",
                border: "1px solid #1e3050",
              }}
            />

            <div className="flex gap-2">
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
                style={{
                  background: "linear-gradient(135deg, #0f2d1f, #1a4a2e)",
                  border: "1px solid #1a5c36",
                  color: "#4ade80",
                }}
              >
                이 방향 맞아요 ✓
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
