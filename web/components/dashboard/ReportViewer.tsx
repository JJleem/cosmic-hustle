"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import { X, Download, Copy, Check, Printer, Languages, Loader2, Code, Monitor, Search, Trash2, Pencil, Save, ChevronDown, FileText, FileCode, BookOpen, Table, Tag, Plus } from "lucide-react";
import { AGENT_MAP } from "@/lib/agents";
import {
  type Report, type ReportVersion,
  extractHtml, stripMarkdown,
  printReport, downloadMarkdown, downloadHtml, downloadTxt, downloadExport,
} from "@/lib/reportUtils";

type Props = {
  report: Report;
  drafts: Record<string, string>;
  onClose: () => void;
  onDelete: (id: string) => void;
  onUpdate: (updated: Report) => void;
  onDeepDive?: (topic: string) => void;
};

export default function ReportViewer({ report, drafts, onClose, onDelete, onUpdate, onDeepDive }: Props) {
  const [copied, setCopied] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translated, setTranslated] = useState<string | null>(null);
  const [showTranslated, setShowTranslated] = useState(false);
  const [htmlViewMode, setHtmlViewMode] = useState<"preview" | "source">("preview");
  const [showDraft, setShowDraft] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTopic, setEditTopic] = useState("");
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [wikiSaving, setWikiSaving] = useState(false);
  const [wikiSaved, setWikiSaved] = useState(false);
  const [wikiMsg, setWikiMsg] = useState("");
  const [tags, setTags] = useState<string[]>(report.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [versions, setVersions] = useState<ReportVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTags(report.tags ?? []);
  }, [report.id, report.tags]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVersions([]);
    setSelectedVersion(null);
    setShowVersions(false);
    if (!report.sessionId) return;
    fetch(`/api/sessions/${report.sessionId}/versions`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: ReportVersion[]) => setVersions(data))
      .catch(() => {});
  }, [report.id, report.sessionId]);

  useEffect(() => {
    if (!showExport) return;
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setShowExport(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showExport]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (editing) { setEditing(false); return; }
      onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editing, onClose]);

  const handleTranslate = async () => {
    if (translating) return;
    if (translated) { setShowTranslated((v) => !v); return; }
    setTranslating(true);
    try {
      const res = await fetch("/api/agent/over", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: `Translate the following Korean research report into fluent English. Preserve all markdown formatting, headings, and structure exactly.\n\n${report.content}`,
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

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: editTopic, content: editContent }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json() as Omit<Report, "createdAt"> & { createdAt: number | string };
      const parsed: Report = { ...updated, createdAt: new Date(typeof updated.createdAt === "number" ? updated.createdAt * 1000 : updated.createdAt) };
      onUpdate(parsed);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await fetch(`/api/reports/${report.id}`, { method: "DELETE" });
      onDelete(report.id);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  const saveTag = async (newTags: string[]) => {
    setTags(newTags);
    const res = await fetch(`/api/reports/${report.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: newTags }),
    });
    if (res.ok) {
      const updated = await res.json() as Omit<Report, "createdAt"> & { createdAt: number | string };
      onUpdate({ ...updated, createdAt: new Date(typeof updated.createdAt === "number" ? updated.createdAt * 1000 : updated.createdAt) });
    }
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (!t || tags.includes(t)) { setTagInput(""); return; }
    void saveTag([...tags, t]);
    setTagInput("");
  };

  const removeTag = (tag: string) => void saveTag(tags.filter((t) => t !== tag));

  const saveToWiki = async () => {
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
            else if (ev.type === "complete") { setWikiSaved(true); setWikiMsg("위키에 저장됐어요!"); }
          } catch { /* ignore */ }
        }
      }
    } catch {
      setWikiMsg("저장 실패. 다시 시도해줘요.");
    } finally {
      setWikiSaving(false);
    }
  };

  const agent = AGENT_MAP[report.agentId];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-[92vw] max-w-6xl max-h-[95vh] rounded-2xl border border-slate-600 bg-[#0c1220] shadow-2xl flex flex-col overflow-hidden animate-fadeIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="shrink-0 flex items-center gap-3 px-6 py-4 border-b border-slate-700/80">
          <div className="flex items-center gap-2.5 shrink-0">
            {agent?.image && (
              <div className="w-8 h-8 rounded-full overflow-hidden shrink-0"
                style={{ outline: `2px solid ${agent.color}50`, outlineOffset: 2 }}>
                <Image src={agent.image} alt={agent.name} width={32} height={32} className="object-cover" />
              </div>
            )}
            <div>
              <p className="text-[11px] font-bold leading-none" style={{ color: agent?.color }}>{agent?.name}</p>
              <p className="text-[9px] text-slate-400 mt-0.5">{agent?.role}</p>
            </div>
          </div>

          <div className="w-px h-6 bg-slate-700 shrink-0" />

          {editing ? (
            <input
              value={editTopic}
              onChange={(e) => setEditTopic(e.target.value)}
              className="flex-1 min-w-0 text-sm text-white font-semibold bg-slate-800 border border-slate-600 rounded-lg px-2 py-1 focus:outline-none focus:border-blue-500"
            />
          ) : (
            <p className="text-sm text-white font-semibold flex-1 min-w-0 truncate">{report.topic}</p>
          )}

          <span className="text-[10px] text-slate-500 shrink-0">
            {report.createdAt.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })}
          </span>

          {/* 액션 버튼 */}
          <div className="flex items-center gap-1 shrink-0 ml-1">
            {editing ? (
              <>
                <button onClick={() => void handleSave()} disabled={saving}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] transition-all disabled:opacity-50"
                  style={{ background: "#14321e", color: "#4ade80", border: "1px solid #166534" }}>
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  <span>{saving ? "저장중..." : "저장"}</span>
                </button>
                <button onClick={() => setEditing(false)} disabled={saving}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] text-slate-400 hover:text-white hover:bg-slate-700 transition-all">
                  <X size={12} /><span>취소</span>
                </button>
                <div className="w-px h-4 bg-slate-700" />
              </>
            ) : (
              <>
                <button onClick={() => { setEditTopic(report.topic); setEditContent(report.content); setEditing(true); setTimeout(() => contentRef.current?.focus(), 50); }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] text-slate-400 hover:text-white hover:bg-slate-700 transition-all">
                  <Pencil size={12} /><span>편집</span>
                </button>
                <div className="w-px h-4 bg-slate-700" />
              </>
            )}
            {drafts[report.id] && (
              <>
                <button onClick={() => setShowDraft((v) => !v)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] transition-all"
                  style={showDraft ? { background: "#2d1a00", color: "#fb923c", border: "1px solid #7c3a00" } : { color: "#94a3b8" }}>
                  <span>{showDraft ? "v2 최종" : "v1 초안"}</span>
                </button>
                <div className="w-px h-4 bg-slate-700" />
              </>
            )}
            {extractHtml(report.content) && (
              <>
                <button onClick={() => setHtmlViewMode((m) => m === "preview" ? "source" : "preview")}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] transition-all"
                  style={htmlViewMode === "preview" ? { background: "#14321e", color: "#4ade80", border: "1px solid #166534" } : { color: "#94a3b8" }}>
                  {htmlViewMode === "preview" ? <Code size={12} /> : <Monitor size={12} />}
                  <span>{htmlViewMode === "preview" ? "소스" : "프리뷰"}</span>
                </button>
                <div className="w-px h-4 bg-slate-700" />
              </>
            )}
            {versions.length > 1 && (
              <>
                <button onClick={() => setShowVersions((v) => !v)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] transition-all"
                  style={showVersions ? { background: "rgba(139,92,246,0.15)", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.35)" } : { color: "#94a3b8" }}>
                  <span>v{versions.length} 히스토리</span>
                </button>
                <div className="w-px h-4 bg-slate-700" />
              </>
            )}
            {onDeepDive && (
              <>
                <button onClick={() => { onDeepDive(report.topic); onClose(); }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] transition-all hover:opacity-80"
                  style={{ background: "rgba(99,102,241,0.12)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.25)" }}>
                  <Search size={12} /><span>더 파기</span>
                </button>
                <div className="w-px h-4 bg-slate-700" />
              </>
            )}
            <button onClick={handleTranslate} disabled={translating}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] transition-all disabled:opacity-50"
              style={showTranslated ? { background: "#1e3a5f", color: "#93c5fd", border: "1px solid #2a5a9c" } : { color: "#94a3b8" }}>
              {translating ? <Loader2 size={12} className="animate-spin" /> : <Languages size={12} />}
              <span>{translating ? "번역중..." : showTranslated ? "한국어" : "EN"}</span>
            </button>
            <div className="w-px h-4 bg-slate-700" />

            {/* 내보내기 드롭다운 */}
            <div ref={exportRef} className="relative">
              <button onClick={() => setShowExport(v => !v)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] transition-all"
                style={showExport ? { background: "rgba(99,102,241,0.15)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.3)" } : { color: "#94a3b8" }}>
                <Download size={12} /><span>내보내기</span>
                <ChevronDown size={10} className={`transition-transform ${showExport ? "rotate-180" : ""}`} />
              </button>
              {showExport && (
                <div className="absolute right-0 top-full mt-1 z-10 rounded-xl py-1 min-w-[160px] animate-fadeIn"
                  style={{ background: "#0d1525", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 8px 32px rgba(0,0,0,0.6)" }}>
                  <p className="text-[9px] text-slate-700 px-3 py-1.5 tracking-wider uppercase font-bold">복사</p>
                  <button onClick={() => { void navigator.clipboard.writeText(report.content).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); setShowExport(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] text-slate-400 hover:text-white hover:bg-white/5 transition-all text-left">
                    {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                    {copied ? "복사됨!" : "마크다운 복사"}
                  </button>
                  <button onClick={() => { void navigator.clipboard.writeText(stripMarkdown(report.content)).then(() => { setCopiedText(true); setTimeout(() => setCopiedText(false), 2000); }); setShowExport(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] text-slate-400 hover:text-white hover:bg-white/5 transition-all text-left">
                    {copiedText ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                    {copiedText ? "복사됨!" : "텍스트 복사"}
                  </button>
                  <div className="my-1 mx-3 border-t border-white/5" />
                  <p className="text-[9px] text-slate-700 px-3 py-1.5 tracking-wider uppercase font-bold">다운로드</p>
                  <button onClick={() => { downloadMarkdown(report); setShowExport(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] text-slate-400 hover:text-white hover:bg-white/5 transition-all text-left">
                    <FileText size={11} />.md 마크다운
                  </button>
                  <button onClick={() => { downloadTxt(report); setShowExport(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] text-slate-400 hover:text-white hover:bg-white/5 transition-all text-left">
                    <FileText size={11} />.txt 텍스트
                  </button>
                  {extractHtml(report.content) && (
                    <button onClick={() => { downloadHtml(report); setShowExport(false); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] text-slate-400 hover:text-white hover:bg-white/5 transition-all text-left">
                      <FileCode size={11} />.html 파일
                    </button>
                  )}
                  <div className="my-1 mx-3 border-t border-white/5" />
                  <p className="text-[9px] text-slate-700 px-3 py-1.5 tracking-wider uppercase font-bold">변환</p>
                  <button onClick={() => { void downloadExport(report, "pdf"); setShowExport(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] text-slate-400 hover:text-white hover:bg-white/5 transition-all text-left">
                    <FileText size={11} />.pdf 파일
                  </button>
                  <button onClick={() => { void downloadExport(report, "excel"); setShowExport(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] text-slate-400 hover:text-white hover:bg-white/5 transition-all text-left">
                    <Table size={11} />.xlsx 엑셀
                  </button>
                  <div className="my-1 mx-3 border-t border-white/5" />
                  <button onClick={() => { printReport(report); setShowExport(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] text-slate-400 hover:text-white hover:bg-white/5 transition-all text-left">
                    <Printer size={11} />PDF로 인쇄
                  </button>
                </div>
              )}
            </div>
            <div className="w-px h-4 bg-slate-700" />

            {/* 위키에 저장 */}
            <button onClick={() => void saveToWiki()} disabled={wikiSaving || wikiSaved}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] transition-all disabled:opacity-50"
              style={wikiSaved ? { background: "rgba(167,139,250,0.12)", color: "#a78bfa", border: "1px solid rgba(167,139,250,0.3)" } : { color: "#94a3b8" }}>
              {wikiSaving ? <Loader2 size={12} className="animate-spin" /> : wikiSaved ? <Check size={12} /> : <BookOpen size={12} />}
              <span>{wikiSaving ? "저장 중..." : wikiSaved ? "위키 저장됨" : "위키에 저장"}</span>
            </button>
            <div className="w-px h-4 bg-slate-700" />
            <button onClick={() => void handleDelete()} disabled={deleting}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] text-slate-600 hover:text-red-400 hover:bg-red-400/10 transition-all disabled:opacity-40">
              <Trash2 size={12} />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-all">
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
        ) : showVersions && versions.length > 0 ? (
          <VersionView versions={versions} selectedVersion={selectedVersion} onSelectVersion={setSelectedVersion} />
        ) : (
          <ContentView
            report={report}
            drafts={drafts}
            showDraft={showDraft}
            htmlViewMode={htmlViewMode}
            showTranslated={showTranslated}
            translated={translated}
          />
        )}

        {/* 푸터 */}
        <div className="shrink-0 px-8 py-3 border-t border-slate-800 flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Tag size={10} className="text-slate-600 shrink-0" />
            {tags.map((tag) => (
              <span key={tag} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium"
                style={{ background: "rgba(99,102,241,0.12)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.25)" }}>
                {tag}
                <button onClick={() => removeTag(tag)} className="hover:text-red-400 transition-colors leading-none">
                  <X size={8} />
                </button>
              </span>
            ))}
            <form onSubmit={(e) => { e.preventDefault(); addTag(); }} className="flex items-center gap-1">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="태그 추가..."
                className="text-[9px] text-slate-400 placeholder:text-slate-700 bg-transparent focus:outline-none w-16 focus:w-24 transition-all"
              />
              {tagInput.trim() && (
                <button type="submit" className="text-slate-500 hover:text-indigo-400 transition-colors">
                  <Plus size={9} />
                </button>
              )}
            </form>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-slate-600">{report.content.length.toLocaleString()}자</span>
              {wikiMsg && (
                <span className="flex items-center gap-1.5 text-[10px]" style={{ color: wikiSaved ? "#a78bfa" : "#64748b" }}>
                  {wikiSaving && <Loader2 size={9} className="animate-spin" />}
                  {wikiSaved && <Check size={9} />}
                  {wikiMsg}
                </span>
              )}
            </div>
            <button onClick={onClose} className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors">
              닫기 (Esc)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function VersionView({ versions, selectedVersion, onSelectVersion }: {
  versions: ReportVersion[];
  selectedVersion: number | null;
  onSelectVersion: (v: number) => void;
}) {
  const activeVersion = selectedVersion ?? versions[versions.length - 1].version;
  const vData = versions.find((v) => v.version === activeVersion);
  const prevData = vData ? versions.find((v) => v.version === vData.version - 1) : null;
  const oldLines = prevData ? new Set(prevData.content.split("\n")) : null;
  const addedCount = oldLines && vData ? vData.content.split("\n").filter((l) => !oldLines.has(l)).length : 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="shrink-0 flex items-center gap-2 px-6 py-2 border-b border-slate-800/60" style={{ background: "#060a10" }}>
        <span className="text-[9px] text-slate-600 tracking-widest uppercase">버전 히스토리</span>
        <div className="flex gap-1.5 ml-2">
          {versions.map((v) => (
            <button key={v.version} onClick={() => onSelectVersion(v.version)}
              className="text-[9px] px-2.5 py-1 rounded-full transition-all"
              style={activeVersion === v.version
                ? { background: "rgba(139,92,246,0.2)", border: "1px solid rgba(139,92,246,0.4)", color: "#a78bfa" }
                : { background: "transparent", border: "1px solid #1a2030", color: "#3a4560" }}>
              v{v.version}{v.version === versions[versions.length - 1].version ? " ★" : ""}
            </button>
          ))}
        </div>
        {addedCount > 0 && (
          <span className="ml-auto text-[9px] px-2 py-0.5 rounded-full" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", color: "#4ade80" }}>
            +{addedCount}줄 변경
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-8 py-6 scrollbar-hide">
        {vData && (
          <div className="flex flex-col gap-3">
            {vData.factFeedback && (
              <div className="px-3 py-2 rounded-lg text-[10px] text-slate-400 italic" style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.15)" }}>
                팩트 피드백: {vData.factFeedback}
              </div>
            )}
            <div className="report-body text-sm text-slate-300 leading-relaxed">
              {oldLines ? (
                <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed font-sans">
                  {vData.content.split("\n").map((line, i) => (
                    <span key={i} className="block" style={!oldLines.has(line)
                      ? { color: "#86efac", background: "rgba(34,197,94,0.05)", borderLeft: "2px solid rgba(34,197,94,0.35)", paddingLeft: "8px", marginLeft: "-10px" }
                      : { color: "#94a3b8" }}>
                      {line || " "}
                    </span>
                  ))}
                </pre>
              ) : (
                <ReactMarkdown>{vData.content}</ReactMarkdown>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ContentView({ report, drafts, showDraft, htmlViewMode, showTranslated, translated }: {
  report: Report;
  drafts: Record<string, string>;
  showDraft: boolean;
  htmlViewMode: "preview" | "source";
  showTranslated: boolean;
  translated: string | null;
}) {
  if (showDraft && drafts[report.id]) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6 scrollbar-hide">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-800">
          <span className="text-[10px] text-orange-400 font-bold px-2 py-0.5 rounded-full" style={{ background: "#2d1a0080", border: "1px solid #7c3a0060" }}>v1 초안</span>
          <span className="text-[10px] text-slate-600">팩트 검토 전 원본</span>
        </div>
        <div className="report-body text-sm text-slate-300 leading-relaxed">
          <ReactMarkdown>{drafts[report.id]}</ReactMarkdown>
        </div>
      </div>
    );
  }

  const htmlContent = extractHtml(report.content);
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
          <iframe srcDoc={htmlContent} className="flex-1 w-full border-0" sandbox="allow-scripts" title="HTML Preview" />
        </div>
      );
    }
    return (
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 scrollbar-hide">
        <pre className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap break-words font-mono">{htmlContent}</pre>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6 scrollbar-hide">
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
          <ReactMarkdown>{report.content}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
