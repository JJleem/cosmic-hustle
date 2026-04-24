export type ProjectRecord = {
  id: string;
  topic: string;
  completedAt: Date;
};

type Props = { projects: ProjectRecord[] };

export default function ProjectHistory({ projects }: Props) {
  return (
    <div className="flex flex-col h-full">
      <p className="text-[10px] text-slate-300 tracking-[0.2em] uppercase mb-4 font-bold">
        프로젝트 내역
      </p>

      {projects.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-slate-400 text-xs">완료된 프로젝트 없음</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2 scrollbar-hide">
          {projects.map((p, i) => (
            <div key={p.id} className="flex items-start gap-3 rounded-xl border border-slate-500 bg-slate-700/50 p-3 hover:bg-slate-700 transition-colors cursor-pointer">
              <span className="text-[10px] text-slate-400 mt-0.5 w-5 shrink-0 font-mono">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <p className="text-xs text-white font-semibold truncate">{p.topic}</p>
                <p className="text-[9px] text-slate-400 mt-0.5">
                  {p.completedAt.toLocaleDateString("ko-KR")}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
