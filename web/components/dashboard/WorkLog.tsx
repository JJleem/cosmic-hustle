import { AGENT_MAP } from "@/lib/agents";

export type LogEntry = {
  id: string;
  agentId: string;
  message: string;
  type: "idle" | "work" | "done";
  time: Date;
};

type Props = { logs: LogEntry[] };

export default function WorkLog({ logs }: Props) {
  return (
    <div className="flex flex-col h-full">
      <p className="text-[10px] text-slate-500 tracking-[0.2em] uppercase mb-4">
        업무일지
      </p>

      {logs.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-slate-700 text-xs">기록 없음</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-1.5 scrollbar-hide">
          {[...logs].reverse().map((log) => {
            const agent = AGENT_MAP[log.agentId];
            return (
              <div key={log.id} className="flex items-start gap-2 py-1">
                <span className="text-[9px] text-slate-700 mt-0.5 shrink-0 w-12">
                  {log.time.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span
                  className="text-[9px] font-semibold shrink-0 mt-0.5"
                  style={{ color: `${agent?.color}99` }}
                >
                  {agent?.name} {agent?.role && `(${agent.role})`}
                </span>
                <p
                  className={`text-[11px] leading-snug ${
                    log.type === "work" ? "text-slate-300" : "text-slate-600"
                  }`}
                >
                  {log.message}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
