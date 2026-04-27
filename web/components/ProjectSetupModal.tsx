"use client";

import { useState, useRef, useEffect } from "react";
import { Zap, Loader2 } from "lucide-react";
import { AGENTS, AGENT_MAP, PIPELINE } from "@/lib/agents";
import { AllAgentSettings } from "@/lib/agentSettings";
import AgentImage from "./AgentImage";

export type AgentConfig = {
  agentId: string;
  enabled: boolean;
  basePrompt?: string;
  instruction: string;
  maxTurns?: number;
};

export type ProjectConfig = {
  topic: string;
  taskTypeId: string;
  agentConfigs: AgentConfig[];
};

type Props = {
  onStart: (config: ProjectConfig) => void;
  onClose: () => void;
  defaultSettings?: AllAgentSettings;
};

const DEFAULT_ROLES: Record<string, string> = {
  plan:  "의도 파악 + 태스크 정의 + 팀 구성",
  wiki:  "배경 지식 연결 + 위키 업데이트",
  pocke: "웹 리서치 + 정보 수집",
  ka:    "데이터 분석 + 인사이트 도출",
  over:  "리포트 작성",
  fact:  "팩트체크 + 품질 검수",
  ping:  "아이디어 캡처",
};

// 파이프라인 순서대로
const ORDERED_AGENTS = ["plan", "wiki", "pocke", "ka", "over", "fact", "ping"];

function initConfigs(defaultSettings?: AllAgentSettings): AgentConfig[] {
  return ORDERED_AGENTS.map((id) => ({
    agentId: id,
    enabled: true,
    basePrompt: defaultSettings?.[id]?.basePrompt,
    instruction: defaultSettings?.[id]?.instruction ?? "",
    maxTurns: defaultSettings?.[id]?.maxTurns,
  }));
}

