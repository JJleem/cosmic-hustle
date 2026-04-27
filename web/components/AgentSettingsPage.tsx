"use client";

import { useState, useCallback } from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { AGENTS } from "@/lib/agents";
import { AllAgentSettings, AgentPersistentSettings, saveAgentSettings } from "@/lib/agentSettings";
import { DEFAULT_PROMPTS, PROMPT_VARS_HINT } from "@/lib/agentPrompts";
import AgentImage from "./AgentImage";

const MAX_TURNS_CONFIG: Record<string, { label: string; min: number; max: number; default: number }> = {
  pocke: { label: "검색 깊이 (max turns)", min: 1, max: 8, default: 3 },
  wiki:  { label: "탐색 깊이 (max turns)", min: 1, max: 5, default: 2 },
};

// 슬라이더 트랙 배경 — 채워진 부분 / 빈 부분
function sliderBackground(val: number, min: number, max: number, color: string): string {
  const pct = ((val - min) / (max - min)) * 100;
  return `linear-gradient(to right, ${color} 0%, ${color} ${pct}%, #1e2a40 ${pct}%, #1e2a40 100%)`;
}

type Props = {
  settings: AllAgentSettings;
  onChange: (settings: AllAgentSettings) => void;
};

export default function AgentSettingsPage({ settings, onChange }: Props) {
  const [selectedId, setSelectedId] = useState<string>(AGENTS[0].id);
  const [showPrompt, setShowPrompt] = useState(true);
  const [saved, setSaved] = useState(false);

  const agent = AGENTS.find((a) => a.id === selectedId)!;
  const current: AgentPersistentSettings = settings[selectedId] ?? { instruction: "" };
  const turnsConfig = MAX_TURNS_CONFIG[selectedId];
  const defaultPrompt = DEFAULT_PROMPTS[selectedId] ?? "";
  const varsHint = PROMPT_VARS_HINT[selectedId] ?? [];

  const update = useCallback(
    (patch: Partial<AgentPersistentSettings>) => {
      onChange({ ...settings, [selectedId]: { ...current, ...patch } });
    },
    [settings, selectedId, current, onChange],
  );

  const handleSave = () => {
    saveAgentSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const promptValue = current.basePrompt ?? defaultPrompt;
  const isModified = current.basePrompt !== undefined && current.basePrompt !== defaultPrompt;

  return (
    <div className="h-full flex overflow-hidden">
      {/* 에이전트 목록 */}
      <div
        className="w-56 shrink-0 border-r flex flex-col"
        style={{ borderColor: "#1a2235" }}
      >
        <div className="px-5 pt-6 pb-3">
          <p className="text-[10px] tracking-[0.25em] uppercase font-bold text-slate-600">에이전트 설정</p>
        </div>

        {AGENTS.map((a) => {
          const isSelected = a.id === selectedId;
          const hasSetting =
            (settings[a.id]?.basePrompt !== undefined && settings[a.id].basePrompt !== DEFAULT_PROMPTS[a.id]) ||
            (settings[a.id]?.instruction?.trim().length ?? 0) > 0;

          return (
            <button
              key={a.id}
              onClick={() => setSelectedId(a.id)}
              className="flex items-center gap-3 px-4 py-2.5 text-left transition-all"
              style={{
                background: isSelected ? `${a.color}10` : "transparent",
                borderLeft: `2px solid ${isSelected ? a.color : "transparent"}`,
              }}
            >
              <div
                className="rounded-full overflow-hidden shrink-0"
                style={{
                  width: 34,
                  height: 34,
                  outline: `1.5px solid ${isSelected ? a.color : `${a.color}30`}`,
                  outlineOffset: 2,
                }}
              >
                <AgentImage defaultSrc={a.image} size={34} status="idle" expression={null} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-xs font-bold"
                    style={{ color: isSelected ? a.color : "#64748b" }}
                  >
                    {a.name}
                  </span>
                  <span className="text-[9px] text-slate-700">{a.title}</span>
                </div>
                <p className="text-[9px] text-slate-600">{a.role}</p>
              </div>

              {hasSetting && (
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: a.color }} />
              )}
            </button>
          );
        })}
      </div>

      {/* 에디터 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 헤더 */}
        <div
          className="shrink-0 px-7 py-4 border-b flex items-center gap-4"
          style={{ borderColor: `${agent.color}18` }}
        >
          <div
            className="rounded-full overflow-hidden shrink-0"
            style={{
              width: 44,
              height: 44,
              outline: `1.5px solid ${agent.color}40`,
              outlineOffset: 3,
            }}
          >
            <AgentImage defaultSrc={agent.image} size={44} status="idle" expression={null} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <h2 className="text-sm font-bold" style={{ color: agent.color }}>{agent.name}</h2>
              <span className="text-[10px] text-slate-500">{agent.title} · {agent.role}</span>
            </div>
            <p className="text-[10px] text-slate-600 mt-0.5 truncate">{agent.personality.slice(0, 60)}...</p>
          </div>
          {varsHint.length > 0 && (
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[9px] text-slate-600 mr-1">사용 가능 변수</span>
              {varsHint.map((v) => (
                <span
                  key={v}
                  className="text-[9px] px-1.5 py-0.5 rounded font-mono"
                  style={{
                    background: `${agent.color}12`,
                    color: `${agent.color}90`,
                    border: `1px solid ${agent.color}20`,
                  }}
                >
                  {v}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 에디터 본문 */}
        <div className="flex-1 overflow-y-auto p-7 space-y-5" style={{ scrollbarWidth: "none" }}>

          {/* ── 프롬프트 섹션 ── */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{ border: `1px solid ${agent.color}18` }}
          >
            {/* 섹션 헤더 */}
            <button
              onClick={() => setShowPrompt((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-3.5 transition-colors"
              style={{ background: `${agent.color}08` }}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="text-[10px] tracking-[0.2em] uppercase font-bold"
                  style={{ color: `${agent.color}90` }}
                >
                  프롬프트
                </span>
                {isModified && (
                  <span
                    className="text-[9px] px-2 py-0.5 rounded-full"
                    style={{
                      background: `${agent.color}18`,
                      color: agent.color,
                      border: `1px solid ${agent.color}35`,
                    }}
                  >
                    수정됨
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isModified && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      update({ basePrompt: undefined });
                    }}
                    className="text-[9px] text-slate-600 hover:text-slate-300 transition-colors px-2 py-0.5 rounded"
                  >
                    기본값으로
                  </button>
                )}
                {showPrompt
                  ? <ChevronUp size={13} className="text-slate-600" />
                  : <ChevronDown size={13} className="text-slate-600" />
                }
              </div>
            </button>

            {/* 프롬프트 에디터 */}
            {showPrompt && (
              <div className="px-5 pb-5 pt-3" style={{ background: "#090d18" }}>
                <textarea
                  value={promptValue}
                  onChange={(e) => update({ basePrompt: e.target.value })}
                  rows={12}
                  className="w-full resize-none rounded-xl px-4 py-3.5 text-[11.5px] text-slate-200 outline-none transition-all font-mono leading-relaxed"
                  style={{
                    background: "#0a0e1a",
                    border: `1px solid ${agent.color}20`,
                    caretColor: agent.color,
                  }}
                  onFocus={(e) => { e.target.style.borderColor = `${agent.color}50`; }}
                  onBlur={(e) => { e.target.style.borderColor = `${agent.color}20`; }}
                />
                <p className="text-[9px] text-slate-700 mt-2">
                  {`{변수명}`} 형태는 실행 시 자동으로 값이 대입됩니다.
                </p>
              </div>
            )}
          </div>

          {/* ── 추가 지시사항 ── */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{ border: `1px solid ${agent.color}15` }}
          >
            <div
              className="flex items-center px-5 py-3.5"
              style={{ background: `${agent.color}06` }}
            >
              <span
                className="text-[10px] tracking-[0.2em] uppercase font-bold"
                style={{ color: `${agent.color}70` }}
              >
                추가 지시사항
              </span>
              <span className="text-[9px] text-slate-600 ml-2">프롬프트 뒤에 이어 붙는 CEO 지시</span>
            </div>
            <div className="px-5 pb-5 pt-3" style={{ background: "#090d18" }}>
              <textarea
                value={current.instruction}
                onChange={(e) => update({ instruction: e.target.value })}
                placeholder={`예: 항상 한국어로만 답변. 출처는 반드시 URL 포함.`}
                rows={3}
                className="w-full resize-none rounded-xl px-4 py-3 text-[11.5px] text-slate-200 placeholder-slate-700 outline-none transition-all leading-relaxed"
                style={{
                  background: "#0a0e1a",
                  border: `1px solid ${agent.color}15`,
                }}
                onFocus={(e) => { e.target.style.borderColor = `${agent.color}40`; }}
                onBlur={(e) => { e.target.style.borderColor = `${agent.color}15`; }}
              />
            </div>
          </div>

          {/* ── maxTurns 슬라이더 (포케·위키 전용) ── */}
          {turnsConfig && (
            <div
              className="rounded-2xl overflow-hidden"
              style={{ border: `1px solid ${agent.color}15` }}
            >
              <div
                className="flex items-center px-5 py-3.5"
                style={{ background: `${agent.color}06` }}
              >
                <span
                  className="text-[10px] tracking-[0.2em] uppercase font-bold"
                  style={{ color: `${agent.color}70` }}
                >
                  {turnsConfig.label}
                </span>
              </div>
              <div className="px-5 pb-5 pt-4" style={{ background: "#090d18" }}>
                <div className="flex items-center gap-4">
                  <div className="flex-1 relative">
                    <input
                      type="range"
                      min={turnsConfig.min}
                      max={turnsConfig.max}
                      value={current.maxTurns ?? turnsConfig.default}
                      onChange={(e) => update({ maxTurns: Number(e.target.value) })}
                      className="w-full h-2 rounded-full cursor-pointer appearance-none"
                      style={{
                        background: sliderBackground(
                          current.maxTurns ?? turnsConfig.default,
                          turnsConfig.min,
                          turnsConfig.max,
                          agent.color,
                        ),
                        // 썸 스타일은 전역 CSS로 처리되므로 여기선 배경만
                      }}
                    />
                  </div>
                  <span
                    className="text-base font-bold w-6 text-center shrink-0 tabular-nums"
                    style={{ color: agent.color }}
                  >
                    {current.maxTurns ?? turnsConfig.default}
                  </span>
                </div>
                <div className="flex justify-between mt-2">
                  <span className="text-[9px] text-slate-600">빠름 · 토큰 절약</span>
                  <span className="text-[9px] text-slate-600">깊이 · 토큰 더 씀</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 저장 */}
        <div
          className="shrink-0 px-7 py-4 border-t flex items-center justify-between"
          style={{ borderColor: "#1a2235" }}
        >
          <p className="text-[9px] text-slate-700">저장 후 다음 리서치부터 적용됩니다.</p>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-5 py-2 rounded-full text-xs font-bold transition-all"
            style={{
              background: saved ? "#052e1620" : "linear-gradient(135deg, #1e3a5f, #2a4f7c)",
              color: saved ? "#4ade80" : "#93c5fd",
              border: `1px solid ${saved ? "#4ade8040" : "#2a5a9c"}`,
            }}
          >
            {saved ? <><Check size={11} /> 저장됨</> : "저장하기"}
          </button>
        </div>
      </div>
    </div>
  );
}
