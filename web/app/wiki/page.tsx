"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, FolderOpen, FileText, CheckCircle2, XCircle, Loader2, Library } from "lucide-react";

type FileStatus = "pending" | "processing" | "done" | "error";

interface WikiFile {
  handle: FileSystemFileHandle;
  name: string;
  path: string;
  status: FileStatus;
  error?: string;
}

interface IngestResult {
  concept: { filename: string; content: string };
  source: { filename: string; content: string };
}

async function readAllMdTxt(
  dir: FileSystemDirectoryHandle,
  prefix = ""
): Promise<{ handle: FileSystemFileHandle; name: string; path: string }[]> {
  const results: { handle: FileSystemFileHandle; name: string; path: string }[] = [];
  for await (const [name, entry] of dir.entries()) {
    if (entry.kind === "directory" && !name.startsWith(".")) {
      const sub = await readAllMdTxt(entry as FileSystemDirectoryHandle, prefix ? `${prefix}/${name}` : name);
      results.push(...sub);
    } else if (entry.kind === "file" && (name.endsWith(".md") || name.endsWith(".txt"))) {
      results.push({ handle: entry as FileSystemFileHandle, name, path: prefix ? `${prefix}/${name}` : name });
    }
  }
  return results;
}

async function ensureDir(root: FileSystemDirectoryHandle, path: string): Promise<FileSystemDirectoryHandle> {
  const parts = path.split("/").filter(Boolean);
  let cur = root;
  for (const part of parts) {
    cur = await cur.getDirectoryHandle(part, { create: true });
  }
  return cur;
}

async function writeFile(dir: FileSystemDirectoryHandle, filename: string, content: string) {
  const file = await dir.getFileHandle(filename, { create: true });
  const writable = await file.createWritable();
  await writable.write(content);
  await writable.close();
}

