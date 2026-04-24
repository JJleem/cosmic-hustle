import { AGENT_MAP } from "@/lib/agents";

export type Report = {
  id: string;
  agentId: string;
  topic: string;
  content: string;
  createdAt: Date;
};

type Props = { reports: Report[] };

export default function ReportBoard({ reports }: Props) {
  return (
    <div className="flex flex-col h-full">
      <p className="text-[10px] text-slate-300 tracking-[0.2em] uppercase mb-4 font-bold">
        보고 현황
      </p>

      {reports.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-slate-400 text-xs">접수된 보고서 없음</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2 scrollbar-hide">
          {reports.map((r) => {
            const agent = AGENT_MAP[r.agentId];
            return (
              <div key={r.id} className="rounded-xl border border-slate-500 bg-slate-700/50 p-3 hover:bg-slate-700 transition-colors cursor-pointer">
                <div className="flex items-center gap-2 mb-1.5">
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
                <p className="text-[11px] text-slate-300 mt-1 line-clamp-2">{r.content}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
