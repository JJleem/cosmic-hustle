"use client";

import Image from "next/image";
import { X } from "lucide-react";
import { AgentDef, DEPT_MAP } from "@/lib/agents";

type Props = { agent: AgentDef; onClose: () => void };

export default function AgentProfile({ agent, onClose }: Props) {
  const dept = DEPT_MAP[agent.departmentId];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-80 rounded-3xl border border-slate-600 bg-slate-800 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: `0 0 60px 10px ${agent.glow}` }}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors">
          <X size={16} />
        </button>

        <div className="flex items-center gap-4 mb-5">
          <div
            className="relative rounded-full overflow-hidden shrink-0"
            style={{ width: 72, height: 72, outline: `2px solid ${agent.color}`, outlineOffset: 3, boxShadow: `0 0 20px 4px ${agent.glow}` }}
          >
            <Image src={agent.image} alt={agent.name} fill className="object-cover" sizes="72px" />
          </div>

          <div>
            <h2 className="text-lg font-bold text-white">{agent.name}</h2>
            <p className="text-xs text-slate-300 mt-0.5">
              {agent.title} · <span className="text-slate-200">{agent.role}</span>
            </p>
            {dept && (
              <div
                className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider"
                style={{ background: `${dept.color}25`, border: `1px solid ${dept.color}60`, color: dept.color }}
              >
                <dept.icon size={10} />
                {dept.label}
              </div>
            )}
          </div>
        </div>

        <div className="h-px bg-slate-600 mb-4" />

        <div>
          <p className="text-[10px] text-slate-300 tracking-[0.15em] uppercase mb-3 font-bold">
            담당 업무
          </p>
          <ul className="space-y-2">
            {agent.responsibilities.map((r) => (
              <li key={r} className="flex items-start gap-2 text-xs text-slate-200">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: agent.color }} />
                {r}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
