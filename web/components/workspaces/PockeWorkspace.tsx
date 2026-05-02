"use client";

import { useState, useRef } from "react";
import { Search, ExternalLink, Zap, BookOpen, ChevronDown, ChevronUp, Loader } from "lucide-react";
import { AgentDef } from "@/lib/agents";
import Image from "next/image";

type Relevance = "high" | "medium";

interface SearchSource {
  title: string;
  url: string;
  snippet: string;
  relevance: Relevance;
}

interface SearchResult {
  comment: string;
  summary: string;
  sources: SearchSource[];
  keyFindings: string[];
}

type SearchEntry = {
  id: string;
  query: string;
  result: SearchResult | null;
  rawText: string;
  loading: boolean;
  error: boolean;
};

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace("www.", ""); } catch { return url; }
}

function getFaviconUrl(url: string): string {
  try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=16`; } catch { return ""; }
}

function SourceCard({ source, color }: { source: SearchSource; color: string }) {
  const [expanded, setExpanded] = useState(false);
  const isHigh = source.relevance === "high";

  return (
    <div className="rounded-xl overflow-hidden transition-all"
      style={{ background: isHigh ? `${color}06` : "rgba(255,255,255,0.02)", border: `1px solid ${isHigh ? color + "20" : "rgba(255,255,255,0.05)"}` }}>
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <div className="w-4 h-4 shrink-0 mt-0.5 relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={getFaviconUrl(source.url)} alt="" width={14} height={14} className="rounded-sm opacity-70" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-slate-200 leading-snug line-clamp-1">{source.title}</p>
              <p className="text-[9px] text-slate-600 mt-0.5">{getDomain(source.url)}</p>
            </div>
            {isHigh && (
              <span className="shrink-0 text-[8px] px-1.5 py-0.5 rounded-full font-bold"
                style={{ background: `${color}15`, color }}>핵심</span>
            )}
          </div>
          {expanded && (
            <p className="text-[10px] text-slate-400 leading-relaxed mt-2">{source.snippet}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <a href={source.url} target="_blank" rel="noopener noreferrer"
            className="p-1 rounded-lg text-slate-700 hover:text-slate-300 transition-colors"
            onClick={e => e.stopPropagation()}>
            <ExternalLink size={10} />
          </a>
          <button onClick={() => setExpanded(v => !v)}
            className="p-1 rounded-lg text-slate-700 hover:text-slate-400 transition-colors">
            {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          </button>
        </div>
      </div>
    </div>
  );
}

function ResultCard({ entry, color }: { entry: SearchEntry; color: string }) {
  if (entry.loading) {
    return (
      <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-5 h-5 rounded-full border-2 animate-spin shrink-0" style={{ borderColor: `${color}30`, borderTopColor: color }} />
          <div>
            <p className="text-xs font-semibold text-slate-300">"{entry.query}" 검색 중...</p>
            <p className="text-[10px] text-slate-600 mt-0.5 animate-pulse">볼따구 채우는 중이에요 🐹</p>
          </div>
        </div>
        <div className="space-y-2">
          {[80, 65, 90].map((w, i) => (
            <div key={i} className="h-3 rounded-full animate-pulse" style={{ width: `${w}%`, background: "rgba(255,255,255,0.04)" }} />
          ))}
        </div>
      </div>
    );
  }

  if (entry.error || !entry.result) {
    return (
      <div className="rounded-2xl p-4" style={{ background: "rgba(248,113,113,0.05)", border: "1px solid rgba(248,113,113,0.15)" }}>
        <p className="text-xs text-red-400">"{entry.query}" 검색 실패</p>
        <p className="text-[10px] text-slate-600 mt-1">{entry.rawText || "오류가 발생했어요."}</p>
      </div>
    );
  }

  const { comment, summary, sources, keyFindings } = entry.result;
  const highSources = sources.filter(s => s.relevance === "high");
  const mediumSources = sources.filter(s => s.relevance !== "high");

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
      {/* 헤더 */}
      <div className="px-5 py-4" style={{ background: `${color}08`, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="flex items-start gap-2.5">
          <Zap size={13} style={{ color, marginTop: 2, flexShrink: 0 }} />
          <div>
            <p className="text-[10px] font-bold mb-0.5" style={{ color }}>{comment}</p>
            <p className="text-[9px] text-slate-600">"{entry.query}"</p>
          </div>
        </div>
      </div>

      <div className="px-5 py-4 space-y-4" style={{ background: "rgba(255,255,255,0.01)" }}>
        {/* 요약 */}
        <div className="rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
          <div className="flex items-center gap-1.5 mb-2">
            <BookOpen size={9} className="text-slate-600" />
            <p className="text-[9px] text-slate-600 uppercase tracking-widest font-bold">요약</p>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">{summary}</p>
        </div>

        {/* 핵심 발견 */}
        {keyFindings.length > 0 && (
          <div>
            <p className="text-[9px] text-slate-600 uppercase tracking-widest font-bold mb-2">핵심 발견</p>
            <div className="space-y-1.5">
              {keyFindings.map((f, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0 mt-0.5"
                    style={{ background: `${color}15`, color }}>{i + 1}</span>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{f}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 출처 - 핵심 */}
        {highSources.length > 0 && (
          <div>
            <p className="text-[9px] text-slate-600 uppercase tracking-widest font-bold mb-2">주요 출처 ({highSources.length})</p>
            <div className="space-y-1.5">
              {highSources.map((s, i) => <SourceCard key={i} source={s} color={color} />)}
            </div>
          </div>
        )}

        {/* 출처 - 참고 */}
        {mediumSources.length > 0 && (
          <div>
            <p className="text-[9px] text-slate-600 uppercase tracking-widest font-bold mb-2">참고 출처 ({mediumSources.length})</p>
            <div className="space-y-1.5">
              {mediumSources.map((s, i) => <SourceCard key={i} source={s} color={color} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PockeWorkspace({ agent }: { agent: AgentDef }) {
  const [input, setInput] = useState("");
  const [entries, setEntries] = useState<SearchEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const search = async (query: string) => {
    if (!query.trim() || loading) return;
    setLoading(true);
    const id = crypto.randomUUID();
    setEntries(prev => [{ id, query, result: null, rawText: "", loading: true, error: false }, ...prev]);
    setInput("");

    try {
      const res = await fetch("/api/agent/pocke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: query }),
      });
      if (!res.ok || !res.body) throw new Error();

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = ""; let rawResult = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(line.slice(6)) as { type: string; result?: { result?: string } };
            if (ev.type === "complete" && ev.result?.result) rawResult = ev.result.result;
          } catch { /* ignore */ }
        }
      }

      // JSON 파싱 시도
      let parsed: SearchResult | null = null;
      try {
        const jsonMatch = rawResult.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]) as SearchResult;
      } catch { /* fall through to raw text */ }

      setEntries(prev => prev.map(e =>
        e.id === id ? { ...e, loading: false, result: parsed, rawText: rawResult, error: !parsed } : e
      ));
    } catch {
      setEntries(prev => prev.map(e => e.id === id ? { ...e, loading: false, error: true } : e));
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void search(input); }
  };

  return (
    <div className="flex flex-col h-full">
      {/* 검색창 */}
      <div className="shrink-0 px-8 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="flex items-center gap-3 rounded-2xl px-5 py-3.5" style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${loading ? agent.color + "40" : "rgba(255,255,255,0.07)"}`, transition: "border-color 0.3s" }}>
          {loading
            ? <Loader size={14} style={{ color: agent.color }} className="animate-spin shrink-0" />
            : <Search size={14} className="text-slate-600 shrink-0" />}
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="무엇이든 검색해줄게요! (Enter)"
            disabled={loading}
            className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-700 focus:outline-none"
            autoFocus
          />
          <button onClick={() => void search(input)} disabled={!input.trim() || loading}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-25"
            style={{ background: `${agent.color}18`, color: agent.color, border: `1px solid ${agent.color}35` }}>
            <Zap size={11} />검색
          </button>
        </div>

        {/* 빠른 검색 예시 */}
        {entries.length === 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {["AI 최신 트렌드", "Next.js 15 변경사항", "스타트업 마케팅 전략", "Claude API 가격"].map(q => (
              <button key={q} onClick={() => { setInput(q); void search(q); }}
                className="text-[10px] px-3 py-1.5 rounded-full transition-all hover:opacity-80"
                style={{ border: `1px solid ${agent.color}25`, color: agent.color, background: `${agent.color}06` }}>
                {q}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 결과 목록 */}
      <div className="flex-1 overflow-y-auto px-8 py-5 space-y-4 scrollbar-hide">
        {entries.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="relative">
              <div className="relative w-16 h-16 rounded-full overflow-hidden" style={{ outline: `2px solid ${agent.color}30`, outlineOffset: 3 }}>
                <Image src={agent.image} alt="" fill className="object-cover" sizes="64px" />
              </div>
              <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: agent.color }}>
                <Search size={10} className="text-black" />
              </div>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-300">볼따구 비어있어요!</p>
              <p className="text-xs text-slate-600 mt-1">검색어를 입력하면 뭐든 찾아드려요 🐹</p>
            </div>
          </div>
        )}
        {entries.map(entry => (
          <ResultCard key={entry.id} entry={entry} color={agent.color} />
        ))}
      </div>
    </div>
  );
}
