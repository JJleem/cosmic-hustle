"use client";

import { useState } from "react";
import AgentAvatar from "./AgentAvatar";
import AgentProfile from "./AgentProfile";
import { AGENTS, DEPARTMENTS, AgentStatus, AgentDef } from "@/lib/agents";

type Props = {
  agentStatus: Record<string, AgentStatus>;
  speaking: Record<string, boolean>;
};

export default function OfficeView({ agentStatus, speaking }: Props) {
  const [selected, setSelected] = useState<AgentDef | null>(null);

  return (
    <>
      <div className="space-y-4">
        {DEPARTMENTS.map((dept) => {
          const members = AGENTS.filter((a) => a.departmentId === dept.id);
          if (members.length === 0) return null;

          return (
            <div
              key={dept.id}
              className="rounded-2xl border p-4"
              style={{
                borderColor: `${dept.color}25`,
                background: `${dept.color}05`,
              }}
            >
              {/* 부서 헤더 */}
              <div className="flex items-center gap-1.5 mb-4">
                <dept.icon size={11} style={{ color: `${dept.color}99` }} />
                <span
                  className="text-[10px] font-semibold tracking-[0.2em]"
                  style={{ color: `${dept.color}80` }}
                >
                  {dept.name}
                </span>
                <span className="text-[9px] text-slate-700 ml-1">{dept.label}</span>
              </div>

              {/* 멤버 */}
              <div className="flex gap-6 justify-center flex-wrap">
                {members.map((agent) => (
                  <AgentAvatar
                    key={agent.id}
                    agent={agent}
                    status={agentStatus[agent.id] ?? "idle"}
                    speaking={speaking[agent.id] ?? false}
                    onClick={() => setSelected(agent)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {selected && (
        <AgentProfile agent={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
