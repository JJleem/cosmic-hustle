"use client";

import { useEffect, useState } from "react";
import { GitBranch, Loader2, RefreshCw, UploadCloud } from "lucide-react";
import type { VaultSyncResult, VaultSyncStatus } from "@/app/api/ops/vault/sync/route";

export default function VaultSyncPanel() {
  const [status, setStatus] = useState<VaultSyncStatus | null>(null);
  const [result, setResult] = useState<VaultSyncResult | null>(null);
  const [error, setError] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/ops/vault/sync");
      if (res.ok) setStatus(await res.json());
    } catch {
      setStatus(null);
    } finally {
      setIsRefreshing(false);
    }
  }

  async function doSync() {
    if (isSyncing) return;
    setIsSyncing(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/ops/vault/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
      setResult(data as VaultSyncResult);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync 실패");
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div className="rounded-md border border-white/10 bg-[#14181d]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Vault Sync</h2>
          <p className="text-xs text-zinc-500">logs · projects · knowledge · agents만 커밋/푸시</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            disabled={isRefreshing}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-zinc-400 hover:text-zinc-200 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            onClick={doSync}
            disabled={isSyncing || !status?.canSync}
            className="inline-flex h-8 items-center gap-2 rounded-md bg-violet-400 px-3 text-sm font-semibold text-zinc-950 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSyncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <UploadCloud className="h-3.5 w-3.5" />
            )}
            Vault Sync
          </button>
        </div>
      </div>

      <div className="space-y-3 p-4">
        {/* 연결 상태 */}
        {status && (
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`h-2 w-2 rounded-full ${status.available ? "bg-emerald-400" : "bg-red-400"}`}
            />
            <span className="text-zinc-400">
              {status.available ? "볼트 연결됨" : "볼트 연결 불가"}
            </span>
            {status.available && (
              <>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-500">
                  {status.pendingFiles.length > 0
                    ? `${status.pendingFiles.length}개 파일 대기 중`
                    : "동기화할 파일 없음"}
                </span>
              </>
            )}
          </div>
        )}

        {/* 대기 파일 미리보기 */}
        {status?.pendingFiles.length ? (
          <div className="divide-y divide-white/[0.06] rounded-md border border-white/10 bg-[#0f1216]">
            {status.pendingFiles.map((f) => (
              <div key={f} className="flex items-center gap-2 px-3 py-2">
                <GitBranch className="h-3.5 w-3.5 shrink-0 text-violet-300" />
                <p className="truncate text-sm text-zinc-300">{f}</p>
              </div>
            ))}
          </div>
        ) : null}

        {/* 에러 */}
        {error ? (
          <div className="rounded-md border border-red-300/20 bg-red-950/20 p-3 text-sm leading-6 text-red-100">
            {error}
          </div>
        ) : null}

        {/* 성공 결과 */}
        {result ? (
          <div className="space-y-2 rounded-md border border-emerald-300/20 bg-emerald-300/[0.06] p-3">
            <p className="text-xs font-semibold text-emerald-300">푸시 완료</p>
            <p className="text-xs text-zinc-500">{result.commitMessage}</p>
            <div className="space-y-1">
              {result.committed.map((f) => (
                <p key={f} className="truncate text-xs text-zinc-400">{f}</p>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
