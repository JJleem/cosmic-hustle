"use client";

import { useState } from "react";
import MemoBoard from "./MemoBoard";
import WikiViewer from "./WikiViewer";

type Tab = "memo" | "wiki";

export default function MemoWikiPanel() {
  const [tab, setTab] = useState<Tab>("wiki");

  return (
    <div className="flex flex-col h-full">
      {/* 탭 헤더 */}
      <div className="flex items-center gap-1 mb-4 shrink-0">
        {(["wiki", "memo"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-3 py-1 rounded-full text-[10px] font-bold tracking-[0.15em] uppercase transition-all"
            style={
              tab === t
                ? { background: "#1e293b", color: "#e2e8f0", border: "1px solid #334155" }
                : { background: "transparent", color: "#475569", border: "1px solid transparent" }
            }
          >
            {t === "wiki" ? "위키" : "메모"}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "wiki" ? <WikiViewer /> : <MemoBoard />}
      </div>
    </div>
  );
}
