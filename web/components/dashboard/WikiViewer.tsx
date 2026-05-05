"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw, FileText, ChevronRight, ArrowLeft, Search, Copy, Check, Tag, Loader } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { WikiFile } from "@/app/api/wiki/route";
import type { SearchMatch } from "@/app/api/wiki/search/route";

const CATEGORY_LABEL: Record<string, string> = { root: "일반", concepts: "개념", sources: "소스" };
const CATEGORY_COLOR: Record<string, string> = { root: "#94a3b8", concepts: "#a78bfa", sources: "#67e8f9" };

function extractFrontmatter(content: string): { tags: string[]; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { tags: [], body: content };
  const front = match[1];
  const body = match[2].trim();
  const tagMatch = front.match(/tags:\s*\[([^\]]*)\]/);
  const tags = tagMatch ? tagMatch[1].split(",").map(t => t.trim().replace(/['"]/g, "")).filter(Boolean) : [];
  return { tags, body };
}

function highlight(text: string, query: string) {
  if (!query) return <>{text}</>;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return <>{parts.map((p, i) => p.toLowerCase() === query.toLowerCase()
    ? <mark key={i} className="rounded px-0.5" style={{ background: "rgba(167,139,250,0.25)", color: "#c4b5fd" }}>{p}</mark>
    : p)}</>;
}

export default function WikiViewer() {
  const [files, setFiles] = useState<WikiFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<WikiFile | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);
  // 전문 검색
  const [fullMatches, setFullMatches] = useState<SearchMatch[]>([]);
  const [fullSearching, setFullSearching] = useState(false);
  const [fullSearched, setFullSearched] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/wiki");
      const data = await res.json() as { files: WikiFile[] };
      setFiles(data.files ?? []);
    } catch { setFiles([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  // 검색어 디바운스 → 전문 검색
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (search.length < 2) { setFullMatches([]); setFullSearched(false); return; }
    searchTimer.current = setTimeout(async () => {
      setFullSearching(true);
      try {
        const res = await fetch(`/api/wiki/search?q=${encodeURIComponent(search)}`);
        const data = await res.json() as { matches: SearchMatch[] };
        setFullMatches(data.matches ?? []);
        setFullSearched(true);
      } catch { setFullMatches([]); }
      finally { setFullSearching(false); }
    }, 400);
  }, [search]);

  const openFile = async (filePath: string, fileName: string, category: string) => {
    const file: WikiFile = { name: fileName, path: filePath, category, size: 0, updatedAt: 0 };
    setSelected(file);
    setContent(null);
    setContentLoading(true);
    try {
      const res = await fetch(`/api/wiki/content?path=${encodeURIComponent(filePath)}`);
      const data = await res.json() as { content?: string; error?: string };
      setContent(data.content ?? null);
    } catch { setContent(null); }
    finally { setContentLoading(false); }
  };

  const copyContent = async () => {
    if (!content) return;
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const categories = ["all", ...Array.from(new Set(files.map(f => f.category)))];

  // 파일명 필터 (검색어 없을 때)
  const filteredByName = files.filter(f => {
    const matchCat = activeCategory === "all" || f.category === activeCategory;
    const matchSearch = !search || f.name.toLowerCase().replace(/_/g, " ").includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  // 검색 결과 모드: 전문검색 결과 있을 때
  const showFullResults = search.length >= 2 && fullSearched;

  // ── 파일 내용 뷰
  if (selected) {
    const { tags, body } = content ? extractFrontmatter(content) : { tags: [], body: "" };
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 mb-3 shrink-0">
          <button onClick={() => { setSelected(null); setContent(null); }}
            className="flex items-center gap-1 text-slate-500 hover:text-white transition-colors">
            <ArrowLeft size={12} /><span className="text-[10px]">목록</span>
          </button>
          <div className="w-px h-3 bg-slate-800" />
          <p className="text-[10px] text-slate-300 font-medium truncate flex-1">
            {selected.name.replace(".md", "").replace(/_/g, " ")}
          </p>
          <button onClick={copyContent} disabled={!content}
            className="shrink-0 flex items-center gap-1 text-[9px] px-2 py-1 rounded-lg transition-all"
            style={{ color: copied ? "#34d399" : "#475569", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            {copied ? <Check size={9} /> : <Copy size={9} />}{copied ? "복사됨" : "복사"}
          </button>
          <span className="text-[9px] px-1.5 py-0.5 rounded-full shrink-0"
            style={{ background: `${CATEGORY_COLOR[selected.category] ?? "#94a3b8"}15`, color: CATEGORY_COLOR[selected.category] ?? "#94a3b8" }}>
            {CATEGORY_LABEL[selected.category] ?? selected.category}
          </span>
        </div>
        {tags.length > 0 && (
          <div className="flex items-center gap-1.5 mb-3 shrink-0 flex-wrap">
            <Tag size={9} className="text-slate-700" />
            {tags.map(tag => (
              <span key={tag} className="text-[9px] px-2 py-0.5 rounded-full"
                style={{ background: "rgba(167,139,250,0.1)", color: "#a78bfa", border: "1px solid rgba(167,139,250,0.2)" }}>
                {tag}
              </span>
            ))}
          </div>
        )}
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {contentLoading
            ? <div className="flex items-center justify-center h-full"><div className="w-4 h-4 border-2 border-slate-600 border-t-slate-300 rounded-full animate-spin" /></div>
            : content === null
            ? <div className="flex items-center justify-center h-full"><p className="text-slate-500 text-xs">파일을 불러올 수 없어요</p></div>
            : <div className="report-body text-[11px] text-slate-300 leading-relaxed"><ReactMarkdown>{body}</ReactMarkdown></div>
          }
        </div>
      </div>
    );
  }

  // ── 파일 목록 뷰
  return (
    <div className="flex flex-col h-full gap-2 min-h-0">
      <div className="flex items-center justify-between shrink-0">
        <p className="text-[10px] text-slate-300 tracking-[0.2em] uppercase font-bold">위키 지식 베이스</p>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-slate-500">{files.length}개 문서</span>
          <button onClick={fetchFiles} disabled={loading} className="text-slate-400 hover:text-white transition-colors">
            <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* 검색 */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
        {fullSearching
          ? <Loader size={10} className="text-slate-600 shrink-0 animate-spin" />
          : <Search size={10} className="text-slate-600 shrink-0" />}
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="파일명 · 내용 검색..."
          className="flex-1 bg-transparent text-xs text-white placeholder:text-slate-700 focus:outline-none" />
        {search && <button onClick={() => { setSearch(""); setFullMatches([]); setFullSearched(false); }} className="text-slate-700 hover:text-slate-400 text-[10px]">✕</button>}
      </div>

      {/* 카테고리 탭 (전문검색 아닐 때만) */}
      {!showFullResults && files.length > 0 && (
        <div className="flex gap-1 shrink-0 flex-wrap">
          {categories.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)}
              className="px-2.5 py-1 rounded-full text-[9px] font-medium transition-all"
              style={activeCategory === cat
                ? { background: `${CATEGORY_COLOR[cat] ?? "#94a3b8"}25`, color: CATEGORY_COLOR[cat] ?? "#94a3b8", border: `1px solid ${CATEGORY_COLOR[cat] ?? "#94a3b8"}50` }
                : { background: "transparent", color: "#475569", border: "1px solid #334155" }}>
              {cat === "all" ? `전체 ${files.length}` : `${CATEGORY_LABEL[cat] ?? cat} ${files.filter(f => f.category === cat).length}`}
            </button>
          ))}
        </div>
      )}

      {/* 전문 검색 결과 */}
      {showFullResults && (
        <div className="shrink-0">
          <p className="text-[9px] text-slate-600 mb-2">
            <span className="text-slate-500 font-bold">"{search}"</span> 내용 검색 결과 · {fullMatches.length}개
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-slate-600 border-t-slate-300 rounded-full animate-spin" />
        </div>
      ) : showFullResults ? (
        <div className="flex-1 overflow-y-auto space-y-1.5 scrollbar-hide">
          {fullMatches.length === 0
            ? <div className="flex-1 flex items-center justify-center py-12"><p className="text-slate-500 text-xs">"{search}" 내용 없음</p></div>
            : fullMatches.map(m => (
              <button key={m.path} onClick={() => void openFile(m.path, m.name, m.category)}
                className="w-full text-left flex flex-col gap-1.5 px-3 py-2.5 rounded-xl transition-all group"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <div className="flex items-center gap-2">
                  <FileText size={10} style={{ color: CATEGORY_COLOR[m.category] ?? "#94a3b8", flexShrink: 0 }} />
                  <p className="text-[11px] text-slate-200 truncate group-hover:text-white transition-colors flex-1">
                    {m.name.replace(".md", "").replace(/_/g, " ")}
                  </p>
                  <span className="text-[8px] px-1.5 py-0.5 rounded-full shrink-0"
                    style={{ background: `${CATEGORY_COLOR[m.category] ?? "#94a3b8"}15`, color: CATEGORY_COLOR[m.category] ?? "#94a3b8" }}>
                    {m.matchCount}회
                  </span>
                </div>
                <p className="text-[10px] text-slate-600 leading-relaxed line-clamp-2 pl-4">
                  {highlight(m.snippet, search)}
                </p>
              </button>
            ))
          }
        </div>
      ) : filteredByName.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-slate-500 text-xs">{search ? `"${search}" 없음` : "문서 없음"}</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-1 scrollbar-hide">
          {filteredByName.map(file => (
            <button key={file.path} onClick={() => void openFile(file.path, file.name, file.category)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all text-left group"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <FileText size={11} style={{ color: CATEGORY_COLOR[file.category] ?? "#94a3b8" }} className="shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-slate-200 truncate group-hover:text-white transition-colors">
                  {file.name.replace(".md", "").replace(/_/g, " ")}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full"
                    style={{ background: `${CATEGORY_COLOR[file.category] ?? "#94a3b8"}15`, color: CATEGORY_COLOR[file.category] ?? "#94a3b8" }}>
                    {CATEGORY_LABEL[file.category] ?? file.category}
                  </span>
                  <span className="text-[9px] text-slate-600">{(file.size / 1024).toFixed(1)}KB</span>
                  <span className="text-[9px] text-slate-700">
                    {new Date(file.updatedAt * 1000).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                  </span>
                </div>
              </div>
              <ChevronRight size={10} className="text-slate-700 group-hover:text-slate-400 transition-colors shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