export default function WikiPage() {
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [files, setFiles] = useState<WikiFile[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const abortRef = useRef(false);

  const connectFolder = useCallback(async () => {
    setConnectError(null);
    try {
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });

      try {
        await ensureDir(handle, "wiki/concepts");
        await ensureDir(handle, "wiki/sources");
      } catch (e) {
        setConnectError(`폴더 생성 실패: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }

      let found: { handle: FileSystemFileHandle; name: string; path: string }[] = [];
      try {
        found = await readAllMdTxt(handle);
      } catch (e) {
        setConnectError(`파일 읽기 실패: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }

      // wiki/ 하위 파일은 제외 (이미 변환된 결과물)
      const filtered = found.filter((f) => !f.path.startsWith("wiki/"));

      setDirHandle(handle);
      setFiles(filtered.map((f) => ({ ...f, status: "pending" })));
      setDone(false);
    } catch (e) {
      // AbortError = 사용자 취소, 그 외는 표시
      if (e instanceof Error && e.name !== "AbortError") {
        setConnectError(e.message);
      }
    }
  }, []);

  const startIngest = useCallback(async () => {
    if (!dirHandle || running) return;
    setRunning(true);
    abortRef.current = false;

    const wikiDir = await dirHandle.getDirectoryHandle("wiki", { create: true });
    const conceptsDir = await wikiDir.getDirectoryHandle("concepts", { create: true });
    const sourcesDir = await wikiDir.getDirectoryHandle("sources", { create: true });

    for (let i = 0; i < files.length; i++) {
      if (abortRef.current) break;

      setFiles((prev) => prev.map((f, idx) => idx === i ? { ...f, status: "processing" } : f));

      try {
        const fileObj = await files[i].handle.getFile();
        const content = await fileObj.text();

        const res = await fetch("/api/wiki/ingest-local", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: files[i].name, content }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: IngestResult = await res.json();

        // concept 파일 저장
        await writeFile(conceptsDir, data.concept.filename, data.concept.content);
        // source 파일 저장
        await writeFile(sourcesDir, data.source.filename.replace("sources/", ""), data.source.content);

        setFiles((prev) => prev.map((f, idx) => idx === i ? { ...f, status: "done" } : f));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setFiles((prev) => prev.map((f, idx) => idx === i ? { ...f, status: "error", error: msg } : f));
      }
    }

    setRunning(false);
    setDone(true);
  }, [dirHandle, files, running]);

  const doneCount = files.filter((f) => f.status === "done").length;
  const errorCount = files.filter((f) => f.status === "error").length;

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "#07091a", color: "#e2e8f0" }}
    >
      {/* 헤더 */}
      <header
        className="shrink-0 px-6 py-2.5 flex items-center gap-3"
        style={{
          borderBottom: "1px solid rgba(99,60,220,0.12)",
          background: "rgba(5,7,20,0.88)",
          backdropFilter: "blur(24px)",
        }}
      >
        <Link
          href="/"
          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-300 transition-colors text-xs"
        >
          <ArrowLeft size={12} />
          <span>오피스로</span>
        </Link>
        <div className="flex items-center gap-2 ml-2">
          <Library size={14} style={{ color: "#c4b5fd" }} />
          <span className="text-sm font-semibold tracking-wide" style={{ color: "#c4b5fd" }}>
            개인 위키
          </span>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-start px-6 py-12 max-w-2xl mx-auto w-full">
        {!dirHandle ? (
          /* 온보딩 */
          <div className="flex flex-col items-center gap-6 text-center mt-16">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)" }}
            >
              <FolderOpen size={32} style={{ color: "#a78bfa" }} />
            </div>
            <div>
              <h2 className="text-xl font-semibold mb-2" style={{ color: "#e2e8f0" }}>
                로컬 폴더를 연결하세요
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "#64748b" }}>
                .md · .txt 파일이 있는 폴더를 연결하면
                <br />
                <span style={{ color: "#a78bfa" }}>wiki/concepts/</span>와{" "}
                <span style={{ color: "#a78bfa" }}>wiki/sources/</span>가 자동 생성됩니다.
              </p>
            </div>
            <button
              onClick={connectFolder}
              className="flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold transition-all"
              style={{
                background: "linear-gradient(135deg, rgba(109,40,217,0.6) 0%, rgba(79,70,229,0.6) 100%)",
                color: "#c4b5fd",
                border: "1px solid rgba(139,92,246,0.35)",
                boxShadow: "0 0 20px rgba(109,40,217,0.2)",
              }}
            >
              <FolderOpen size={14} />
              폴더 연결
            </button>
            {connectError && (
              <div
                className="w-full max-w-sm px-4 py-2.5 rounded-xl text-xs text-center"
                style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}
              >
                {connectError}
              </div>
            )}
            <p className="text-xs" style={{ color: "#334155" }}>
              파일은 로컬에만 저장됩니다. 서버 DB에 원본을 저장하지 않습니다.
            </p>
          </div>
        ) : (
          /* 연결된 상태 */
          <div className="w-full flex flex-col gap-4">
            {/* 상단 요약 */}
            <div
              className="flex items-center justify-between px-4 py-3 rounded-xl"
              style={{ background: "rgba(139,92,246,0.05)", border: "1px solid rgba(139,92,246,0.15)" }}
            >
              <div className="flex items-center gap-2 text-sm">
                <FolderOpen size={14} style={{ color: "#a78bfa" }} />
                <span style={{ color: "#a78bfa" }}>{dirHandle.name}</span>
                <span style={{ color: "#334155" }}>·</span>
                <span style={{ color: "#64748b" }}>{files.length}개 파일</span>
              </div>
              <div className="flex items-center gap-2">
                {done && (
                  <span className="text-xs" style={{ color: "#34d399" }}>
                    완료 {doneCount} / 오류 {errorCount}
                  </span>
                )}
                <button
                  onClick={connectFolder}
                  className="text-xs px-3 py-1 rounded-full transition-all"
                  style={{ color: "#475569", border: "1px solid rgba(255,255,255,0.07)" }}
                >
                  폴더 변경
                </button>
              </div>
            </div>

            {/* 파일 목록 */}
            {files.length === 0 ? (
              <div className="text-center py-12 text-sm" style={{ color: "#334155" }}>
                .md / .txt 파일이 없습니다
              </div>
            ) : (
              <div
                className="rounded-xl overflow-hidden"
                style={{ border: "1px solid rgba(255,255,255,0.05)" }}
              >
                {files.map((f) => (
                  <div
                    key={f.path}
                    className="flex items-center gap-3 px-4 py-2.5"
                    style={{
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                      background:
                        f.status === "processing"
                          ? "rgba(139,92,246,0.05)"
                          : f.status === "done"
                          ? "rgba(52,211,153,0.03)"
                          : f.status === "error"
                          ? "rgba(239,68,68,0.04)"
                          : "transparent",
                    }}
                  >
                    <StatusIcon status={f.status} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate" style={{ color: "#cbd5e1" }}>
                        {f.name}
                      </div>
                      {f.path !== f.name && (
                        <div className="text-[10px] truncate" style={{ color: "#334155" }}>
                          {f.path}
                        </div>
                      )}
                    </div>
                    {f.status === "error" && f.error && (
                      <span className="text-[10px] shrink-0" style={{ color: "#f87171" }}>
                        {f.error}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 실행 버튼 */}
            {!done && files.length > 0 && (
              <button
                onClick={startIngest}
                disabled={running}
                className="w-full py-3 rounded-xl text-sm font-semibold transition-all"
                style={
                  running
                    ? { background: "rgba(255,255,255,0.03)", color: "#334155", border: "1px solid rgba(255,255,255,0.05)" }
                    : {
                        background: "linear-gradient(135deg, rgba(109,40,217,0.6) 0%, rgba(79,70,229,0.6) 100%)",
                        color: "#c4b5fd",
                        border: "1px solid rgba(139,92,246,0.35)",
                        boxShadow: "0 0 20px rgba(109,40,217,0.15)",
                      }
                }
              >
                {running ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    인제스트 중…
                  </span>
                ) : (
                  `위키로 변환 (${files.length}개)`
                )}
              </button>
            )}

            {done && (
              <div
                className="text-center py-4 rounded-xl text-sm"
                style={{
                  background: "rgba(52,211,153,0.05)",
                  border: "1px solid rgba(52,211,153,0.15)",
                  color: "#34d399",
                }}
              >
                완료! <span style={{ color: "#64748b" }}>wiki/concepts/ 와 wiki/sources/ 를 확인하세요.</span>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function StatusIcon({ status }: { status: FileStatus }) {
  if (status === "done") return <CheckCircle2 size={14} style={{ color: "#34d399", flexShrink: 0 }} />;
  if (status === "error") return <XCircle size={14} style={{ color: "#f87171", flexShrink: 0 }} />;
  if (status === "processing") return <Loader2 size={14} style={{ color: "#a78bfa", flexShrink: 0 }} className="animate-spin" />;
  return <FileText size={14} style={{ color: "#334155", flexShrink: 0 }} />;
}
