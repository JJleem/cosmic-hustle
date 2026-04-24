type Props = {
  topic: string | null;
  phase: "idle" | "working" | "done";
};

export default function OngoingProject({ topic, phase }: Props) {
  return (
    <div className="flex flex-col h-full">
      <p className="text-[10px] text-slate-300 tracking-[0.2em] uppercase mb-4 font-bold">
        진행중인 프로젝트
      </p>

      {phase === "idle" && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-slate-400 text-xs">진행중인 프로젝트 없음</p>
        </div>
      )}

      {(phase === "working" || phase === "done") && topic && (
        <div className="flex-1 space-y-3">
          <div className="rounded-xl border border-slate-500 bg-slate-700/50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-1.5 h-1.5 rounded-full ${phase === "working" ? "bg-emerald-400 animate-pulse" : "bg-slate-400"}`} />
              <span className={`text-[10px] font-bold tracking-widest ${phase === "working" ? "text-emerald-400" : "text-slate-300"}`}>
                {phase === "working" ? "LIVE" : "DONE"}
              </span>
            </div>
            <p className="text-sm text-white font-semibold leading-relaxed">{topic}</p>
          </div>
        </div>
      )}
    </div>
  );
}
