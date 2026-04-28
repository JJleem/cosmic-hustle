"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { X, Clock, Database, Sparkles, Loader2 } from "lucide-react";
import { AgentDef, AgentStatus } from "@/lib/agents";
import AgentImage from "./AgentImage";

type HistoryItem = {
  sessionId: string;
  topic: string;
  message: string;
  completedAt: number;
};

type Answer = {
  question: string;
  answer: string;
  type: "fact" | "reflect";
};

type Props = {
  agent: AgentDef;
  agentStatus: AgentStatus;
  agentExpression: string | null;
  onClose: () => void;
};

const STATUS_LABEL: Record<AgentStatus, string> = {
  idle:     "대기중",
  active:   "작업중",
  done:     "완료",
  waiting:  "준비중",
  disabled: "비활성",
};

const STATUS_COLOR: Record<AgentStatus, string> = {
  idle:     "#FB923C",
  active:   "#34D399",
  done:     "#93c5fd",
  waiting:  "#475569",
  disabled: "#1e2535",
};

const REFLECT_QUESTIONS = [
  "지금 기분 어때요?",
  "요즘 제일 바쁜 작업은?",
  "앞으로 어떤 일 하고 싶어요?",
];

export default function AgentChatPanel({ agent, agentStatus, agentExpression, onClose }: Props) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [currentAnswer, setCurrentAnswer] = useState<Answer | null>(null);
  const [isAsking, setIsAsking] = useState(false);

  useEffect(() => {
    setHistoryLoading(true);
    setCurrentAnswer(null);
    fetch(`/api/agent/${agent.id}/history`)
      .then((r) => r.json())
      .then((data: { history: HistoryItem[]; totalCount: number }) => {
        setHistory(data.history ?? []);
        setTotalCount(data.totalCount ?? 0);
      })
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [agent.id]);

  const handleFactQuestion = (type: "last_work" | "total_count") => {
    if (type === "last_work") {
      const last = history[0];
      setCurrentAnswer({
        question: "마지막 작업은?",
        answer: last ? `[${last.topic}]\n${last.message}` : "아직 완료된 작업이 없어요.",
        type: "fact",
      });
    } else {
      setCurrentAnswer({
        question: "총 작업 건수는?",
        answer: totalCount === 0 ? "아직 완료된 작업이 없어요." : `총 ${totalCount}건의 작업을 완료했어요.`,
        type: "fact",
      });
    }
  };

  const handleReflectQuestion = async (question: string) => {
    if (isAsking) return;
    setIsAsking(true);
    setCurrentAnswer(null);
    try {
      const res = await fetch(`/api/agent/${agent.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history: history.slice(0, 5) }),
      });
      const data = (await res.json()) as { answer?: string };
      setCurrentAnswer({ question, answer: data.answer ?? "...", type: "reflect" });
    } catch {
      setCurrentAnswer({ question, answer: "지금은 대답하기 어려워요.", type: "reflect" });
    } finally {
      setIsAsking(false);
    }
  };

  const statusColor = STATUS_COLOR[agentStatus] ?? agent.color;

  return (
    <motion.div
      initial={{ x: "100%", opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "100%", opacity: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 32 }}
      className="absolute right-0 top-0 bottom-0 z-40 flex flex-col overflow-hidden"
      style={{
        width: 340,
        background: "#090d1af0",
        borderLeft: `1px solid ${agent.color}30`,
        backdropFilter: "blur(24px)",
      }}
    >
      {/* ── 헤더 ── */}
      <div
        className="shrink-0 flex items-center gap-3 px-4 py-3.5 border-b"
        style={{ borderColor: `${agent.color}20` }}
      >
        <div
          className="relative rounded-full overflow-hidden shrink-0"
          style={{
            width: 48, height: 48,
            outline: `1.5px solid ${agent.color}55`,
            outlineOffset: 2,
            boxShadow: `0 0 14px ${agent.glow}`,
          }}
        >
          <AgentImage
            defaultSrc={agent.image}
            size={48}
            status={agentStatus}
            expression={agentExpression}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold text-white">{agent.name}</span>
            <span className="text-[10px] text-slate-500">{agent.title}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: statusColor, boxShadow: `0 0 5px ${statusColor}` }}
            />
            <span className="text-[10px] font-semibold" style={{ color: statusColor }}>
              {STATUS_LABEL[agentStatus]}
            </span>
            <span className="text-[10px] text-slate-600">·</span>
            <span className="text-[10px]" style={{ color: `${agent.color}99` }}>{agent.role}</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded-full bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700 transition-all shrink-0"
        >
          <X size={12} />
        </button>
      </div>

      {/* ── 최근 작업 ── */}
      <div
        className="shrink-0 px-4 py-3 border-b"
        style={{ borderColor: `${agent.color}15` }}
      >
        <div className="flex items-center gap-1.5 mb-2">
          <Clock size={9} style={{ color: `${agent.color}80` }} />
          <span className="text-[9px] tracking-[0.18em] uppercase font-bold" style={{ color: `${agent.color}70` }}>
            최근 작업
          </span>
          {totalCount > 0 && (
            <span className="ml-auto text-[9px] text-slate-600">{totalCount}건 완료</span>
          )}
        </div>

        {historyLoading ? (
          <div className="flex items-center gap-2 py-1.5">
            <Loader2 size={10} className="animate-spin text-slate-500" />
            <span className="text-[11px] text-slate-500">불러오는 중...</span>
          </div>
        ) : history.length === 0 ? (
          <p className="text-[11px] text-slate-500 py-1">아직 완료된 작업이 없어요.</p>
        ) : (
          <div className="space-y-1.5">
            {history.slice(0, 3).map((item, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded-lg px-2.5 py-2"
                style={{ background: `${agent.color}07`, border: `1px solid ${agent.color}18` }}
              >
                <div
                  className="w-1 h-1 rounded-full mt-1.5 shrink-0"
                  style={{ background: agent.color }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-slate-300 truncate">{item.topic}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">
                    {item.message}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 질문 버튼 ── */}
      <div
        className="shrink-0 px-4 py-3 border-b"
        style={{ borderColor: `${agent.color}15` }}
      >
        <div className="flex items-center gap-1.5 mb-2">
          <Database size={8} className="text-slate-600" />
          <span className="text-[9px] text-slate-600">기록 기반 (무료)</span>
        </div>
        <div className="flex gap-2 mb-3">
          {(["last_work", "total_count"] as const).map((type) => (
            <button
              key={type}
              onClick={() => handleFactQuestion(type)}
              className="flex-1 px-2.5 py-2 rounded-xl text-[11px] font-medium transition-all"
              style={{ background: `${agent.color}0e`, color: `${agent.color}cc`, border: `1px solid ${agent.color}28` }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = `${agent.color}1c`; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = `${agent.color}0e`; }}
            >
              {type === "last_work" ? "마지막 작업은?" : "총 작업 건수는?"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 mb-2">
          <Sparkles size={8} style={{ color: `${agent.color}99` }} />
          <span className="text-[9px] text-slate-600">캐릭터 대화 (AI)</span>
        </div>
        <div className="flex flex-col gap-1.5">
          {REFLECT_QUESTIONS.map((q) => (
            <button
              key={q}
              onClick={() => handleReflectQuestion(q)}
              disabled={isAsking}
              className="w-full text-left px-2.5 py-2 rounded-xl text-[11px] font-medium transition-all disabled:opacity-40"
              style={{ background: `${agent.color}08`, color: `${agent.color}aa`, border: `1px solid ${agent.color}20` }}
              onMouseEnter={(e) => { if (!isAsking) (e.currentTarget as HTMLButtonElement).style.background = `${agent.color}14`; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = `${agent.color}08`; }}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* ── 응답 영역 ── */}
      <div className="flex-1 px-4 py-4 overflow-y-auto">
        {isAsking ? (
          <div className="flex items-center gap-2.5 pt-1">
            <div className="flex gap-0.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{ background: agent.color, animationDelay: `${i * 150}ms` }}
                />
              ))}
            </div>
            <span className="text-xs text-slate-500">생각 중...</span>
          </div>
        ) : currentAnswer ? (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-2"
          >
            <p className="text-[10px] text-slate-500">{currentAnswer.question}</p>
            <div
              className="rounded-2xl px-4 py-3 text-xs leading-relaxed text-slate-200"
              style={{
                background: `${agent.color}0c`,
                border: `1px solid ${agent.color}28`,
              }}
            >
              <pre className="whitespace-pre-wrap font-sans">{currentAnswer.answer}</pre>
            </div>
            {currentAnswer.type === "fact" && (
              <div className="flex items-center gap-1.5 mt-1">
                <Database size={8} className="text-slate-600" />
                <span className="text-[9px] text-slate-600">DB에서 가져온 정보</span>
              </div>
            )}
          </motion.div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-2.5 text-center">
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center text-xl"
              style={{ background: `${agent.color}0e`, border: `1px solid ${agent.color}22` }}
            >
              💬
            </div>
            <p className="text-xs text-slate-500">위 질문을 눌러 대화해보세요</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