export default function ProjectSetupModal({ onStart, onClose, defaultSettings }: Props) {
  const [topic, setTopic] = useState("");
  const [configs, setConfigs] = useState<AgentConfig[]>(() => initConfigs(defaultSettings));
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const topicRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    topicRef.current?.focus();
  }, []);

  const toggleAgent = (agentId: string) => {
    setConfigs((prev) =>
      prev.map((c) => (c.agentId === agentId ? { ...c, enabled: !c.enabled } : c))
    );
  };

  const setInstruction = (agentId: string, instruction: string) => {
    setConfigs((prev) =>
      prev.map((c) => (c.agentId === agentId ? { ...c, instruction } : c))
    );
  };

  const setMaxTurns = (agentId: string, maxTurns: number) => {
    setConfigs((prev) =>
      prev.map((c) => (c.agentId === agentId ? { ...c, maxTurns } : c))
    );
  };

  const handleStart = () => {
    const trimmed = topic.trim();
    if (!trimmed) { topicRef.current?.focus(); return; }
    onStart({ topic: trimmed, taskTypeId: "auto", agentConfigs: configs });
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
      if (match) {
        const parsed = JSON.parse(match[0]) as string[];
        setSuggestions(parsed.slice(0, 5));
      }
    } catch {
      setSuggestions([]);
    } finally {
      setSuggesting(false);
    }
  };

  const enabledCount = configs.filter((c) => c.enabled).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="w-full max-w-xl flex flex-col rounded-3xl overflow-hidden"
        style={{
          background: "#0b0f1e",
          border: "1px solid #1e2a40",
          boxShadow: "0 24px 80px rgba(0,0,0,0.8)",
          maxHeight: "90vh",
        }}
      >
        {/* 헤더 */}
        <div className="shrink-0 flex items-center justify-between px-6 pt-6 pb-4">
          <div className="flex items-center gap-2">
            <span className="text-base">🪐</span>
            <h2 className="text-sm font-bold tracking-[0.2em] text-slate-100">
              새 프로젝트
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-600 hover:text-slate-300 text-xs transition-colors w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-800"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-2" style={{ scrollbarWidth: "none" }}>

          {/* 주제 입력 */}
          <div className="mb-5">
            <label className="text-[10px] text-slate-500 tracking-[0.2em] uppercase font-bold block mb-2">
              주제
            </label>
            <textarea
              ref={topicRef}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="어떤 주제를 조사할까요?"
              rows={2}
              className="w-full resize-none rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-700 outline-none transition-all"
              style={{
                background: "#0d1222",
                border: "1px solid #1e2a40",
              }}
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
              <div className="mt-3 flex flex-wrap gap-1.5">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setTopic(s)}
                    className="text-[10px] px-3 py-1.5 rounded-full border transition-all hover:opacity-100 text-left"
                    style={{ background: "#0d1222", borderColor: "#fbbf2430", color: "#94a3b8" }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 에이전트 설정 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] text-slate-500 tracking-[0.2em] uppercase font-bold">
                파이프라인
              </label>
              <span className="text-[9px] text-slate-700">
                {enabledCount}명 참여
              </span>
            </div>

            <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #1a2235" }}>
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
                      opacity: cfg.enabled ? 1 : 0.4,
                      transition: "opacity 0.2s, background 0.2s",
                    }}
                  >
                    {/* 에이전트 행 */}
                    <div className="flex items-center gap-3 px-4 py-3">
                      {/* 아바타 */}
                      <div
                        className="rounded-full overflow-hidden shrink-0"
                        style={{
                          width: 32,
                          height: 32,
                          outline: `1.5px solid ${agent.color}30`,
                          outlineOffset: 2,
                        }}
                      >
                        <AgentImage
                          defaultSrc={agent.image}
                          size={32}
                          status={cfg.enabled ? "idle" : "waiting"}
                          expression={null}
                        />
                      </div>

                      {/* 이름 + 역할 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="text-xs font-bold"
                            style={{ color: cfg.enabled ? agent.color : "#475569" }}
                          >
                            {agent.name}
                          </span>
                          <span className="text-[9px] text-slate-600">
                            {agent.title} · {agent.role}
                          </span>
                        </div>
                        <p className="text-[9px] text-slate-700 mt-0.5 truncate">
                          {DEFAULT_ROLES[cfg.agentId]}
                        </p>
                      </div>

                      {/* 지시 추가 버튼 */}
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

                      {/* 토글 */}
                      <button
                        onClick={() => toggleAgent(cfg.agentId)}
                        className="shrink-0 relative rounded-full transition-colors duration-200"
                        style={{
                          width: 36,
                          height: 20,
                          background: cfg.enabled ? agent.color : "#1e2535",
                        }}
                      >
                        <div
                          className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-200"
                          style={{
                            transform: cfg.enabled ? "translateX(18px)" : "translateX(2px)",
                          }}
                        />
                      </button>
                    </div>

                    {/* 커스텀 지시 입력 */}
                    {isExpanded && (
                      <div className="px-4 pb-3 space-y-2">
                        <textarea
                          value={cfg.instruction}
                          onChange={(e) => setInstruction(cfg.agentId, e.target.value)}
                          placeholder={`${agent.name}에게 특별히 지시할 내용... (예: 최신 2025 데이터 위주로)`}
                          rows={2}
                          autoFocus
                          className="w-full resize-none rounded-xl px-3 py-2 text-[11px] text-slate-200 placeholder-slate-700 outline-none transition-all"
                          style={{
                            background: "#0a0f1a",
                            border: `1px solid ${agent.color}25`,
                          }}
                          onFocus={(e) => { e.target.style.borderColor = `${agent.color}50`; }}
                          onBlur={(e) => { e.target.style.borderColor = `${agent.color}25`; }}
                        />
                        {/* 포케 전용: 검색 깊이 (maxTurns) */}
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
                            <span
                              className="text-[10px] font-bold w-4 text-right shrink-0"
                              style={{ color: agent.color }}
                            >
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
        <div className="shrink-0 flex items-center justify-end gap-3 px-6 py-5 border-t border-slate-800/60">
          <button
            onClick={onClose}
            className="text-xs text-slate-500 hover:text-slate-300 px-4 py-2 rounded-full transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleStart}
            disabled={!topic.trim()}
            className="text-xs font-bold px-5 py-2 rounded-full transition-all"
            style={{
              background: topic.trim() ? "linear-gradient(135deg, #1e3a5f, #2a4f7c)" : "#1a2235",
              color: topic.trim() ? "#93c5fd" : "#334155",
              border: `1px solid ${topic.trim() ? "#2a5a9c" : "#1e2535"}`,
            }}
          >
            시작 →
          </button>
        </div>
      </div>
    </div>
  );
}
