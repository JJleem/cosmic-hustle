"use client";

import { useState } from "react";
import { Send, CheckSquare, AlertCircle, Minus } from "lucide-react";
import { AgentDef } from "@/lib/agents";
import Image from "next/image";

type Verdict = "true" | "false" | "partial" | "pending";
type Check = { id: string; claim: string; verdict: Verdict; reason: string; loading?: boolean };

const VERDICT_STYLE: Record<Verdict, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  true:    { label: "사실",    color: "#34d399", bg: "rgba(52,211,153,0.08)",  icon: CheckSquare },
  false:   { label: "거짓",    color: "#f87171", bg: "rgba(248,113,113,0.08)", icon: AlertCircle },
  partial: { label: "부분적", color: "#fbbf24", bg: "rgba(251,191,36,0.08)",  icon: Minus },
  pending: { label: "확인중", color: "#94a3b8", bg: "rgba(148,163,184,0.08)", icon: Minus },
};

export default function FactWorkspace({ agent }: { agent: AgentDef }) {
  const [input, setInput] = useState("");
  const [checks, setChecks] = useState<Check[]>([]);
  const [loading, setLoading] = useState(false);

  const runCheck = async () => {
    const claim = input.trim();
    if (!claim || loading) return;
    setInput("");
    setLoading(true);
    const id = crypto.randomUUID();
    setChecks(prev => [{ id, claim, verdict: "pending", reason: "", loading: true }, ...prev]);

    try {
      const res = await fetch(`/api/agent/${agent.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: `다음 주장을 팩트체크해줘. 결과를 JSON으로 반환: {"verdict": "true"|"false"|"partial", "reason": "근거 한 문장"}\n\n주장: ${claim}` }),
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

      let verdict: Verdict = "partial";
      let reason = result || "판단 불가";
      try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as { verdict?: string; reason?: string };
          if (parsed.verdict === "true" || parsed.verdict === "false" || parsed.verdict === "partial") {
            verdict = parsed.verdict;
          }
          if (parsed.reason) reason = parsed.reason;
        }
      } catch { /* raw text response */ }

      setChecks(prev => prev.map(c => c.id === id ? { ...c, verdict, reason, loading: false } : c));
    } catch {
      setChecks(prev => prev.map(c => c.id === id ? { ...c, verdict: "partial", reason: "오류가 발생했어요.", loading: false } : c));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-3 scrollbar-hide">
        {checks.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <div className="w-12 h-12 rounded-full overflow-hidden relative" style={{ outline: `1.5px solid ${agent.color}40`, outlineOffset: 2 }}>
              <Image src={agent.image} alt="" fill className="object-cover" sizes="48px" />
            </div>
            <p className="text-sm text-slate-600">주장을 입력하면 팩트체크해드려요</p>
            <p className="text-[11px] text-slate-700">무표정하지만 정확합니다</p>
          </div>
        )}
        {checks.map(check => {
          const style = VERDICT_STYLE[check.verdict];
          const VerdictIcon = style.icon;
          return (
            <div key={check.id} className="rounded-2xl px-4 py-4 transition-all"
              style={{ background: check.loading ? "rgba(255,255,255,0.02)" : style.bg, border: `1px solid ${check.loading ? "rgba(255,255,255,0.05)" : style.color + "30"}` }}
            >
              <p className="text-sm text-slate-200 leading-relaxed mb-3">{check.claim}</p>
              {check.loading ? (
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <div className="w-3 h-3 rounded-full border animate-spin" style={{ borderColor: `${agent.color}30`, borderTopColor: agent.color }} />
                  검토 중...
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 mt-0.5"
                    style={{ background: `${style.color}15`, color: style.color }}>
                    <VerdictIcon size={9} />{style.label}
                  </span>
                  <p className="text-xs text-slate-400 leading-relaxed">{check.reason}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="shrink-0 px-8 py-5" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="flex items-center gap-3 rounded-2xl px-5 py-3.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void runCheck(); } }}
            placeholder="팩트체크할 주장을 입력하세요..."
            disabled={loading}
            className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-700 focus:outline-none"
          />
          <button onClick={() => void runCheck()} disabled={!input.trim() || loading}
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
