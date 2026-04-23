type Props = { topic: string };

export default function ReportView({ topic }: Props) {
  return (
    <div className="w-full max-w-xl mt-6">
      <div className="rounded-3xl border border-slate-700/40 bg-slate-900/50 p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-1 h-6 rounded-full bg-violet-400" />
          <h2 className="text-sm font-semibold text-slate-200 tracking-wide">
            리서치 리포트
          </h2>
        </div>

        <p className="text-xs text-slate-500 mb-4">주제: {topic}</p>

        <div className="space-y-4 text-sm text-slate-300 leading-relaxed">
          <p>
            이것은 데모 리포트입니다. 실제 에이전트가 연결되면 여기에
            위키 → 포케 → 카 → 오버 → 팩트 순서로 생성된 리서치 내용이 스트리밍됩니다.
          </p>
          <p>
            핑 인턴이 수집한 아이디어와 위키 대리의 지식 업데이트도 함께 표시됩니다.
          </p>
        </div>

        <div className="mt-6 pt-6 border-t border-slate-800">
          <p className="text-xs text-slate-600 text-center">
            아이디어 카드 (핑 인턴)
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            {["연관 개념 A", "연관 개념 B", "뜬금없지만 맞을수도?"].map((idea) => (
              <span
                key={idea}
                className="text-xs bg-emerald-900/30 border border-emerald-700/40 text-emerald-300 rounded-full px-3 py-1"
              >
                {idea}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
