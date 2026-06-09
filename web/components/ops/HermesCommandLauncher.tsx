"use client";

import { useEffect, useState } from "react";
import { FileText, Loader2, Send, TerminalSquare } from "lucide-react";
import {
  HERMES_AGENT_IDS,
  type HermesAgentId,
  type HermesRunHistory,
  type HermesRunResult,
} from "@/lib/ops/hermesAgents";

const defaultCommand =
  "Cosmic Hustle Hermes 연결 테스트. 너의 역할 기준으로 현재 다음 액션을 짧게 정리해줘.";

export default function HermesCommandLauncher() {
  const [agentId, setAgentId] = useState<HermesAgentId>("plan");
  const [command, setCommand] = useState(defaultCommand);
  const [run, setRun] = useState<HermesRunResult | null>(null);
  const [history, setHistory] = useState<HermesRunHistory | null>(null);
  const [error, setError] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    void refreshHistory();
  }, []);

  async function refreshHistory() {
    try {
      const response = await fetch("/api/ops/hermes/run");
      if (!response.ok) return;
      setHistory((await response.json()) as HermesRunHistory);
    } catch {
      setHistory(null);
    }
  }

  async function submitRun() {
    if (!command.trim() || isRunning) return;

    setIsRunning(true);
    setError("");
    setRun(null);

    try {
      const response = await fetch("/api/ops/hermes/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, command }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? data.error ?? `HTTP ${response.status}`);
      }
      setRun(data as HermesRunResult);
      await refreshHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hermes run failed");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="rounded-md border border-white/10 bg-[#14181d]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-white">헤르메스 명령 실행</h2>
          <p className="text-xs text-zinc-500">V1: 대시보드 → 헤르메스 → 로컬 런 로그</p>
        </div>
        <button
          type="button"
          onClick={submitRun}
          disabled={isRunning || !command.trim()}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-amber-300 px-3 text-sm font-semibold text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          실행
        </button>
      </div>

      <div className="grid gap-3 p-4 lg:grid-cols-[180px_1fr]">
        <div className="space-y-2">
          {HERMES_AGENT_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setAgentId(id)}
              className={`flex h-10 w-full items-center justify-between rounded-md border px-3 text-sm ${
                agentId === id
                  ? "border-amber-300/60 bg-amber-300/10 text-amber-100"
                  : "border-white/10 bg-[#0f1216] text-zinc-300"
              }`}
            >
              <span>{id}</span>
              <span className="text-xs text-zinc-500">에이전트</span>
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="sr-only">Command</span>
            <textarea
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              className="min-h-[116px] w-full resize-y rounded-md border border-white/10 bg-[#0f1216] p-3 text-sm leading-6 text-zinc-200 outline-none transition focus:border-amber-300/50"
            />
          </label>

          {error ? (
            <div className="rounded-md border border-red-300/20 bg-red-950/20 p-3 text-sm leading-6 text-red-100">
              {error}
            </div>
          ) : null}

          {run ? (
            <div className="rounded-md border border-emerald-300/20 bg-emerald-300/[0.06] p-3">
              <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                <span>{run.agentId}</span>
                <span>{run.durationMs}ms</span>
                {run.sessionId ? <span>{run.sessionId}</span> : null}
                {run.vaultNotePath ? <span>{run.vaultNotePath}</span> : null}
              </div>
              {run.vaultNoteError ? (
                <div className="mb-3 rounded border border-amber-300/20 bg-amber-300/[0.08] px-3 py-2 text-xs leading-5 text-amber-100">
                  볼트 노트 오류: {run.vaultNoteError}
                </div>
              ) : null}
              <div className="flex gap-3">
                <TerminalSquare className="mt-1 h-4 w-4 shrink-0 text-emerald-300" />
                <pre className="max-h-[280px] flex-1 overflow-auto whitespace-pre-wrap text-sm leading-6 text-zinc-200">
                  {run.response}
                </pre>
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 xl:grid-cols-[1fr_240px]">
            <div className="rounded-md border border-white/10 bg-[#0f1216]">
              <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  최근 헤르메스 실행
                </p>
                <TerminalSquare className="h-4 w-4 text-zinc-500" />
              </div>
              <div className="divide-y divide-white/10">
                {history?.runs.length ? (
                  history.runs.slice(0, 4).map((item) => (
                    <div key={item.id} className="grid gap-1 px-3 py-2">
                      <div className="flex min-w-0 items-center justify-between gap-3 text-xs">
                        <span className="font-semibold text-zinc-200">{item.agentId}</span>
                        <span className="shrink-0 text-zinc-500">
                          {new Date(item.createdAt).toLocaleTimeString("ko-KR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <p className="truncate text-sm text-zinc-400">{item.command}</p>
                      {item.vaultNotePath ? (
                        <p className="truncate text-xs text-emerald-300">{item.vaultNotePath}</p>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="px-3 py-4 text-sm text-zinc-500">아직 헤르메스 실행 기록이 없습니다.</p>
                )}
              </div>
            </div>

            <div className="rounded-md border border-white/10 bg-[#0f1216] p-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-amber-300" />
                <p className="text-sm font-semibold text-zinc-100">볼트</p>
              </div>
              <p className="mt-3 text-sm text-zinc-400">
                {history?.vault.available ? "연결됨" : "연결 불가"}
              </p>
              <p className="mt-1 break-all text-xs leading-5 text-zinc-500">
                {history?.vault.path ?? "로컬 볼트 확인 중..."}
              </p>
              {history?.vault.latestHandoffPath ? (
                <p className="mt-3 break-all text-xs leading-5 text-emerald-300">
                  {history.vault.latestHandoffPath}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
