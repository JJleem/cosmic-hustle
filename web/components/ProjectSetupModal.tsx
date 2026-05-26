"use client";

import { useState, useRef, useEffect } from "react";
import { AGENT_MAP } from "@/lib/agents";
import { AllAgentSettings } from "@/lib/agentSettings";
import { TASK_TYPES } from "@/lib/taskTypes";
import { ReportStyle } from "@/lib/types";
import AgentImage from "./AgentImage";

export type { ReportStyle };

export type AgentConfig = {
  agentId: string;
  enabled: boolean;
  basePrompt?: string;
  instruction: string;
  maxTurns?: number;
};

export type ProjectMode = "background" | "checkin" | "full";

export type ProjectConfig = {
  topic: string;
  taskTypeId: string;
  agentConfigs: AgentConfig[];
  mode: ProjectMode;
  reportStyle?: ReportStyle;
  mock?: boolean;
};

type Props = {
  onStart: (config: ProjectConfig) => void;
  onClose: () => void;
  defaultSettings?: AllAgentSettings;
  initialTopic?: string;
};

const ORDERED_AGENTS = ["plan", "wiki", "pocke", "ka", "run", "over", "pixel", "buzz", "fact", "root", "ping"];

function initConfigs(taskTypeId: string, defaultSettings?: AllAgentSettings): AgentConfig[] {
  const activeIds =
    taskTypeId === "auto"
      ? new Set(ORDERED_AGENTS)
      : new Set(TASK_TYPES.find((t) => t.id === taskTypeId)?.defaultAgents ?? ORDERED_AGENTS);
  return ORDERED_AGENTS.map((id) => ({
    agentId: id,
    enabled: activeIds.has(id),
    basePrompt: defaultSettings?.[id]?.basePrompt,
    instruction: defaultSettings?.[id]?.instruction ?? "",
    maxTurns: defaultSettings?.[id]?.maxTurns,
  }));
}

const TASK_WRITER: Record<string, string> = {
  research: "over", blog: "over", tech: "over", dev_plan: "over", dev_spec: "over",
  marketing: "buzz", design_ux: "pixel", design_ui: "pixel", dev: "run",
};

const PERSONALITY_DEFAULT: Record<string, "neutral" | "expressive"> = {
  research: "neutral", tech: "neutral", dev: "neutral", dev_plan: "neutral", dev_spec: "neutral",
  blog: "expressive", marketing: "expressive", design_ux: "expressive", design_ui: "expressive",
};

type Question = {
  key: "tone" | "length" | "writerPersonality" | "primaryColor";
  text: string;
  choices?: { label: string; value: string }[];
  inputType?: "text";
  inputPlaceholder?: string;
  optional?: boolean;
};

const WRITER_QUESTIONS: Record<string, Question[]> = {
  over: [
    { key: "tone", text: "말투는요?", choices: [{ label: "공식적으로", value: "formal" }, { label: "편하게", value: "casual" }, { label: "분석적으로", value: "analytical" }] },
    { key: "length", text: "분량은요?", choices: [{ label: "짧게", value: "brief" }, { label: "보통", value: "standard" }, { label: "길게", value: "detailed" }] },
  ],
  buzz: [
    { key: "tone", text: "어떤 톤으로 갈까요?", choices: [{ label: "임팩트있게", value: "formal" }, { label: "친근하게", value: "casual" }] },
    { key: "length", text: "분량은요?", choices: [{ label: "간결하게", value: "brief" }, { label: "상세하게", value: "standard" }] },
  ],
  pixel: [
    { key: "tone", text: "컬러 계열은요?", choices: [{ label: "다크모드", value: "dark" }, { label: "라이트", value: "light" }, { label: "컬러풀", value: "colorful" }] },
    { key: "length", text: "레이아웃 방향은?", choices: [{ label: "랜딩페이지", value: "landing" }, { label: "대시보드", value: "dashboard" }, { label: "폼·카드형", value: "card" }] },
    { key: "primaryColor", text: "Primary color 있어요?", inputType: "text", inputPlaceholder: "#6366F1 또는 퍼플 (없으면 건너뛰기)", optional: true },
  ],
  run: [
    { key: "length", text: "얼마나 상세하게?", choices: [{ label: "개요만", value: "brief" }, { label: "상세히", value: "detailed" }] },
  ],
};

const MODE_CHOICES = [
  { label: "⚡ 백그라운드", value: "background", desc: "결과만" },
  { label: "✋ 체크인", value: "checkin", desc: "중간 개입" },
  { label: "👁 풀 모니터링", value: "full", desc: "실시간" },
];

