"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { Search, Trash2, Loader2 } from "lucide-react";
import { AGENT_MAP } from "@/lib/agents";
import { type Report, stripMarkdown } from "@/lib/reportUtils";

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
type SortBy = "newest" | "oldest" | "name";

const SORT_OPTIONS: { id: SortBy; label: string }[] = [
  { id: "newest", label: "최신순" },
  { id: "oldest", label: "오래된순" },
  { id: "name",   label: "이름순" },
];

type Props = {
  reports: Report[];
  onSelect: (report: Report) => void;
  onDelete: (id: string) => void;
};

export default function ReportList({ reports, onSelect, onDelete }: Props) {
  const [search, setSearch] = useState("");
  const [filterAgent, setFilterAgent] = useState<string | null>(null);
  const [filterDate, setFilterDate] = useState<DateFilter | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>("newest");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [serverResults, setServerResults] = useState<Report[] | null>(null);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasFilter = !!(search.trim() || filterAgent || filterDate || sortBy !== "newest");

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!hasFilter) { setServerResults(null); return; }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams();
        if (search.trim()) params.set("q", search.trim());
        if (filterAgent) params.set("agent", filterAgent);
        if (filterDate) params.set("date", filterDate);
        params.set("sort", sortBy);
        const res = await fetch(`/api/reports?${params}`);
        if (res.ok) {
          const data = (await res.json()) as Array<{ id: string; sessionId: string; agentId: string; topic: string; content: string; createdAt: string }>;
          setServerResults(data.map((r) => ({ ...r, createdAt: new Date(r.createdAt) })));
        }
      } finally {
        setSearching(false);
      }
    }, 300);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filterAgent, filterDate, sortBy]);

  const filtered = serverResults ?? reports;

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await fetch(`/api/reports/${id}`, { method: "DELETE" });
      onDelete(id);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <p className="text-[10px] text-slate-300 tracking-[0.2em] uppercase mb-3 font-bold">보고 현황</p>

      {/* 검색 + 필터 */}
      <div className="shrink-0 flex flex-col gap-2 mb-3">
        <div className="relative">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="보고서 검색..."
            className="w-full pl-7 pr-7 py-1.5 rounded-lg text-[11px] text-slate-300 placeholder:text-slate-700 focus:outline-none"
            style={{ background: "#0c1220", border: "1px solid #1e2a3a" }}
          />
          {searching && <Loader2 size={10} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 animate-spin" />}
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
        <div className="flex items-center gap-1.5">
          <span className="text-[8px] text-slate-700 font-bold tracking-wider uppercase">정렬</span>
          {SORT_OPTIONS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setSortBy(id)}
              className="px-2.5 py-1 rounded-full text-[9px] font-bold transition-all"
              style={sortBy === id
                ? { background: "#1e2a40", color: "#93c5fd", border: "1px solid #2a4a6a" }
                : { color: "#374151", border: "1px solid #1a2235" }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 리포트 목록 */}
      {filtered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-slate-400 text-xs">
            {reports.length === 0 ? "접수된 보고서 없음" : "검색 결과 없음"}
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2 scrollbar-hide">
          {filtered.map((r) => {
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
                onClick={() => onSelect(r)}
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
                <p className="text-[11px] text-slate-300 mt-1 line-clamp-2 leading-relaxed">{highlightPreview}</p>
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
  );
}
