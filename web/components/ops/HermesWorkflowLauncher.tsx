"use client";

import { useCallback, useEffect, useState } from "react";
import { GitBranch, Loader2, Play, Workflow } from "lucide-react";
import type {
  HermesWorkflowHistory,
  HermesWorkflowJob,
  HermesWorkflowResult,
  HermesWorkflowStep,
} from "@/lib/ops/hermesAgents";

const defaultGoal =
  "Cosmic Hustle 프로젝트 실행 테스트. plan은 11명 업무 배정을 만들고, 선택된 직원들은 각자 산출물을 내고, wiki는 결과를 정리해줘.";

function StepCard({ step }: { step: HermesWorkflowStep }) {
  const statusCls =
    step.status === "done"
      ? "border-emerald-300/30 text-emerald-200"
      : step.status === "running"
        ? "border-sky-300/30 text-sky-200"
        : step.status === "failed"
          ? "border-red-300/30 text-red-200"
          : "border-white/10 text-zinc-500";

  return (
    <div className="flex items-start justify-between gap-2 rounded border border-white/10 bg-[#0f1216] px-2.5 py-2">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-zinc-200">{step.agentId}</p>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-zinc-600">
          {step.run?.response ?? step.error ?? "대기 중"}
        </p>
      </div>
      <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[11px] ${statusCls}`}>
        {step.status}
      </span>
    </div>
  );
}

function WorkflowResultPanel({
  w,
  currentAgentId,
}: {
  w: HermesWorkflowResult;
  currentAgentId?: string | null;
}) {
  const statusCls =
    w.status === "done"
      ? "border-emerald-300/30 text-emerald-200"
      : w.status === "running"
        ? "border-sky-300/30 text-sky-200"
        : w.status === "failed"
          ? "border-red-300/30 text-red-200"
          : "border-white/10 text-zinc-400";

  return (
    <div className="space-y-2 rounded-md border border-white/10 bg-[#0f1216] p-3">
      {/* status row */}
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span
          className={`rounded border px-2 py-0.5 font-semibold ${
            w.dryRun
              ? "border-amber-300/30 text-amber-300"
              : "border-violet-300/30 text-violet-300"
          }`}
        >
          {w.dryRun ? "dry" : "real"}
        </span>
        <span className={`rounded border px-2 py-0.5 ${statusCls}`}>{w.status}</span>
        {w.durationMs ? <span className="text-zinc-600">{w.durationMs}ms</span> : null}
        {currentAgentId ? <span className="text-zinc-500">→ {currentAgentId}</span> : null}
      </div>

      {/* steps */}
      {w.steps.length > 0 && (
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {w.steps.map((step) => (
            <StepCard key={step.agentId} step={step} />
          ))}
        </div>
      )}

      {/* project note paths */}
      {w.project?.notePaths.length ? (
        <div className="rounded border border-white/10 bg-[#0b0d10] px-2.5 py-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
            프로젝트 노트
          </p>
          <div className="space-y-0.5">
            {w.project.notePaths.map((p) => (
              <p key={p} className="truncate font-mono text-[11px] text-emerald-300/80">
                {p}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      {/* vault handoff path */}
      {w.vaultNotePath ? (
        <div className="flex items-center gap-2 rounded border border-white/10 bg-[#0b0d10] px-2.5 py-2">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
            Handoff
          </span>
          <p className="truncate font-mono text-[11px] text-violet-300/80">{w.vaultNotePath}</p>
        </div>
      ) : null}
    </div>
  );
}

export default function HermesWorkflowLauncher() {
  const [goal, setGoal] = useState(defaultGoal);
  const [dryRun, setDryRun] = useState(true);
  const [maxAgents, setMaxAgents] = useState(1);
  const [workflow, setWorkflow] = useState<HermesWorkflowResult | null>(null);
  const [job, setJob] = useState<HermesWorkflowJob | null>(null);
  const [history, setHistory] = useState<HermesWorkflowHistory | null>(null);
  const [error, setError] = useState("");

  const refreshHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/ops/hermes/workflow");
      if (!response.ok) return;
      setHistory((await response.json()) as HermesWorkflowHistory);
    } catch {
      setHistory(null);
    }
  }, []);

  const refreshJob = useCallback(
    async (jobId: string, isCancelled: () => boolean) => {
      try {
        const response = await fetch(
          `/api/ops/hermes/workflow?jobId=${encodeURIComponent(jobId)}`,
        );
        if (!response.ok || isCancelled()) return;
        const nextJob = (await response.json()) as HermesWorkflowJob;
        setJob(nextJob);
        setWorkflow(nextJob.workflow);
        if (nextJob.status !== "queued" && nextJob.status !== "running") {
          await refreshHistory();
        }
      } catch {
        if (!isCancelled()) setError("워크플로우 상태를 불러오지 못했습니다.");
      }
    },
    [refreshHistory],
  );

  useEffect(() => {
    const t = window.setTimeout(() => void refreshHistory(), 0);
    return () => window.clearTimeout(t);
  }, [refreshHistory]);

  useEffect(() => {
    if (!job || (job.status !== "queued" && job.status !== "running")) return;
    let cancelled = false;
    const isCancelled = () => cancelled;
    const interval = window.setInterval(() => void refreshJob(job.id, isCancelled), 2000);
    const initial = window.setTimeout(() => void refreshJob(job.id, isCancelled), 0);
    return () => {
      cancelled = true;
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [job, refreshJob]);

  async function submitWorkflow() {
    const isRunning = job?.status === "queued" || job?.status === "running";
    if (!goal.trim() || isRunning) return;
    setError("");
    setWorkflow(null);
    setJob(null);
    try {
      const response = await fetch("/api/ops/hermes/workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, mode: "project", maxAgents, dryRun }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? data.error ?? `HTTP ${response.status}`);
      }
      const nextJob = data as HermesWorkflowJob;
      setJob(nextJob);
      setWorkflow(nextJob.workflow);
      await refreshHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hermes workflow failed");
    }
  }

  const isRunning = job?.status === "queued" || job?.status === "running";
  const activeWorkflow =
    workflow ?? history?.activeJobs[0]?.workflow ?? history?.workflows[0] ?? null;
  const estimatedCalls = maxAgents + 2; // plan + workers + wiki

  return (
    <div className="rounded-md border border-white/10 bg-[#14181d]">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-white">헤르메스 팀 워크플로우</h2>
          <p className="text-xs text-zinc-500">
            {dryRun ? "토큰 0 · vault 기록 테스트" : `Hermes 호출 사용 · 예상 ${estimatedCalls}회`}
          </p>
        </div>
        <button
          type="button"
          onClick={submitWorkflow}
          disabled={isRunning || !goal.trim()}
          className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 ${
            dryRun ? "bg-emerald-300" : "bg-amber-300"
          }`}
        >
          {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {dryRun ? "테스트 실행" : "실제 팀 실행"}
        </button>
      </div>

      <div className="grid gap-3 p-4 xl:grid-cols-[1fr_300px]">
        {/* left: controls + result */}
        <div className="space-y-3">
          <label className="block">
            <span className="sr-only">Workflow goal</span>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="min-h-[96px] w-full resize-y rounded-md border border-white/10 bg-[#0f1216] p-3 text-sm leading-6 text-zinc-200 outline-none transition focus:border-emerald-300/50"
            />
          </label>

          {/* mode + agents */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-md border border-white/10 bg-[#0f1216] p-1">
              <button
                type="button"
                onClick={() => setDryRun(true)}
                className={`h-7 rounded px-3 text-xs font-semibold transition ${
                  dryRun ? "bg-emerald-300 text-zinc-950" : "text-zinc-400"
                }`}
              >
                테스트 실행
              </button>
              <button
                type="button"
                onClick={() => setDryRun(false)}
                className={`h-7 rounded px-3 text-xs font-semibold transition ${
                  !dryRun ? "bg-amber-300 text-zinc-950" : "text-zinc-400"
                }`}
              >
                실제 실행
              </button>
            </div>

            {!dryRun && (
              <span className="text-[11px] text-amber-400/80">
                plan + 직원 {maxAgents}명 + wiki = {estimatedCalls}회
              </span>
            )}

            <label className="ml-auto inline-flex h-9 items-center gap-2 rounded-md border border-white/10 bg-[#0f1216] px-3 text-xs text-zinc-400">
              직원 수
              <select
                value={maxAgents}
                onChange={(e) => setMaxAgents(Number(e.target.value))}
                className="bg-transparent text-sm font-semibold text-zinc-100 outline-none"
              >
                {[1, 2, 3, 4].map((v) => (
                  <option key={v} value={v} className="bg-[#0f1216]">
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error ? (
            <div className="rounded-md border border-red-300/20 bg-red-950/20 p-3 text-sm leading-6 text-red-100">
              {error}
            </div>
          ) : null}

          {activeWorkflow ? (
            <WorkflowResultPanel w={activeWorkflow} currentAgentId={job?.currentAgentId} />
          ) : null}
        </div>

        {/* right: history */}
        <div className="rounded-md border border-white/10 bg-[#0f1216]">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
              워크플로우 기록
            </p>
            <Workflow className="h-4 w-4 text-zinc-500" />
          </div>
          <div className="divide-y divide-white/10">
            {history?.activeJobs.length
              ? history.activeJobs.map((item) => (
                  <div key={item.id} className="grid gap-1 bg-sky-300/[0.04] px-3 py-2">
                    <div className="flex items-center gap-2 text-[11px]">
                      <span
                        className={`rounded border px-1.5 py-0.5 font-semibold ${
                          item.workflow.dryRun
                            ? "border-amber-300/20 text-amber-400"
                            : "border-violet-300/20 text-violet-400"
                        }`}
                      >
                        {item.workflow.dryRun ? "dry" : "real"}
                      </span>
                      <span className="font-semibold text-sky-200">{item.status}</span>
                      <span className="ml-auto text-zinc-500">
                        {item.currentAgentId ?? "대기"}
                      </span>
                    </div>
                    <p className="truncate text-xs text-zinc-400">{item.goal}</p>
                  </div>
                ))
              : null}

            {history?.workflows.length ? (
              history.workflows.map((item) => (
                <div key={item.id} className="grid gap-1 px-3 py-2">
                  <div className="flex items-center gap-2 text-[11px]">
                    <span
                      className={`rounded border px-1.5 py-0.5 font-semibold ${
                        item.dryRun
                          ? "border-amber-300/20 text-amber-400"
                          : "border-violet-300/20 text-violet-400"
                      }`}
                    >
                      {item.dryRun ? "dry" : "real"}
                    </span>
                    <span className="font-semibold text-zinc-200">{item.status}</span>
                    <span className="ml-auto text-zinc-500">
                      {new Date(item.completedAt).toLocaleTimeString("ko-KR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="truncate text-xs text-zinc-400">{item.goal}</p>
                  {item.project?.notePaths.length ? (
                    <div className="mt-0.5 space-y-0.5">
                      {item.project.notePaths.map((p) => (
                        <p key={p} className="truncate font-mono text-[11px] text-emerald-300/70">
                          {p}
                        </p>
                      ))}
                    </div>
                  ) : null}
                  {item.vaultNotePath ? (
                    <p className="truncate font-mono text-[11px] text-violet-300/70">
                      {item.vaultNotePath}
                    </p>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="flex gap-3 px-3 py-4">
                <GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
                <p className="text-sm leading-5 text-zinc-500">
                  아직 팀 워크플로우 실행 기록이 없습니다.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
