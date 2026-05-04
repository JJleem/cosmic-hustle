"use client";

import { useState, useRef, useEffect } from "react";
import { Zap, Loader2 } from "lucide-react";
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
};

type Props = {
  onStart: (config: ProjectConfig) => void;
  onClose: () => void;
  defaultSettings?: AllAgentSettings;
  initialTopic?: string;
};

const DEFAULT_ROLES: Record<string, string> = {
  plan:  "의도 파악 + 태스크 정의",
  wiki:  "배경 지식 연결 + 위키 업데이트",
  pocke: "웹 리서치 + 정보 수집",
  ka:    "데이터 분석 + 인사이트 도출",
  run:   "코드 구현 (개발)",
  over:  "리포트 · 문서 작성",
  pixel: "UI/UX 디자인",
  buzz:  "마케팅 전략",
  fact:  "팩트체크 + 품질 검수",
  root:  "배포 계획 (개발)",
  ping:  "아이디어 캡처",
};

const ORDERED_AGENTS = ["plan", "wiki", "pocke", "ka", "run", "over", "pixel", "buzz", "fact", "root", "ping"];

const MODE_OPTIONS: { id: ProjectMode; label: string; desc: string; icon: string }[] = [
  { id: "background", label: "백그라운드", desc: "결과만 받기",   icon: "⚡" },
  { id: "checkin",    label: "체크인",     desc: "2번 개입",     icon: "✋" },
  { id: "full",       label: "풀 모니터링", desc: "실시간 확인", icon: "👁" },
];

const LENGTH_OPTIONS: { id: ReportStyle["length"]; label: string; desc: string }[] = [
  { id: "brief",    label: "간결하게", desc: "~400자" },
  { id: "standard", label: "보통",     desc: "~700자" },
  { id: "detailed", label: "자세하게", desc: "~1200자" },
];

const TONE_OPTIONS: { id: ReportStyle["tone"]; label: string }[] = [
  { id: "formal",     label: "공식적" },
  { id: "casual",     label: "친근하게" },
  { id: "analytical", label: "분석적" },
];

// research 계열 태스크 타입 (리포트 설정 노출 조건)
const REPORT_TASK_TYPES = new Set(["auto", "research", "blog", "marketing", "tech"]);

