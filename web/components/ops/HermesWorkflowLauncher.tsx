"use client";

import { useCallback, useEffect, useState } from "react";
import { GitBranch, Loader2, Play, Workflow } from "lucide-react";
import type {
  HermesWorkflowHistory,
  HermesWorkflowJob,
  HermesWorkflowResult,
} from "@/lib/ops/hermesAgents";

const defaultGoal =
  "Cosmic Hustle 프로젝트 실행 테스트. plan은 11명 업무 배정을 만들고, 선택된 직원들은 각자 산출물을 내고, wiki는 결과를 정리해줘.";

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
      const response = await fetch(`/api/ops/hermes/workflow?jobId=${encodeURIComponent(jobId)}`);
      if (!response.ok || isCancelled()) return;
      const nextJob = (await response.json()) as HermesWorkflowJob;
      setJob(nextJob);
      setWorkflow(nextJob.workflow);
      if (nextJob.status !== "queued" && nextJob.status !== "running") {
        await refreshHistory();
      }
    } catch {
      if (!isCancelled()) {
        setError("워크플로우 상태를 불러오지 못했습니다.");
      }
    }
    },
    [refreshHistory],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void refreshHistory();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [refreshHistory]);

  useEffect(() => {
    if (!job || (job.status !== "queued" && job.status !== "running")) return;

    let cancelled = false;
    const isCancelled = () => cancelled;
    const interval = window.setInterval(() => {
      void refreshJob(job.id, isCancelled);
    }, 2000);

    const initialPoll = window.setTimeout(() => {
      void refreshJob(job.id, isCancelled);
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(initialPoll);
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
  const activeWorkflow = workflow ?? history?.activeJobs[0]?.workflow ?? history?.workflows[0] ?? null;

  return (
    <div className="rounded-md border border-white/10 bg-[#14181d]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-white">헤르메스 팀 워크플로우</h2>
          <p className="text-xs text-zinc-500">
            프로젝트: plan → assigned agents → wiki · {dryRun ? "테스트 실행" : "실제 실행"}
          </p>
        </div>
        <button
          type="button"
          onClick={submitWorkflow}
          disabled={isRunning || !goal.trim()}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-300 px-3 text-sm font-semibold text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          팀 실행
        </button>
      </div>

      <div className="grid gap-3 p-4 xl:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <label className="block">
            <span className="sr-only">Workflow goal</span>
            <textarea
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              className="min-h-[104px] w-full resize-y rounded-md border border-white/10 bg-[#0f1216] p-3 text-sm leading-6 text-zinc-200 outline-none transition focus:border-emerald-300/50"
            />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-md border border-white/10 bg-[#0f1216] p-1">
              <button
                type="button"
                onClick={() => setDryRun(true)}
                className={`h-8 rounded px-3 text-xs font-semibold ${
                  dryRun ? "bg-emerald-300 text-zinc-950" : "text-zinc-400"
                }`}
              >
                테스트 실행
              </button>
              <button
                type="button"
                onClick={() => setDryRun(false)}
                className={`h-8 rounded px-3 text-xs font-semibold ${
                  !dryRun ? "bg-amber-300 text-zinc-950" : "text-zinc-400"
                }`}
              >
                실제 실행
              </button>
            </div>

            <label className="inline-flex h-10 items-center gap-2 rounded-md border border-white/10 bg-[#0f1216] px-3 text-xs text-zinc-400">
              직원 수
              <select
                value={maxAgents}
                onChange={(event) => setMaxAgents(Number(event.target.value))}
                className="bg-transparent text-sm font-semibold text-zinc-100 outline-none"
              >
                {[1, 2, 3, 4].map((value) => (
                  <option key={value} value={value} className="bg-[#0f1216]">
                    {value}
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
            <div className="rounded-md border border-emerald-300/20 bg-emerald-300/[0.06] p-3">
              <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                <span>{activeWorkflow.status}</span>
                {activeWorkflow.dryRun ? <span>dryRun</span> : null}
                {job?.currentAgentId ? <span>현재: {job.currentAgentId}</span> : null}
                <span>{activeWorkflow.durationMs}ms</span>
                {activeWorkflow.vaultNotePath ? <span>{activeWorkflow.vaultNotePath}</span> : null}
              </div>
              {activeWorkflow.project?.notePaths.length ? (
                <div className="mb-3 rounded-md border border-white/10 bg-[#0f1216] p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    프로젝트 노트
                  </p>
                  <div className="mt-2 grid gap-1">
                    {activeWorkflow.project.notePaths.map((notePath) => (
                      <p key={notePath} className="truncate text-xs text-emerald-300">
                        {notePath}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="grid gap-2 md:grid-cols-3">
                {activeWorkflow.steps.map((step) => (
                  <div key={step.agentId} className="rounded-md border border-white/10 bg-[#0f1216] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-zinc-100">{step.agentId}</p>
                      <span
                        className={`rounded border px-2 py-1 text-[11px] ${
                          step.status === "done"
                            ? "border-emerald-300/30 text-emerald-200"
                            : step.status === "running"
                              ? "border-sky-300/30 text-sky-200"
                            : "border-amber-300/30 text-amber-100"
                        }`}
                      >
                        {step.status}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-3 text-xs leading-5 text-zinc-500">
                      {step.run?.response ?? step.error ?? "대기 중"}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-md border border-white/10 bg-[#0f1216] p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  다음 액션
                </p>
                <p className="mt-2 text-sm leading-6 text-zinc-300">{activeWorkflow.nextAction}</p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-md border border-white/10 bg-[#0f1216]">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
              워크플로우 기록
            </p>
            <Workflow className="h-4 w-4 text-zinc-500" />
          </div>
          <div className="divide-y divide-white/10">
            {history?.activeJobs.length ? (
              history.activeJobs.map((item) => (
                <div key={item.id} className="grid gap-1 bg-sky-300/[0.04] px-3 py-2">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-semibold text-sky-200">{item.status}</span>
                    <span className="shrink-0 text-zinc-500">
                      {item.currentAgentId ? item.currentAgentId : "대기"}
                    </span>
                  </div>
                  <p className="truncate text-sm text-zinc-400">{item.goal}</p>
                </div>
              ))
            ) : null}
            {history?.workflows.length ? (
              history.workflows.map((item) => (
                <div key={item.id} className="grid gap-1 px-3 py-2">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-semibold text-zinc-200">{item.status}</span>
                    <span className="shrink-0 text-zinc-500">
                      {new Date(item.completedAt).toLocaleTimeString("ko-KR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="truncate text-sm text-zinc-400">{item.goal}</p>
                  {item.vaultNotePath ? (
                    <p className="truncate text-xs text-emerald-300">{item.vaultNotePath}</p>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="flex gap-3 px-3 py-4">
                <GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
                <p className="text-sm leading-5 text-zinc-500">아직 팀 워크플로우 실행 기록이 없습니다.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
