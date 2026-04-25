"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, FileText, ChevronRight, ArrowLeft } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { WikiFile } from "@/app/api/wiki/route";

const CATEGORY_LABEL: Record<string, string> = {
  root: "일반",
  concepts: "개념",
  sources: "소스",
};

const CATEGORY_COLOR: Record<string, string> = {
  root: "#94a3b8",
  concepts: "#a78bfa",
  sources: "#67e8f9",
};

export default function WikiViewer() {
  const [files, setFiles] = useState<WikiFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<WikiFile | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/wiki");
      const data = await res.json() as { files: WikiFile[] };
      setFiles(data.files ?? []);
    } catch {
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  const openFile = async (file: WikiFile) => {
    setSelected(file);
    setContent(null);
    setContentLoading(true);
    try {
      const res = await fetch(`/api/wiki/content?path=${encodeURIComponent(file.path)}`);
      const data = await res.json() as { content?: string; error?: string };
      setContent(data.content ?? null);
    } catch {
      setContent(null);
    } finally {
      setContentLoading(false);
    }
  };

  const categories = ["all", ...Array.from(new Set(files.map((f) => f.category)))];
  const filtered = activeCategory === "all" ? files : files.filter((f) => f.category === activeCategory);

  // 파일 목록 뷰
  if (!selected) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between mb-3 shrink-0">
          <p className="text-[10px] text-slate-300 tracking-[0.2em] uppercase font-bold">
            위키 지식 베이스
          </p>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-slate-500">{files.length}개 문서</span>
            <button
              onClick={fetchFiles}
              disabled={loading}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* 카테고리 탭 */}
        {files.length > 0 && (
          <div className="flex gap-1 mb-3 shrink-0 flex-wrap">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className="px-2.5 py-1 rounded-full text-[9px] font-medium transition-all"
                style={
                  activeCategory === cat
                    ? { background: `${CATEGORY_COLOR[cat] ?? "#94a3b8"}25`, color: CATEGORY_COLOR[cat] ?? "#94a3b8", border: `1px solid ${CATEGORY_COLOR[cat] ?? "#94a3b8"}50` }
                    : { background: "transparent", color: "#475569", border: "1px solid #334155" }
                }
              >
                {cat === "all" ? "전체" : CATEGORY_LABEL[cat] ?? cat}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-slate-600 border-t-slate-300 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-slate-500 text-xs">문서 없음</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-1 scrollbar-hide">
            {filtered.map((file) => (
              <button
                key={file.path}
                onClick={() => openFile(file)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-slate-700/60 bg-slate-800/40 hover:bg-slate-700/50 hover:border-slate-600 transition-all text-left group"
              >
                <FileText size={11} style={{ color: CATEGORY_COLOR[file.category] ?? "#94a3b8" }} className="shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-slate-200 truncate group-hover:text-white transition-colors">
                    {file.name.replace(".md", "").replace(/_/g, " ")}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded-full"
                      style={{ background: `${CATEGORY_COLOR[file.category] ?? "#94a3b8"}15`, color: CATEGORY_COLOR[file.category] ?? "#94a3b8" }}
                    >
                      {CATEGORY_LABEL[file.category] ?? file.category}
                    </span>
                    <span className="text-[9px] text-slate-500">
                      {(file.size / 1024).toFixed(1)}KB
                    </span>
                    <span className="text-[9px] text-slate-600">
                      {new Date(file.updatedAt * 1000).toLocaleDateString("ko-KR")}
                    </span>
                  </div>
                </div>
                <ChevronRight size={10} className="text-slate-600 group-hover:text-slate-400 transition-colors shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // 파일 내용 뷰
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <button
          onClick={() => { setSelected(null); setContent(null); }}
          className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={12} />
          <span className="text-[10px]">목록</span>
        </button>
        <div className="w-px h-3 bg-slate-700" />
        <p className="text-[10px] text-slate-300 font-medium truncate flex-1">
          {selected.name.replace(".md", "").replace(/_/g, " ")}
        </p>
        <span
          className="text-[9px] px-1.5 py-0.5 rounded-full shrink-0"
          style={{ background: `${CATEGORY_COLOR[selected.category] ?? "#94a3b8"}15`, color: CATEGORY_COLOR[selected.category] ?? "#94a3b8" }}
        >
          {CATEGORY_LABEL[selected.category] ?? selected.category}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {contentLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-4 h-4 border-2 border-slate-600 border-t-slate-300 rounded-full animate-spin" />
          </div>
        ) : content === null ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-slate-500 text-xs">파일을 불러올 수 없어요</p>
          </div>
        ) : (
          <div className="report-body text-[11px] text-slate-300 leading-relaxed">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
