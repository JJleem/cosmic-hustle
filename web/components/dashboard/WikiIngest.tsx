"use client";

import { useState, useRef } from "react";
import { Upload, FileText, Loader } from "lucide-react";

type Status = "idle" | "loading" | "done" | "error";

export default function WikiIngest() {
  const [text, setText] = useState("");
  const [filename, setFilename] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const ingest = async (content: string, name: string) => {
    setStatus("loading");
    setMessage("위키 대리에게 전달 중...");

    try {
      const res = await fetch("/api/wiki/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, filename: name || "document" }),
      });

      if (!res.ok || !res.body) throw new Error("ingest 실패");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6)) as { type: string; message?: string };
            if (event.type === "agent_message" && event.message) {
              setMessage(event.message);
            } else if (event.type === "agent_done") {
              setMessage(event.message ?? "저장 완료");
            } else if (event.type === "complete") {
              setStatus("done");
              setMessage("위키에 저장됐어요.");
              setText("");
              setFilename("");
            } else if (event.type === "error") {
              throw new Error(event.message);
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "오류 발생");
    }
  };

  const handleFile = async (file: File) => {
    const content = await file.text();
    const name = file.name.replace(/\.[^.]+$/, "");
    setFilename(name);
    setText(content);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="flex flex-col h-full gap-3">
      <p className="text-[10px] text-slate-300 tracking-[0.2em] uppercase font-bold shrink-0">
        위키 인제스트
      </p>

      {/* 파일 드롭 존 */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileRef.current?.click()}
        className="shrink-0 border border-dashed border-slate-500 hover:border-slate-300 rounded-xl p-3 flex items-center gap-2 cursor-pointer transition-colors group"
      >
        <Upload size={13} className="text-slate-400 group-hover:text-slate-200 shrink-0" />
        <span className="text-xs text-slate-400 group-hover:text-slate-200">
          파일 드래그 또는 클릭 (.md .txt .pdf)
        </span>
        <input
          ref={fileRef}
          type="file"
          accept=".md,.txt,.csv"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
      </div>

      {/* 파일명 */}
      <input
        type="text"
        value={filename}
        onChange={(e) => setFilename(e.target.value)}
        placeholder="파일명 (선택)"
        className="shrink-0 bg-slate-700/60 border border-slate-500 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-slate-300 transition-colors"
      />

      {/* 텍스트 직접 입력 */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="또는 텍스트 직접 붙여넣기..."
        className="flex-1 min-h-0 bg-slate-700/60 border border-slate-500 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-slate-300 transition-colors resize-none"
      />

      {/* 상태 메시지 */}
      {status !== "idle" && (
        <div className={`shrink-0 flex items-center gap-2 text-xs px-3 py-2 rounded-xl border ${
          status === "error" ? "border-red-500/40 bg-red-900/20 text-red-300" :
          status === "done" ? "border-green-500/40 bg-green-900/20 text-green-300" :
          "border-slate-500 bg-slate-700/40 text-slate-300"
        }`}>
          {status === "loading" && <Loader size={11} className="animate-spin shrink-0" />}
          <span>{message}</span>
        </div>
      )}

      <button
        onClick={() => { if (text.trim()) ingest(text.trim(), filename); }}
        disabled={!text.trim() || status === "loading"}
        className="shrink-0 bg-slate-600 hover:bg-slate-500 disabled:opacity-30 border border-slate-500 rounded-xl px-4 py-2 text-xs text-white font-medium transition-colors flex items-center justify-center gap-2"
      >
        <FileText size={12} />
        위키에 저장
      </button>
    </div>
  );
}
