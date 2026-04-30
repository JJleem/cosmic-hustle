"use client";

import { useState, useEffect } from "react";
import { Plus, X, AlertCircle } from "lucide-react";

type Memo = { id: string; text: string; createdAt: number };

export default function MemoBoard() {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/memos")
      .then((r) => r.json())
      .then((rows: Memo[]) => setMemos(rows))
      .catch(() => {});
  }, []);

  const showError = (setter: (v: string | null) => void, msg: string) => {
    setter(msg);
    setTimeout(() => setter(null), 3500);
  };

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
      if (!res.ok) throw new Error();
      const memo = await res.json() as Memo;
      setMemos((prev) => [memo, ...prev]);
      setInput("");
    } catch {
      showError(setAddError, "저장 실패. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    const snapshot = memos;
    setMemos((prev) => prev.filter((m) => m.id !== id));
    try {
      const res = await fetch(`/api/memos/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setMemos(snapshot);
      showError(setRemoveError, "삭제 실패. 다시 시도해 주세요.");
    }
  };

  return (
    <div className="flex flex-col h-full gap-3">
      <p className="text-[10px] text-slate-300 tracking-[0.2em] uppercase font-bold shrink-0">
        메모
      </p>

      <form onSubmit={(e) => { e.preventDefault(); void add(); }} className="flex gap-2 shrink-0">
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

      {addError && (
        <div className="shrink-0 flex items-center gap-1.5 text-[10px] text-red-300 px-2 py-1.5 rounded-lg border border-red-500/30 bg-red-900/15">
          <AlertCircle size={10} className="shrink-0" />
          {addError}
        </div>
      )}

      {removeError && (
        <div className="shrink-0 flex items-center gap-1.5 text-[10px] text-red-300 px-2 py-1.5 rounded-lg border border-red-500/30 bg-red-900/15">
          <AlertCircle size={10} className="shrink-0" />
          {removeError}
        </div>
      )}

      {memos.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-slate-400 text-xs">메모 없음</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2 scrollbar-hide">
          {memos.map((m) => (
            <div key={m.id} className="flex items-start gap-2 rounded-xl border border-slate-500 bg-slate-700/50 px-3 py-2.5 group">
              <p className="flex-1 text-xs text-white leading-relaxed">{m.text}</p>
              <button onClick={() => void remove(m.id)} className="shrink-0 text-slate-400 hover:text-white opacity-0 group-hover:opacity-100 transition-all mt-0.5">
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
