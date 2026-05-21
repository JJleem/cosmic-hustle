"use client";

import { useState, useEffect, useCallback } from "react";
import { Terminal, CheckSquare, Square, AlertTriangle, RefreshCw, Banknote } from "lucide-react";
import { AgentDef, AGENTS } from "@/lib/agents";
import { useDataStore, type AgentTokenUsage, type TokenUsageSummary } from "@/lib/stores/dataStore";
import { useSessionStore } from "@/lib/stores/sessionStore";
import ChatPanel from "./ChatPanel";

type Tab = "checklist" | "terminal" | "logs" | "salary";

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

type LogEntry = {
  id: string;
  level: "error" | "warn" | "info";
  source: string;
  message: string;
  stack_trace: string | null;
  session_id: string | null;
  created_at: string;
};

const LEVEL_COLOR: Record<string, string> = {
  error: "#f87171",
  warn: "#fbbf24",
  info: "#60a5fa",
};

const SOURCE_LABEL: Record<string, string> = {
  pipeline: "파이프라인",
  agent: "에이전트",
  api: "API",
  frontend: "프론트",
};

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}초 전`;
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return new Date(iso).toLocaleDateString("ko-KR");
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function LogsTab({ agent: _agent }: { agent: AgentDef }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [levelFilter, setLevelFilter] = useState<string>("error");
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/logs?level=${levelFilter}&limit=50`);
      if (res.ok) setLogs(await res.json());
    } catch { /* 무시 */ }
    finally { setLoading(false); }
  }, [levelFilter]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 필터 + 새로고침 */}
      <div className="shrink-0 flex items-center gap-2 px-5 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        {["error", "warn", "info"].map((lv) => (
          <button
            key={lv}
            onClick={() => setLevelFilter(lv)}
            className="px-3 py-1 rounded-lg text-[10px] font-bold tracking-wide transition-all"
            style={levelFilter === lv
              ? { background: `${LEVEL_COLOR[lv]}18`, color: LEVEL_COLOR[lv], border: `1px solid ${LEVEL_COLOR[lv]}40` }
              : { color: "#475569", border: "1px solid transparent" }}
          >
            {lv.toUpperCase()}
          </button>
        ))}
        <button
          onClick={fetchLogs}
          className="ml-auto text-slate-600 hover:text-slate-400 transition-colors"
          disabled={loading}
        >
          <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* 로그 목록 */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5 scrollbar-hide">
        {logs.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <AlertTriangle size={18} className="text-slate-700" />
            <p className="text-[11px] text-slate-700">에러 없음. 시스템 정상.</p>
          </div>
        )}
        {logs.map((log) => (
          <div
            key={log.id}
            className="rounded-xl px-3 py-2.5 cursor-pointer transition-all"
            style={{
              background: expanded === log.id ? `${LEVEL_COLOR[log.level]}08` : "rgba(255,255,255,0.02)",
              border: `1px solid ${LEVEL_COLOR[log.level]}${expanded === log.id ? "30" : "15"}`,
            }}
            onClick={() => setExpanded(expanded === log.id ? null : log.id)}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="text-[8px] font-bold tracking-widest shrink-0 px-1.5 py-0.5 rounded"
                style={{ background: `${LEVEL_COLOR[log.level]}18`, color: LEVEL_COLOR[log.level] }}
              >
                {log.level.toUpperCase()}
              </span>
              <span className="text-[9px] text-slate-600 shrink-0">
                {SOURCE_LABEL[log.source] ?? log.source}
              </span>
              <span className="text-[10px] text-slate-400 truncate flex-1">{log.message}</span>
              <span className="text-[9px] text-slate-700 shrink-0">{timeAgo(log.created_at)}</span>
            </div>

            {expanded === log.id && (
              <div className="mt-2 space-y-1">
                {log.session_id && (
                  <p className="text-[9px] text-slate-600">
                    세션: <span className="text-slate-500 font-mono">{log.session_id.slice(0, 8)}...</span>
                  </p>
                )}
                {log.stack_trace && (
                  <pre className="text-[8px] text-slate-600 whitespace-pre-wrap break-all leading-relaxed max-h-32 overflow-y-auto scrollbar-hide mt-1 p-2 rounded-lg"
                    style={{ background: "rgba(0,0,0,0.3)" }}>
                    {log.stack_trace.slice(0, 800)}
                  </pre>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const AGENT_NAME: Record<string, string> = Object.fromEntries(
  AGENTS.map((a) => [a.id, `${a.name} ${a.title}`])
);

function fmtUsd(v: number): string {
  return v < 0.001 ? `$${(v * 1000).toFixed(4)}m` : `$${v.toFixed(4)}`;
}

function SalaryRow({ row, color }: { row: AgentTokenUsage; color: string }) {
  const [hovered, setHovered] = useState(false);
  const name = AGENT_NAME[row.agentId] ?? row.agentId;
  const totalTokens = row.inputTokens + row.outputTokens;

  return (
    <div
      className="relative rounded-xl px-4 py-3 transition-all cursor-default"
      style={{
        background: hovered ? `${color}08` : "rgba(255,255,255,0.02)",
        border: `1px solid ${hovered ? color + "30" : "rgba(255,255,255,0.05)"}`,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-slate-300">{name}</span>
        <span className="text-[12px] font-bold tabular-nums" style={{ color }}>
          {fmtUsd(row.costUsd)}
        </span>
      </div>

      {/* hover 시 토큰 내역 */}
      {hovered && (
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5">
          <span className="text-[9px] text-slate-600">입력 토큰</span>
          <span className="text-[9px] text-slate-400 text-right tabular-nums">{row.inputTokens.toLocaleString()}</span>
          <span className="text-[9px] text-slate-600">출력 토큰</span>
          <span className="text-[9px] text-slate-400 text-right tabular-nums">{row.outputTokens.toLocaleString()}</span>
          {row.cacheReadTokens > 0 && <>
            <span className="text-[9px] text-slate-600">캐시 절약</span>
            <span className="text-[9px] text-right tabular-nums" style={{ color: "#34d399" }}>{row.cacheReadTokens.toLocaleString()}</span>
          </>}
          <span className="text-[9px] text-slate-600">총 토큰</span>
          <span className="text-[9px] text-slate-400 text-right tabular-nums">{totalTokens.toLocaleString()}</span>
          {row.model && (
            <span className="text-[8px] text-slate-700 col-span-2 mt-0.5 truncate">{row.model}</span>
          )}
        </div>
      )}
    </div>
  );
}

function SalaryTab({ agentColor }: { agentColor: string }) {
  const lastTokenUsage = useDataStore((s) => s.lastTokenUsage);
  const setLastTokenUsage = useDataStore((s) => s.setLastTokenUsage);
  const currentSessionId = useSessionStore((s) => s.currentSessionId);
  const [loading, setLoading] = useState(false);

  const fetchFromApi = useCallback(async (sid?: string | null) => {
    setLoading(true);
    try {
      const url = sid ? `/api/sessions/${sid}/token-usage` : `/api/sessions/latest/token-usage`;
      const res = await fetch(url);
      if (res.ok) {
        const data: TokenUsageSummary = await res.json();
        if (data.agents.length > 0) setLastTokenUsage(data);
      }
    } catch { /* 무시 */ }
    finally { setLoading(false); }
  }, [setLastTokenUsage]);

  // lastTokenUsage 없으면 sessionId 기반 or 최근 세션 fallback 조회
  useEffect(() => {
    if (!lastTokenUsage) {
      void fetchFromApi(currentSessionId);
    }
  }, [lastTokenUsage, currentSessionId, fetchFromApi]);

  if (!lastTokenUsage || lastTokenUsage.agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <Banknote size={24} className="text-slate-700" />
        {loading
          ? <p className="text-[11px] text-slate-600">월급 계산 중...</p>
          : <>
              <p className="text-[11px] text-slate-600">아직 월급날이 아니에요.</p>
              <p className="text-[10px] text-slate-700">리서치 완료 후 이번 달 월급이 정산됩니다.</p>
            </>
        }
      </div>
    );
  }

  const { total } = lastTokenUsage;
  // 같은 에이전트가 여러 번 실행될 수 있으므로 agentId별 합산
  const aggregated = Object.values(
    lastTokenUsage.agents.reduce<Record<string, AgentTokenUsage>>((acc, row) => {
      if (acc[row.agentId]) {
        acc[row.agentId] = {
          ...acc[row.agentId],
          inputTokens: acc[row.agentId].inputTokens + row.inputTokens,
          outputTokens: acc[row.agentId].outputTokens + row.outputTokens,
          cacheReadTokens: acc[row.agentId].cacheReadTokens + row.cacheReadTokens,
          costUsd: acc[row.agentId].costUsd + row.costUsd,
        };
      } else {
        acc[row.agentId] = { ...row };
      }
      return acc;
    }, {})
  );
  const sorted = aggregated.sort((a, b) => b.costUsd - a.costUsd);

  return (
    <div className="h-full overflow-y-auto px-5 py-4 scrollbar-hide space-y-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-1">
        <p className="text-[9px] text-slate-600 tracking-widest uppercase font-bold">이번 달 월급 명세서</p>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-slate-700">hover → 토큰 내역</span>
          <button
            onClick={() => void fetchFromApi(currentSessionId)}
            disabled={loading}
            className="text-slate-700 hover:text-slate-500 transition-colors"
          >
            <RefreshCw size={9} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* 면책 문구 */}
      <p className="text-[9px] text-slate-700 px-1">
        참고 비용 (구독 요금제 기준) — 실제 과금과 다를 수 있어요.
      </p>

      {/* 직원별 월급 */}
      <div className="space-y-1.5">
        {sorted.map((row) => {
          const isWriter = ["over", "pixel", "buzz", "run"].includes(row.agentId);
          return (
            <div key={row.agentId}>
              <SalaryRow row={row} color={agentColor} />
              {isWriter && (
                <p className="text-[8px] text-slate-700 pl-4 mt-0.5 italic">
                  팩트 부장 검토 비용 포함
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* 합계 */}
      <div className="mt-3 rounded-xl px-4 py-3" style={{ background: `${agentColor}10`, border: `1px solid ${agentColor}30` }}>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-300">총 월급 지출</span>
          <span className="text-[15px] font-bold tabular-nums" style={{ color: agentColor }}>
            {fmtUsd(total.costUsd)}
          </span>
        </div>
        <div className="mt-1.5 flex gap-4">
          <span className="text-[9px] text-slate-600">
            입력 <span className="text-slate-400">{total.inputTokens.toLocaleString()}</span>
          </span>
          <span className="text-[9px] text-slate-600">
            출력 <span className="text-slate-400">{total.outputTokens.toLocaleString()}</span>
          </span>
          {total.cacheReadTokens > 0 && (
            <span className="text-[9px] text-slate-600">
              캐시 절약 <span style={{ color: "#34d399" }}>{total.cacheReadTokens.toLocaleString()}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

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
    { id: "logs"      as Tab, label: "에러 로그",       icon: AlertTriangle },
    { id: "salary"    as Tab, label: "월급",            icon: Banknote },
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
        {tab === "terminal"  && <ChatPanel agent={agent} mono={true} />}
        {tab === "logs"      && <LogsTab agent={agent} />}
        {tab === "salary"    && <SalaryTab agentColor={agent.color} />}

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
