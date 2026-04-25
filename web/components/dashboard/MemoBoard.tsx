"use client";

import { useState, useEffect } from "react";
import { Plus, X } from "lucide-react";

type Memo = { id: string; text: string; createdAt: number };

export default function MemoBoard() {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/memos")
      .then((r) => r.json())
      .then((rows: Memo[]) => setMemos(rows))
      .catch(() => {});
  }, []);

  const add = async () => {
    const text = input.trim();
    if (!text || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/memos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const memo = await res.json() as Memo;
      setMemos((prev) => [memo, ...prev]);
      setInput("");
    } catch {
      // 저장 실패 시 로컬에만 추가
      setMemos((prev) => [{ id: crypto.randomUUID(), text, createdAt: Math.floor(Date.now() / 1000) }, ...prev]);
      setInput("");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setMemos((prev) => prev.filter((m) => m.id !== id));
    fetch(`/api/memos/${id}`, { method: "DELETE" }).catch(() => {});
  };

  return (
    <div className="flex flex-col h-full gap-3">
      <p className="text-[10px] text-slate-300 tracking-[0.2em] uppercase font-bold shrink-0">
        메모
      </p>

      <form onSubmit={(e) => { e.preventDefault(); add(); }} className="flex gap-2 shrink-0">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="메모 추가..."
          className="flex-1 bg-slate-700/60 border border-slate-500 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-slate-300 transition-colors"
        />
        <button
          type="submit"
          disabled={!input.trim() || saving}
          className="bg-slate-600 hover:bg-slate-500 disabled:opacity-30 border border-slate-500 rounded-xl px-3 py-2 transition-colors"
        >
          <Plus size={13} className="text-white" />
        </button>
      </form>

      {memos.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-slate-400 text-xs">메모 없음</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2 scrollbar-hide">
          {memos.map((m) => (
            <div key={m.id} className="flex items-start gap-2 rounded-xl border border-slate-500 bg-slate-700/50 px-3 py-2.5 group">
              <p className="flex-1 text-xs text-white leading-relaxed">{m.text}</p>
              <button onClick={() => remove(m.id)} className="shrink-0 text-slate-400 hover:text-white opacity-0 group-hover:opacity-100 transition-all mt-0.5">
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