function initConfigs(taskTypeId: string, defaultSettings?: AllAgentSettings): AgentConfig[] {
  const activeIds = taskTypeId === "auto"
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

export default function ProjectSetupModal({ onStart, onClose, defaultSettings, initialTopic = "" }: Props) {
  const [topic, setTopic] = useState(initialTopic);
  const [selectedTypeId, setSelectedTypeId] = useState("auto");
  const [mode, setMode] = useState<ProjectMode>("full");
  const [configs, setConfigs] = useState<AgentConfig[]>(() => initConfigs("auto", defaultSettings));
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [reportStyle, setReportStyle] = useState<ReportStyle>({ length: "standard", tone: "formal" });
  const topicRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { topicRef.current?.focus(); }, []);

  const handleTypeSelect = (typeId: string) => {
    setSelectedTypeId(typeId);
    const activeIds = typeId === "auto"
      ? new Set(ORDERED_AGENTS)
      : new Set(TASK_TYPES.find((t) => t.id === typeId)?.defaultAgents ?? ORDERED_AGENTS);
    setConfigs((prev) => prev.map((c) => ({ ...c, enabled: activeIds.has(c.agentId) })));
  };

  const toggleAgent = (agentId: string) => {
    setConfigs((prev) => prev.map((c) => (c.agentId === agentId ? { ...c, enabled: !c.enabled } : c)));
  };

  const setInstruction = (agentId: string, instruction: string) => {
    setConfigs((prev) => prev.map((c) => (c.agentId === agentId ? { ...c, instruction } : c)));
  };

  const setMaxTurns = (agentId: string, maxTurns: number) => {
    setConfigs((prev) => prev.map((c) => (c.agentId === agentId ? { ...c, maxTurns } : c)));
  };

  const handleStart = () => {
    const trimmed = topic.trim();
    if (!trimmed) { topicRef.current?.focus(); return; }
    const showReport = REPORT_TASK_TYPES.has(selectedTypeId);
    onStart({
      topic: trimmed,
      taskTypeId: selectedTypeId,
      agentConfigs: configs,
      mode,
      reportStyle: showReport ? reportStyle : undefined,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleStart();
  };

  const fetchSuggestions = async () => {
    if (suggesting) return;
    setSuggesting(true);
    setSuggestions([]);
    try {
      const context = topic.trim() ? `현재 입력된 주제: "${topic}"` : "";
      const res = await fetch("/api/agent/ping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: `리서치할 만한 흥미로운 주제 5개를 추천해줘. ${context}\n\n반드시 JSON 배열로만 응답해: ["주제1", "주제2", "주제3", "주제4", "주제5"]`,
        }),
      });
      if (!res.ok || !res.body) throw new Error();
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let result = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(line.slice(6)) as { type: string; result?: { result?: string } };
            if (ev.type === "complete" && ev.result?.result) result = ev.result.result;
          } catch { /* ignore */ }
        }
      }
      const match = result.match(/\[[\s\S]*?\]/);
      if (match) setSuggestions((JSON.parse(match[0]) as string[]).slice(0, 5));
    } catch {
      setSuggestions([]);
    } finally {
      setSuggesting(false);
    }
  };

  const enabledCount = configs.filter((c) => c.enabled).length;
  const selectedType = TASK_TYPES.find((t) => t.id === selectedTypeId);
  const showReportSettings = REPORT_TASK_TYPES.has(selectedTypeId);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="w-full flex flex-col rounded-3xl overflow-hidden"
        style={{
          background: "#0b0f1e",
          border: "1px solid #1e2a40",
          boxShadow: "0 24px 80px rgba(0,0,0,0.8)",
          maxWidth: 860,
          maxHeight: "92vh",
        }}
      >
        {/* 헤더 */}
        <div className="shrink-0 flex items-center justify-between px-7 pt-6 pb-4 border-b border-slate-800/60">
          <div className="flex items-center gap-2">
            <span className="text-base">🪐</span>
            <h2 className="text-sm font-bold tracking-[0.2em] text-slate-100">새 프로젝트</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-600 hover:text-slate-300 text-xs transition-colors w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-800"
          >
            ✕
          </button>
        </div>

        {/* 2컬럼 본문 */}
        <div className="flex-1 flex overflow-hidden min-h-0">

          {/* 왼쪽: 설정 */}
          <div className="w-[380px] shrink-0 flex flex-col overflow-y-auto px-7 py-5 gap-5 border-r border-slate-800/60" style={{ scrollbarWidth: "none" }}>

            {/* 주제 */}
            <div>
              <label className="text-[10px] text-slate-500 tracking-[0.2em] uppercase font-bold block mb-2">주제</label>
              <textarea
                ref={topicRef}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="어떤 주제를 조사할까요?"
                rows={3}
                className="w-full resize-none rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-700 outline-none transition-all"
                style={{ background: "#0d1222", border: "1px solid #1e2a40" }}
                onFocus={(e) => { e.target.style.borderColor = "#2a4070"; }}
                onBlur={(e) => { e.target.style.borderColor = "#1e2a40"; }}
              />
              <div className="flex items-center justify-between mt-1.5">
                <p className="text-[9px] text-slate-700">⌘ Enter로 바로 시작</p>
                <button
                  type="button"
                  onClick={fetchSuggestions}
                  disabled={suggesting}
                  className="flex items-center gap-1 text-[9px] px-2.5 py-1 rounded-full transition-all disabled:opacity-50"
                  style={{ background: "#fbbf2410", color: "#fbbf24", border: "1px solid #fbbf2430" }}
                >
                  {suggesting ? <Loader2 size={9} className="animate-spin" /> : <Zap size={9} />}
                  {suggesting ? "추천 중..." : "핑이 추천"}
                </button>
              </div>
              {suggestions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setTopic(s)}
                      className="text-[10px] px-3 py-1.5 rounded-full border transition-all text-left"
                      style={{ background: "#0d1222", borderColor: "#fbbf2430", color: "#94a3b8" }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 태스크 타입 */}
            <div>
              <label className="text-[10px] text-slate-500 tracking-[0.2em] uppercase font-bold block mb-2">타입</label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => handleTypeSelect("auto")}
                  className="text-[10px] px-3 py-1.5 rounded-full border transition-all"
                  style={
                    selectedTypeId === "auto"
                      ? { background: "#1e3a5f", color: "#93c5fd", border: "1px solid #2a5a9c" }
                      : { background: "#0d1222", color: "#475569", border: "1px solid #1e2535" }
                  }
                >
                  ✦ 자동 감지
                </button>
                {TASK_TYPES.map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => handleTypeSelect(type.id)}
                    className="text-[10px] px-3 py-1.5 rounded-full border transition-all"
                    style={
                      selectedTypeId === type.id
                        ? { background: `${type.color}20`, color: type.color, border: `1px solid ${type.color}60` }
                        : { background: "#0d1222", color: "#475569", border: "1px solid #1e2535" }
                    }
                  >
                    {type.emoji} {type.name}
                  </button>
                ))}
              </div>
              {selectedType && (
                <p className="text-[9px] mt-2" style={{ color: `${selectedType.color}90` }}>{selectedType.description}</p>
              )}
            </div>

            {/* 리포트 설정 (research 계열만) */}
            {showReportSettings && (
              <div>
                <label className="text-[10px] text-slate-500 tracking-[0.2em] uppercase font-bold block mb-2">리포트 설정</label>
                <div className="rounded-2xl p-4 flex flex-col gap-4" style={{ background: "#0d1222", border: "1px solid #1e2a40" }}>
                  {/* 분량 */}
                  <div>
                    <p className="text-[9px] text-slate-600 mb-2">분량</p>
                    <div className="flex gap-1.5">
                      {LENGTH_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setReportStyle((prev) => ({ ...prev, length: opt.id }))}
                          className="flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl border text-center transition-all"
                          style={
                            reportStyle.length === opt.id
                              ? { background: "#1e3a5f", borderColor: "#2a5a9c", color: "#93c5fd" }
                              : { background: "#0a0f1a", borderColor: "#1e2535", color: "#475569" }
                          }
                        >
                          <span className="text-[10px] font-bold">{opt.label}</span>
                          <span className="text-[8px] opacity-60">{opt.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* 문체 */}
                  <div>
                    <p className="text-[9px] text-slate-600 mb-2">문체</p>
                    <div className="flex gap-1.5">
                      {TONE_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setReportStyle((prev) => ({ ...prev, tone: opt.id }))}
                          className="flex-1 py-2 rounded-xl border text-[10px] font-bold transition-all"
                          style={
                            reportStyle.tone === opt.id
                              ? { background: "#1e3a5f", borderColor: "#2a5a9c", color: "#93c5fd" }
                              : { background: "#0a0f1a", borderColor: "#1e2535", color: "#475569" }
                          }
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 진행 모드 */}
            <div>
              <label className="text-[10px] text-slate-500 tracking-[0.2em] uppercase font-bold block mb-2">진행 모드</label>
              <div className="grid grid-cols-3 gap-2">
                {MODE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setMode(opt.id)}
                    className="flex flex-col items-center gap-1 px-2 py-3 rounded-2xl border transition-all"
                    style={
                      mode === opt.id
                        ? { background: "#1e3a5f", borderColor: "#2a5a9c", color: "#93c5fd" }
                        : { background: "#0d1222", borderColor: "#1e2535", color: "#475569" }
                    }
                  >
                    <span className="text-base leading-none">{opt.icon}</span>
                    <span className="text-[10px] font-bold">{opt.label}</span>
                    <span className="text-[8px] opacity-70">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 오른쪽: 파이프라인 */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-800/40">
              <span className="text-[10px] text-slate-500 tracking-[0.2em] uppercase font-bold">파이프라인</span>
              <span className="text-[9px] text-slate-700">{enabledCount}명 참여</span>
            </div>

            <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
              {configs.map((cfg, idx) => {
                const agent = AGENT_MAP[cfg.agentId];
                if (!agent) return null;
                const isExpanded = expandedId === cfg.agentId;
                const hasInstruction = cfg.instruction.trim().length > 0;

                return (
                  <div
                    key={cfg.agentId}
                    style={{
                      borderTop: idx === 0 ? "none" : "1px solid #1a2235",
                      background: cfg.enabled ? `${agent.color}05` : "transparent",
                      opacity: cfg.enabled ? 1 : 0.35,
                      transition: "opacity 0.2s, background 0.2s",
                    }}
                  >
                    <div className="flex items-center gap-3 px-5 py-3">
                      <div
                        className="rounded-full overflow-hidden shrink-0"
                        style={{ width: 30, height: 30, outline: `1.5px solid ${agent.color}30`, outlineOffset: 2 }}
                      >
                        <AgentImage
                          defaultSrc={agent.image}
                          size={30}
                          status={cfg.enabled ? "idle" : "waiting"}
                          expression={null}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold" style={{ color: cfg.enabled ? agent.color : "#475569" }}>
                            {agent.name}
                          </span>
                          <span className="text-[9px] text-slate-600">{agent.title} · {agent.role}</span>
                        </div>
                        <p className="text-[9px] text-slate-700 mt-0.5 truncate">{DEFAULT_ROLES[cfg.agentId]}</p>
                      </div>
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : cfg.agentId)}
                        className="text-[9px] px-2 py-0.5 rounded-full transition-colors shrink-0"
                        style={{
                          color: hasInstruction ? agent.color : "#334155",
                          border: `1px solid ${hasInstruction ? `${agent.color}40` : "#1e2535"}`,
                          background: hasInstruction ? `${agent.color}10` : "transparent",
                        }}
                      >
                        {hasInstruction ? "지시 ✓" : "지시 +"}
                      </button>
                      <button
                        onClick={() => toggleAgent(cfg.agentId)}
                        className="shrink-0 relative rounded-full transition-colors duration-200"
                        style={{ width: 34, height: 18, background: cfg.enabled ? agent.color : "#1e2535" }}
                      >
                        <div
                          className="absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform duration-200"
                          style={{ transform: cfg.enabled ? "translateX(17px)" : "translateX(2px)" }}
                        />
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="px-5 pb-3 space-y-2">
                        <textarea
                          value={cfg.instruction}
                          onChange={(e) => setInstruction(cfg.agentId, e.target.value)}
                          placeholder={`${agent.name}에게 특별히 지시할 내용...`}
                          rows={2}
                          autoFocus
                          className="w-full resize-none rounded-xl px-3 py-2 text-[11px] text-slate-200 placeholder-slate-700 outline-none transition-all"
                          style={{ background: "#0a0f1a", border: `1px solid ${agent.color}25` }}
                          onFocus={(e) => { e.target.style.borderColor = `${agent.color}50`; }}
                          onBlur={(e) => { e.target.style.borderColor = `${agent.color}25`; }}
                        />
                        {cfg.agentId === "pocke" && (
                          <div className="flex items-center gap-3">
                            <span className="text-[9px] text-slate-500 shrink-0">검색 깊이</span>
                            <input
                              type="range"
                              min={1}
                              max={10}
                              value={cfg.maxTurns ?? 5}
                              onChange={(e) => setMaxTurns(cfg.agentId, Number(e.target.value))}
                              className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
                              style={{ accentColor: agent.color }}
                            />
                            <span className="text-[10px] font-bold w-4 text-right shrink-0" style={{ color: agent.color }}>
                              {cfg.maxTurns ?? 5}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div className="shrink-0 flex items-center justify-end gap-3 px-7 py-4 border-t border-slate-800/60">
          <button
            onClick={onClose}
            className="text-xs text-slate-500 hover:text-slate-300 px-4 py-2 rounded-full transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleStart}
            disabled={!topic.trim()}
            className="text-xs font-bold px-6 py-2 rounded-full transition-all"
            style={{
              background: topic.trim()
                ? selectedType
                  ? `linear-gradient(135deg, ${selectedType.color}30, ${selectedType.color}50)`
                  : "linear-gradient(135deg, #1e3a5f, #2a4f7c)"
                : "#1a2235",
              color: topic.trim()
                ? selectedType ? selectedType.color : "#93c5fd"
                : "#334155",
              border: `1px solid ${topic.trim() ? selectedType ? `${selectedType.color}60` : "#2a5a9c" : "#1e2535"}`,
            }}
          >
            시작 →
          </button>
        </div>
      </div>
    </div>
  );
}