type ChatMsg = {
  id: string;
  from: "ceo" | string;
  text: string;
  choices?: { label: string; value: string; desc?: string }[];
  choiceKey?: string;
  inputType?: "text";
  inputPlaceholder?: string;
  optional?: boolean;
  answered?: boolean;
};

function detectTaskType(text: string): string {
  const t = text.toLowerCase();
  if (/블로그|포스팅|포스트/.test(t)) return "blog";
  if (/마케팅|광고|캠페인|바이럴/.test(t)) return "marketing";
  if (/ui디자인|화면디자인|인터페이스/.test(t)) return "design_ui";
  if (/ux|사용자.*(경험|리서치)|유저리서치/.test(t)) return "design_ux";
  if (/개발|코드|구현|만들어줘/.test(t)) return "dev";
  if (/기획서/.test(t)) return "dev_plan";
  if (/명세|스펙/.test(t)) return "dev_spec";
  if (/기술|tech|스택|아키텍처/.test(t)) return "tech";
  return "research";
}

export default function ProjectSetupModal({ onStart, onClose, defaultSettings, initialTopic = "" }: Props) {
  const [topic, setTopic] = useState(initialTopic);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [phase, setPhase] = useState<"input" | "chat" | "ready">("input");
  const [textInput, setTextInput] = useState("");

  const taskTypeRef = useRef("research");
  const modeRef = useRef<ProjectMode>("full");
  const styleRef = useRef<ReportStyle>({ length: "standard", tone: "formal", writerPersonality: undefined });
  const writerQIndexRef = useRef(0);
  const writerIdRef = useRef("over");

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  function addMsg(msg: Omit<ChatMsg, "id">) {
    setMsgs((prev) => [...prev, { ...msg, id: Math.random().toString(36).slice(2) }]);
  }

  function agentSay(
    agentId: string,
    text: string,
    choices?: ChatMsg["choices"],
    choiceKey?: string,
    inputType?: "text",
    inputPlaceholder?: string,
    optional?: boolean,
  ) {
    setActiveAgent(agentId);
    addMsg({ from: agentId, text, choices, choiceKey, inputType, inputPlaceholder, optional });
  }

  function advanceWriterQ(value: string) {
    const qs = buildWriterQuestions(writerIdRef.current, taskTypeRef.current);
    const currentQ = qs[writerQIndexRef.current];
    if (currentQ) styleRef.current = { ...styleRef.current, [currentQ.key]: value };
    writerQIndexRef.current += 1;
    if (writerQIndexRef.current < qs.length) {
      const nextQ = qs[writerQIndexRef.current];
      setTimeout(() => agentSay(writerIdRef.current, nextQ.text, nextQ.choices, "writer_q", nextQ.inputType, nextQ.inputPlaceholder, nextQ.optional), 400);
    } else {
      proceedToMode();
    }
  }

  function handleTextSubmit(msg: ChatMsg, value: string) {
    setMsgs((prev) => prev.map((m) => m.id === msg.id ? { ...m, answered: true } : m));
    setActiveAgent(null);
    setTextInput("");
    addMsg({ from: "ceo", text: value || "건너뛰기" });
    advanceWriterQ(value);
  }

  function buildWriterQuestions(writerId: string, taskTypeId: string): Question[] {
    const base = WRITER_QUESTIONS[writerId] ?? [];
    if (writerId === "pixel") return base;
    const defaultPersonality = PERSONALITY_DEFAULT[taskTypeId] ?? "neutral";
    const personalityQ: Question = {
      key: "writerPersonality",
      text: `작성 스타일은요? (기본: ${defaultPersonality === "neutral" ? "공식체" : "감성체"})`,
      choices: [
        { label: "공식체", value: "neutral" },
        { label: "감성체", value: "expressive" },
      ],
    };
    return [...base, personalityQ];
  }

  function proceedToWriter() {
    const writerId = TASK_WRITER[taskTypeRef.current] ?? "over";
    writerIdRef.current = writerId;
    writerQIndexRef.current = 0;
    const qs = buildWriterQuestions(writerId, taskTypeRef.current);
    if (qs.length === 0) { proceedToMode(); return; }
    const q = qs[0];
    setTimeout(() => agentSay(writerId, q.text, q.choices, "writer_q", q.inputType, q.inputPlaceholder, q.optional), 500);
  }

  function proceedToMode() {
    setTimeout(() => agentSay("plan", "진행 방식은요?", MODE_CHOICES, "mode"), 500);
  }

  function handleTopicSubmit() {
    const t = topic.trim();
    if (!t) return;
    setPhase("chat");
    addMsg({ from: "ceo", text: t });
    const detected = detectTaskType(t);
    taskTypeRef.current = detected;
    const taskInfo = TASK_TYPES.find((tt) => tt.id === detected);
    setTimeout(() => {
      agentSay(
        "plan",
        `${taskInfo?.emoji ?? "🔬"} ${taskInfo?.name ?? "리서치"} 방향으로 가면 될까요?\n${taskInfo?.description ?? ""}`,
        [{ label: "맞아요 ✓", value: "confirm" }, { label: "바꿀게요", value: "change" }],
        "plan_confirm",
      );
    }, 700);
  }

  function handleChoice(msg: ChatMsg, choice: { label: string; value: string }) {
    setMsgs((prev) => prev.map((m) => m.id === msg.id ? { ...m, answered: true } : m));
    setActiveAgent(null);
    addMsg({ from: "ceo", text: choice.label });

    if (msg.choiceKey === "plan_confirm") {
      if (choice.value === "change") {
        setTimeout(() => {
          agentSay(
            "plan",
            "어떤 방향으로 할까요?",
            TASK_TYPES.map((t) => ({ label: `${t.emoji} ${t.name}`, value: t.id })),
            "task_select",
          );
        }, 400);
      } else {
        proceedToWriter();
      }
    } else if (msg.choiceKey === "task_select") {
      taskTypeRef.current = choice.value;
      proceedToWriter();
    } else if (msg.choiceKey === "writer_q") {
      advanceWriterQ(choice.value);
    } else if (msg.choiceKey === "mode") {
      modeRef.current = choice.value as ProjectMode;
      setTimeout(() => {
        agentSay("plan", "좋아요! 팀 투입할게요.");
        setTimeout(() => setPhase("ready"), 700);
      }, 400);
    }
  }

  function handleStart(mock = false) {
    onStart({
      topic: mock ? (topic.trim() || "Mock 테스트") : topic.trim(),
      taskTypeId: taskTypeRef.current,
      agentConfigs: initConfigs(taskTypeRef.current, defaultSettings),
      mode: modeRef.current,
      reportStyle: styleRef.current,
      mock,
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col overflow-hidden" style={{ background: "#0b0f1e" }}>
      {/* 헤더 */}
      <div className="shrink-0 flex items-center justify-between px-10 pt-7 pb-5 border-b border-slate-800/60">
        <div className="flex items-center gap-2">
          <span>🪐</span>
          <h2 className="text-sm font-bold tracking-[0.2em] text-slate-100">새 프로젝트</h2>
        </div>
        <button
          onClick={onClose}
          className="text-slate-600 hover:text-slate-300 w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-800 text-xs"
        >
          ✕
        </button>
      </div>

      {phase === "input" ? (
        /* 초기 입력 */
        <div className="flex-1 flex flex-col items-center justify-center px-10 gap-5">
          <div className="text-center">
            <p className="text-slate-300 text-sm mb-1">무엇을 도와드릴까요?</p>
            <p className="text-slate-600 text-xs">리서치, 블로그, 마케팅, 개발... 뭐든 말씀해주세요</p>
          </div>
          <div className="w-full max-w-lg">
            <textarea
              ref={inputRef}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleTopicSubmit(); }}
              placeholder="예: 쿠팡 물류 분석해줘, 마케팅 전략 짜줘..."
              rows={3}
              className="w-full resize-none rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-700 outline-none transition-all"
              style={{ background: "#0d1222", border: "1px solid #1e2a40" }}
              onFocus={(e) => { e.target.style.borderColor = "#2a4070"; }}
              onBlur={(e) => { e.target.style.borderColor = "#1e2a40"; }}
            />
            <div className="flex justify-between items-center mt-1.5">
              <button
                onClick={() => handleStart(true)}
                className="text-[11px] px-3 py-1.5 rounded-full transition-all"
                style={{ background: "rgba(16,185,129,0.08)", color: "#6ee7b7", border: "1px solid rgba(16,185,129,0.2)" }}
                title="0토큰 — fixture 데이터로 UI 테스트"
              >
                🧪 Mock
              </button>
              <div className="flex items-center gap-2">
                <p className="text-[9px] text-slate-700">⌘ Enter</p>
                <button
                  onClick={handleTopicSubmit}
                  disabled={!topic.trim()}
                  className="text-xs font-bold px-5 py-2 rounded-full transition-all"
                  style={{
                    background: topic.trim() ? "linear-gradient(135deg, #1e3a5f, #2a4f7c)" : "#1a2235",
                    color: topic.trim() ? "#93c5fd" : "#334155",
                    border: `1px solid ${topic.trim() ? "#2a5a9c" : "#1e2535"}`,
                  }}
                >
                  →
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* 채팅 흐름 */
        <div className="flex-1 flex flex-col overflow-hidden">
          <div
            className="flex-1 overflow-y-auto px-10 py-6 flex flex-col gap-3"
            style={{ scrollbarWidth: "none" }}
          >
            {msgs.map((msg) => {
              if (msg.from === "ceo") {
                return (
                  <div key={msg.id} className="flex justify-end">
                    <div
                      className="max-w-xs px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm text-slate-100"
                      style={{ background: "#1e3a5f", border: "1px solid #2a5a9c30" }}
                    >
                      {msg.text}
                    </div>
                  </div>
                );
              }

              const agent = AGENT_MAP[msg.from];
              if (!agent) return null;
              const isTalking = activeAgent === msg.from && !msg.answered;

              return (
                <div key={msg.id} className="flex items-start gap-3">
                  <div
                    className="shrink-0 rounded-full overflow-hidden"
                    style={{ width: 36, height: 36, outline: `1.5px solid ${agent.color}40`, outlineOffset: 2 }}
                  >
                    <AgentImage
                      defaultSrc={agent.image}
                      size={36}
                      status={isTalking ? "active" : "idle"}
                      expression={null}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 max-w-sm">
                    <span className="text-[10px] font-bold" style={{ color: agent.color }}>
                      {agent.name} {agent.title}
                    </span>
                    <div
                      className="px-4 py-2.5 rounded-2xl rounded-tl-sm text-sm text-slate-200 whitespace-pre-line"
                      style={{ background: "#0d1830", border: `1px solid ${agent.color}20` }}
                    >
                      {msg.text}
                    </div>
                    {msg.choices && !msg.answered && (
                      <div className="flex flex-wrap gap-1.5 mt-0.5">
                        {msg.choices.map((choice, i) => (
                          <button
                            key={i}
                            onClick={() => handleChoice(msg, choice)}
                            className="text-[11px] px-3 py-1.5 rounded-full border transition-all hover:opacity-75 text-left"
                            style={{
                              background: `${agent.color}10`,
                              color: agent.color,
                              border: `1px solid ${agent.color}40`,
                            }}
                          >
                            {choice.label}
                            {choice.desc && (
                              <span className="text-slate-500 ml-1 text-[9px]">{choice.desc}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    {msg.inputType === "text" && !msg.answered && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <input
                          autoFocus
                          value={textInput}
                          onChange={(e) => setTextInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter" && textInput.trim()) handleTextSubmit(msg, textInput.trim()); }}
                          placeholder={msg.inputPlaceholder ?? "입력하세요"}
                          className="flex-1 rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 outline-none"
                          style={{ background: "#0d1222", border: `1px solid ${agent.color}30`, minWidth: 0 }}
                        />
                        <button
                          onClick={() => { if (textInput.trim()) handleTextSubmit(msg, textInput.trim()); }}
                          disabled={!textInput.trim()}
                          className="text-[11px] px-3 py-1.5 rounded-full transition-all"
                          style={{ background: `${agent.color}20`, color: agent.color, border: `1px solid ${agent.color}40`, opacity: textInput.trim() ? 1 : 0.4 }}
                        >확인</button>
                        {msg.optional && (
                          <button
                            onClick={() => handleTextSubmit(msg, "")}
                            className="text-[11px] px-3 py-1.5 rounded-full transition-all text-slate-500 hover:text-slate-400"
                            style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                          >건너뛰기</button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {phase === "ready" && (
            <div className="shrink-0 px-10 py-5 border-t border-slate-800/60 flex items-center justify-between">
              <button
                onClick={() => handleStart(true)}
                className="text-[11px] px-4 py-2 rounded-full transition-all"
                style={{ background: "rgba(16,185,129,0.08)", color: "#6ee7b7", border: "1px solid rgba(16,185,129,0.2)" }}
                title="에이전트 실행 없이 fixture 데이터로 UI만 테스트"
              >
                🧪 Mock 테스트
              </button>
              <button
                onClick={() => handleStart(false)}
                className="text-xs font-bold px-6 py-2.5 rounded-full transition-all"
                style={{ background: "linear-gradient(135deg, #1e3a5f, #2a4f7c)", color: "#93c5fd", border: "1px solid #2a5a9c" }}
              >
                🚀 프로젝트 시작합니다
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
