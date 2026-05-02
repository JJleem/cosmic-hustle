"use client";

import { useState, useEffect, useRef } from "react";
import { X, Download, Copy, Check, Printer, Languages, Loader2, Code, Monitor, Search, Trash2, Pencil, Save, ChevronDown, FileText, FileCode, BookOpen } from "lucide-react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import { AGENT_MAP } from "@/lib/agents";

function extractHtml(content: string): string | null {
  const match = content.match(/```html\s*([\s\S]*?)```/);
  if (match) return match[1].trim();
  const trimmed = content.trim();
  if (/^<!DOCTYPE html/i.test(trimmed) || /^<html/i.test(trimmed)) return trimmed;
  return null;
}

export type Report = {
  id: string;
  agentId: string;
  topic: string;
  content: string;
  createdAt: Date;
};

function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/\n+/g, " ")
    .trim();
}

function mdToHtml(md: string): string {
  return md
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/^\- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(?!<[hul]|<\/[hul]|<li|<\/ul)(.+)$/gm, "$1")
    .replace(/^(.+)$/gm, (line) =>
      /^<(h[123]|ul|li|\/ul|\/li|p)/.test(line) ? line : `<p>${line}</p>`)
    .replace(/<p><\/p>/g, "");
}

function printReport(report: Report) {
  const agent = AGENT_MAP[report.agentId];
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html lang="ko"><head>
  <meta charset="utf-8"/>
  <title>${report.topic}</title>
  <style>
    body { font-family: 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif; max-width: 720px; margin: 48px auto; padding: 0 24px; color: #1e293b; line-height: 1.8; }
    h1 { font-size: 1.5rem; margin-top: 2rem; margin-bottom: 0.5rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.4rem; }
    h2 { font-size: 1.2rem; margin-top: 1.5rem; margin-bottom: 0.4rem; }
    h3 { font-size: 1rem; margin-top: 1.2rem; margin-bottom: 0.3rem; }
    p { margin: 0.6rem 0; }
    ul { padding-left: 1.5rem; margin: 0.5rem 0; }
    li { margin: 0.25rem 0; }
    strong { font-weight: 700; }
    code { background: #f1f5f9; padding: 0.1rem 0.3rem; border-radius: 4px; font-size: 0.85em; }
    .meta { display: flex; align-items: center; gap: 12px; margin-bottom: 2rem; padding: 12px 16px; background: #f8fafc; border-radius: 8px; font-size: 0.8rem; color: #64748b; }
    .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 0.75rem; font-weight: 700; background: #e0f2fe; color: #0369a1; }
    @media print { body { margin: 0; } }
  </style>
</head><body>
  <div class="meta">
    <span class="badge">${agent?.name ?? report.agentId} · ${agent?.role ?? ""}</span>
    <span>${report.topic}</span>
    <span style="margin-left:auto">${new Date(report.createdAt).toLocaleDateString("ko-KR")}</span>
  </div>
  ${mdToHtml(report.content)}
  <script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();}<\/script>
</body></html>`);
  win.document.close();
}

function downloadMarkdown(report: Report) {
  const filename = `${report.topic.replace(/[^a-zA-Z0-9가-힣]/g, "_")}_${report.agentId}.md`;
  const header = `# ${report.topic}\n\n> 작성: ${AGENT_MAP[report.agentId]?.name ?? report.agentId} · ${new Date(report.createdAt).toLocaleDateString("ko-KR")}\n\n---\n\n`;
  const blob = new Blob([header + report.content], { type: "text/markdown;charset=utf-8" });
  triggerDownload(blob, filename);
}

function downloadHtml(report: Report) {
  const html = extractHtml(report.content);
  if (!html) return;
  const filename = `${report.topic.replace(/[^a-zA-Z0-9가-힣]/g, "_")}.html`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  triggerDownload(blob, filename);
}

function downloadTxt(report: Report) {
  const filename = `${report.topic.replace(/[^a-zA-Z0-9가-힣]/g, "_")}.txt`;
  const blob = new Blob([stripMarkdown(report.content)], { type: "text/plain;charset=utf-8" });
  triggerDownload(blob, filename);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const WRITER_AGENTS = [
  { id: "over",  label: "리서치·글" },
  { id: "run",   label: "개발" },
  { id: "pixel", label: "디자인" },
  { id: "buzz",  label: "마케팅" },
];

const DATE_FILTERS = [
  { id: "today", label: "오늘" },
  { id: "week",  label: "이번주" },
  { id: "month", label: "이번달" },
] as const;

type DateFilter = "today" | "week" | "month";

type Props = { reports: Report[]; drafts?: Record<string, string>; onDelete?: (id: string) => void; onUpdate?: (updated: Report) => void };

export default function ReportBoard({ reports, drafts = {}, onDelete, onUpdate }: Props) {
  const [selected, setSelected] = useState<Report | null>(null);
  const [copied, setCopied] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translated, setTranslated] = useState<string | null>(null);
  const [showTranslated, setShowTranslated] = useState(false);
  const [htmlViewMode, setHtmlViewMode] = useState<"preview" | "source">("preview");
  const [showDraft, setShowDraft] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterAgent, setFilterAgent] = useState<string | null>(null);
  const [filterDate, setFilterDate] = useState<DateFilter | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTopic, setEditTopic] = useState("");
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [wikiSaving, setWikiSaving] = useState(false);
  const [wikiSaved, setWikiSaved] = useState<string | null>(null); // reportId
  const [wikiMsg, setWikiMsg] = useState("");
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showExport) return;
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setShowExport(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showExport]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setSelected(null); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleTranslate = async () => {
    if (!selected || translating) return;
    if (translated) { setShowTranslated((v) => !v); return; }
    setTranslating(true);
    try {
      const res = await fetch("/api/agent/over", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: `Translate the following Korean research report into fluent English. Preserve all markdown formatting, headings, and structure exactly.\n\n${selected.content}`,
        }),
      });
      if (!res.ok || !res.body) throw new Error();
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let result = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(line.slice(6)) as { type: string; result?: { result?: string } };
            if (ev.type === "complete" && ev.result?.result) result = ev.result.result;
          } catch { /* ignore */ }
        }
      }
      setTranslated(result || "Translation failed.");
      setShowTranslated(true);
    } catch {
      setTranslated("Translation failed.");
      setShowTranslated(true);
    } finally {
      setTranslating(false);
    }
  };

  const handleCopy = async () => {
    if (!selected) return;
    await navigator.clipboard.writeText(selected.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await fetch(`/api/reports/${id}`, { method: "DELETE" });
      onDelete?.(id);
      if (selected?.id === id) setSelected(null);
    } finally {
      setDeletingId(null);
    }
  };

  const startEdit = () => {
    if (!selected) return;
    setEditTopic(selected.topic);
    setEditContent(selected.content);
    setEditing(true);
    setTimeout(() => contentRef.current?.focus(), 50);
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  const handleSave = async () => {
    if (!selected || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/reports/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: editTopic, content: editContent }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json() as Report;
      updated.createdAt = new Date(updated.createdAt);
      setSelected(updated);
      onUpdate?.(updated);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const saveToWiki = async (report: Report) => {
    if (wikiSaving) return;
    setWikiSaving(true);
    setWikiMsg("위키 대리에게 전달 중...");
    try {
      const agent = AGENT_MAP[report.agentId];
      const filename = `Report_${report.topic.replace(/[^a-zA-Z0-9가-힣]/g, "_")}`;
      const content = `# ${report.topic}\n\n> 작성: ${agent?.name ?? report.agentId} · ${new Date(report.createdAt).toLocaleDateString("ko-KR")}\n\n---\n\n${report.content}`;
      const res = await fetch("/api/wiki/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, filename }),
      });
      if (!res.ok || !res.body) throw new Error("ingest 실패");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(line.slice(6)) as { type: string; message?: string };
            if (ev.type === "agent_message" && ev.message) setWikiMsg(ev.message);
            else if (ev.type === "complete") {
              setWikiSaved(report.id);
              setWikiMsg("위키에 저장됐어요!");
            }
          } catch { /* ignore */ }
        }
      }
    } catch {
      setWikiMsg("저장 실패. 다시 시도해줘요.");
    } finally {
      setWikiSaving(false);
    }
  };

  const filteredReports = reports.filter((r) => {
    if (filterAgent && r.agentId !== filterAgent) return false;
    if (filterDate) {
      const now = new Date();
      const date = new Date(r.createdAt);
      if (filterDate === "today") {
        if (date.toDateString() !== now.toDateString()) return false;
      } else if (filterDate === "week") {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        if (date < weekAgo) return false;
      } else if (filterDate === "month") {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        if (date < monthAgo) return false;
      }
    }
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return r.topic.toLowerCase().includes(q) || r.content.toLowerCase().includes(q);
  });

  return (
    <>
      <div className="flex flex-col h-full">
        <p className="text-[10px] text-slate-300 tracking-[0.2em] uppercase mb-3 font-bold">
          보고 현황
        </p>

        {/* 검색 + 필터 */}
        <div className="shrink-0 flex flex-col gap-2 mb-3">
          <div className="relative">
            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="보고서 검색..."
              className="w-full pl-7 pr-3 py-1.5 rounded-lg text-[11px] text-slate-300 placeholder:text-slate-700 focus:outline-none"
              style={{ background: "#0c1220", border: "1px solid #1e2a3a" }}
            />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setFilterAgent(null)}
              className="px-2.5 py-1 rounded-full text-[9px] font-bold transition-all"
              style={!filterAgent
                ? { background: "#1e2a40", color: "#93c5fd", border: "1px solid #2a4a6a" }
                : { color: "#475569", border: "1px solid #1a2235" }}
            >
              전체 {!filterAgent && reports.length > 0 && <span className="ml-0.5 opacity-60">{reports.length}</span>}
            </button>
            {WRITER_AGENTS.map(({ id, label }) => {
              const agent = AGENT_MAP[id];
              const count = reports.filter((r) => r.agentId === id).length;
              if (count === 0) return null;
              return (
                <button
                  key={id}
                  onClick={() => setFilterAgent(filterAgent === id ? null : id)}
                  className="px-2.5 py-1 rounded-full text-[9px] font-bold transition-all"
                  style={filterAgent === id
                    ? { background: `${agent?.color}20`, color: agent?.color, border: `1px solid ${agent?.color}50` }
                    : { color: "#475569", border: "1px solid #1a2235" }}
                >
                  {label} <span className="ml-0.5 opacity-60">{count}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] text-slate-700 font-bold tracking-wider uppercase">기간</span>
            <button
              onClick={() => setFilterDate(null)}
              className="px-2.5 py-1 rounded-full text-[9px] font-bold transition-all"
              style={!filterDate
                ? { background: "#1a2030", color: "#64748b", border: "1px solid #2a3545" }
                : { color: "#374151", border: "1px solid #1a2235" }}
            >
              전체
            </button>
            {DATE_FILTERS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setFilterDate(filterDate === id ? null : id)}
                className="px-2.5 py-1 rounded-full text-[9px] font-bold transition-all"
                style={filterDate === id
                  ? { background: "#1e3a5f", color: "#93c5fd", border: "1px solid #2a5a9c" }
                  : { color: "#374151", border: "1px solid #1a2235" }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {filteredReports.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-slate-400 text-xs">
              {reports.length === 0 ? "접수된 보고서 없음" : "검색 결과 없음"}
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-2 scrollbar-hide">
            {filteredReports.map((r) => {
              const agent = AGENT_MAP[r.agentId];
              const q = search.trim().toLowerCase();
              const preview = stripMarkdown(r.content);
              const matchIdx = q ? preview.toLowerCase().indexOf(q) : -1;
              const highlightPreview = matchIdx !== -1
                ? <>
                    {preview.slice(0, matchIdx)}
                    <mark className="bg-yellow-500/20 text-yellow-300 rounded">{preview.slice(matchIdx, matchIdx + q.length)}</mark>
                    {preview.slice(matchIdx + q.length, matchIdx + q.length + 80)}
                  </>
                : preview;
              return (
                <div
                  key={r.id}
                  onClick={() => { setSelected(r); setCopied(false); setTranslated(null); setShowTranslated(false); setHtmlViewMode("preview"); setShowDraft(false); }}
                  className="rounded-xl border border-slate-500 bg-slate-700/50 p-3 hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    {agent?.image && (
                      <div className="w-5 h-5 rounded-full overflow-hidden shrink-0" style={{ outline: `1px solid ${agent.color}60` }}>
                        <Image src={agent.image} alt={agent.name} width={20} height={20} className="object-cover" />
                      </div>
                    )}
                    <span
                      className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: `${agent?.color}25`, color: agent?.color, border: `1px solid ${agent?.color}60` }}
                    >
                      {agent?.name} · {agent?.role}
                    </span>
                    <span className="text-[9px] text-slate-400 ml-auto">
                      {r.createdAt.toLocaleDateString("ko-KR")}
                    </span>
                  </div>
                  <p className="text-xs text-white font-semibold truncate">{r.topic}</p>
                  <p className="text-[11px] text-slate-300 mt-1 line-clamp-2 leading-relaxed">
                    {highlightPreview}
                  </p>
                  <div className="flex justify-end mt-1.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); void handleDelete(r.id); }}
                      disabled={deletingId === r.id}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] text-slate-600 hover:text-red-400 hover:bg-red-400/10 transition-all disabled:opacity-40"
                    >
                      <Trash2 size={9} />
                      {deletingId === r.id ? "삭제중..." : "삭제"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 리포트 상세 모달 */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm"
          onClick={() => setSelected(null)}
        >
          <div
            className="relative w-full max-w-3xl max-h-[88vh] mx-6 rounded-2xl border border-slate-600 bg-[#0c1220] shadow-2xl flex flex-col animate-fadeIn"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="shrink-0 flex items-center gap-3 px-6 py-4 border-b border-slate-700/80">
              {(() => {
                const agent = AGENT_MAP[selected.agentId];
                return (
                  <div className="flex items-center gap-2.5 shrink-0">
                    {agent?.image && (
                      <div
                        className="w-8 h-8 rounded-full overflow-hidden shrink-0"
                        style={{ outline: `2px solid ${agent.color}50`, outlineOffset: 2 }}
                      >
                        <Image src={agent.image} alt={agent.name} width={32} height={32} className="object-cover" />
                      </div>
                    )}
                    <div>
                      <p className="text-[11px] font-bold leading-none" style={{ color: agent?.color }}>
                        {agent?.name}
                      </p>
                      <p className="text-[9px] text-slate-400 mt-0.5">{agent?.role}</p>
                    </div>
                  </div>
                );
              })()}

              <div className="w-px h-6 bg-slate-700 shrink-0" />

              {editing ? (
                <input
                  value={editTopic}
                  onChange={(e) => setEditTopic(e.target.value)}
                  className="flex-1 min-w-0 text-sm text-white font-semibold bg-slate-800 border border-slate-600 rounded-lg px-2 py-1 focus:outline-none focus:border-blue-500"
                />
              ) : (
                <p className="text-sm text-white font-semibold flex-1 min-w-0 truncate">{selected.topic}</p>
              )}

              <span className="text-[10px] text-slate-500 shrink-0">
                {selected.createdAt.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })}
              </span>

              {/* 액션 버튼 */}
              <div className="flex items-center gap-1 shrink-0 ml-1">
                {editing ? (
                  <>
                    <button
                      onClick={() => void handleSave()}
                      disabled={saving}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] transition-all disabled:opacity-50"
                      style={{ background: "#14321e", color: "#4ade80", border: "1px solid #166534" }}
                    >
                      {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                      <span>{saving ? "저장중..." : "저장"}</span>
                    </button>
                    <button
                      onClick={cancelEdit}
                      disabled={saving}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
                    >
                      <X size={12} />
                      <span>취소</span>
                    </button>
                    <div className="w-px h-4 bg-slate-700" />
                  </>
                ) : (
                  <>
                    <button
                      onClick={startEdit}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
                    >
                      <Pencil size={12} />
                      <span>편집</span>
                    </button>
                    <div className="w-px h-4 bg-slate-700" />
                  </>
                )}
                {drafts[selected.id] && (
                  <>
                    <button
                      onClick={() => setShowDraft((v) => !v)}
                      title={showDraft ? "최종본 보기" : "초안 보기"}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] transition-all"
                      style={
                        showDraft
                          ? { background: "#2d1a00", color: "#fb923c", border: "1px solid #7c3a00" }
                          : { color: "#94a3b8" }
                      }
                    >
                      <span>{showDraft ? "v2 최종" : "v1 초안"}</span>
                    </button>
                    <div className="w-px h-4 bg-slate-700" />
                  </>
                )}
                {extractHtml(selected.content) && (
                  <>
                    <button
                      onClick={() => setHtmlViewMode((m) => m === "preview" ? "source" : "preview")}
                      title={htmlViewMode === "preview" ? "소스 보기" : "프리뷰 보기"}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] transition-all"
                      style={
                        htmlViewMode === "preview"
                          ? { background: "#14321e", color: "#4ade80", border: "1px solid #166534" }
                          : { color: "#94a3b8" }
                      }
                    >
                      {htmlViewMode === "preview" ? <Code size={12} /> : <Monitor size={12} />}
                      <span>{htmlViewMode === "preview" ? "소스" : "프리뷰"}</span>
                    </button>
                    <div className="w-px h-4 bg-slate-700" />
                  </>
                )}
                <button
                  onClick={handleTranslate}
                  title={translated ? (showTranslated ? "원문 보기" : "영문 보기") : "영어로 번역"}
                  disabled={translating}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] transition-all disabled:opacity-50"
                  style={
                    showTranslated
                      ? { background: "#1e3a5f", color: "#93c5fd", border: "1px solid #2a5a9c" }
                      : { color: "#94a3b8" }
                  }
                >
                  {translating ? <Loader2 size={12} className="animate-spin" /> : <Languages size={12} />}
                  <span>{translating ? "번역중..." : showTranslated ? "한국어" : "EN"}</span>
                </button>
                <div className="w-px h-4 bg-slate-700" />
                {/* 내보내기 드롭다운 */}
                <div ref={exportRef} className="relative">
                  <button
                    onClick={() => setShowExport(v => !v)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] transition-all"
                    style={showExport
                      ? { background: "rgba(99,102,241,0.15)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.3)" }
                      : { color: "#94a3b8" }}
                  >
                    <Download size={12} />
                    <span>내보내기</span>
                    <ChevronDown size={10} className={`transition-transform ${showExport ? "rotate-180" : ""}`} />
                  </button>

                  {showExport && (
                    <div className="absolute right-0 top-full mt-1 z-10 rounded-xl py-1 min-w-[160px] animate-fadeIn"
                      style={{ background: "#0d1525", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 8px 32px rgba(0,0,0,0.6)" }}>
                      <p className="text-[9px] text-slate-700 px-3 py-1.5 tracking-wider uppercase font-bold">복사</p>
                      <button onClick={() => { void handleCopy(); setShowExport(false); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] text-slate-400 hover:text-white hover:bg-white/5 transition-all text-left">
                        {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                        {copied ? "복사됨!" : "마크다운 복사"}
                      </button>
                      <button onClick={async () => {
                        await navigator.clipboard.writeText(stripMarkdown(selected.content));
                        setCopiedText(true); setTimeout(() => setCopiedText(false), 2000);
                        setShowExport(false);
                      }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] text-slate-400 hover:text-white hover:bg-white/5 transition-all text-left">
                        {copiedText ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                        {copiedText ? "복사됨!" : "텍스트 복사"}
                      </button>

                      <div className="my-1 mx-3 border-t border-white/5" />
                      <p className="text-[9px] text-slate-700 px-3 py-1.5 tracking-wider uppercase font-bold">다운로드</p>
                      <button onClick={() => { downloadMarkdown(selected); setShowExport(false); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] text-slate-400 hover:text-white hover:bg-white/5 transition-all text-left">
                        <FileText size={11} />.md 마크다운
                      </button>
                      <button onClick={() => { downloadTxt(selected); setShowExport(false); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] text-slate-400 hover:text-white hover:bg-white/5 transition-all text-left">
                        <FileText size={11} />.txt 텍스트
                      </button>
                      {extractHtml(selected.content) && (
                        <button onClick={() => { downloadHtml(selected); setShowExport(false); }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] text-slate-400 hover:text-white hover:bg-white/5 transition-all text-left">
                          <FileCode size={11} />.html 파일
                        </button>
                      )}

                      <div className="my-1 mx-3 border-t border-white/5" />
                      <button onClick={() => { printReport(selected); setShowExport(false); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] text-slate-400 hover:text-white hover:bg-white/5 transition-all text-left">
                        <Printer size={11} />PDF로 인쇄
                      </button>
                    </div>
                  )}
                </div>
                <div className="w-px h-4 bg-slate-700" />
                {/* 위키에 저장 */}
                <button
                  onClick={() => void saveToWiki(selected)}
                  disabled={wikiSaving || wikiSaved === selected.id}
                  title="위키 지식베이스에 저장"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] transition-all disabled:opacity-50"
                  style={wikiSaved === selected.id
                    ? { background: "rgba(167,139,250,0.12)", color: "#a78bfa", border: "1px solid rgba(167,139,250,0.3)" }
                    : { color: "#94a3b8" }}
                >
                  {wikiSaving
                    ? <Loader2 size={12} className="animate-spin" />
                    : wikiSaved === selected.id
                    ? <Check size={12} />
                    : <BookOpen size={12} />}
                  <span>{wikiSaving ? "저장 중..." : wikiSaved === selected.id ? "위키 저장됨" : "위키에 저장"}</span>
                </button>
                <div className="w-px h-4 bg-slate-700" />
                <button
                  onClick={() => void handleDelete(selected.id)}
                  disabled={deletingId === selected.id}
                  title="보고서 삭제"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] text-slate-600 hover:text-red-400 hover:bg-red-400/10 transition-all disabled:opacity-40"
                >
                  <Trash2 size={12} />
                </button>
                <button
                  onClick={() => setSelected(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* 본문 */}
            {editing ? (
              <div className="flex-1 overflow-hidden flex flex-col px-8 py-6 gap-2">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                  <Pencil size={10} className="text-blue-400" />
                  <span className="text-[10px] text-blue-400 font-medium">편집 모드 — 마크다운 지원</span>
                </div>
                <textarea
                  ref={contentRef}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="flex-1 w-full bg-slate-900/60 border border-slate-700 rounded-xl text-sm text-slate-200 leading-relaxed p-4 resize-none focus:outline-none focus:border-blue-500 font-mono scrollbar-hide"
                  spellCheck={false}
                />
              </div>
            ) : (() => {
              const activeContent = showDraft && drafts[selected.id] ? drafts[selected.id] : selected.content;
              const htmlContent = extractHtml(activeContent);
              if (showDraft && drafts[selected.id]) {
                return (
                  <div className="flex-1 overflow-y-auto px-8 py-6 scrollbar-hide">
                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-800">
                      <span className="text-[10px] text-orange-400 font-bold px-2 py-0.5 rounded-full" style={{ background: "#2d1a0080", border: "1px solid #7c3a0060" }}>v1 초안</span>
                      <span className="text-[10px] text-slate-600">팩트 검토 전 원본</span>
                    </div>
                    <div className="report-body text-sm text-slate-300 leading-relaxed">
                      <ReactMarkdown>{drafts[selected.id]}</ReactMarkdown>
                    </div>
                  </div>
                );
              }
              if (htmlContent && !showTranslated) {
                if (htmlViewMode === "preview") {
                  return (
                    <div className="flex-1 overflow-hidden flex flex-col">
                      <div className="shrink-0 flex items-center gap-2 px-6 py-2 border-b border-slate-800/60" style={{ background: "#060a10" }}>
                        <div className="flex gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                          <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                        </div>
                        <span className="text-[10px] text-slate-600 ml-2">HTML Preview</span>
                      </div>
                      <iframe
                        srcDoc={htmlContent}
                        className="flex-1 w-full border-0"
                        sandbox="allow-scripts"
                        title="HTML Preview"
                      />
                    </div>
                  );
                }
                return (
                  <div className="flex-1 overflow-y-auto px-6 py-5 scrollbar-hide">
                    <pre className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap break-words font-mono">
                      {htmlContent}
                    </pre>
                  </div>
                );
              }
              return (
                <div className="flex-1 overflow-y-auto px-8 py-6 scrollbar-hide">
                  {showTranslated && translated ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-800">
                        <Languages size={11} className="text-blue-400" />
                        <span className="text-[10px] text-blue-400 font-medium">English Translation (by Over)</span>
                      </div>
                      <div className="report-body text-sm text-slate-300 leading-relaxed">
                        <ReactMarkdown>{translated}</ReactMarkdown>
                      </div>
                    </div>
                  ) : (
                    <div className="report-body text-sm text-slate-300 leading-relaxed">
                      <ReactMarkdown>{selected.content}</ReactMarkdown>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* 푸터 */}
            <div className="shrink-0 px-8 py-3 border-t border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-slate-600">{selected.content.length.toLocaleString()}자</span>
                {(wikiSaving || wikiSaved === selected.id) && wikiMsg && (
                  <span className="flex items-center gap-1.5 text-[10px]" style={{ color: wikiSaved === selected.id ? "#a78bfa" : "#64748b" }}>
                    {wikiSaving && <Loader2 size={9} className="animate-spin" />}
                    {wikiSaved === selected.id && <Check size={9} />}
                    {wikiMsg}
                  </span>
                )}
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
              >
                닫기 (Esc)
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
