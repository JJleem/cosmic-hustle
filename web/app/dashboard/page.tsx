import Image from "next/image";
import { Archive, HeartPulse, RadioTower, ShieldCheck } from "lucide-react";
import HermesCommandLauncher from "@/components/ops/HermesCommandLauncher";
import HermesWorkflowLauncher from "@/components/ops/HermesWorkflowLauncher";
import VaultSyncPanel from "@/components/ops/VaultSyncPanel";

const employees = [
  { id: "plan", name: "플랜", role: "PM · 기획", status: "대기", active: true, color: "#FCD34D", image: "/characters/plan/default.png" },
  { id: "wiki", name: "위키", role: "사서 · 지식관리", status: "동기화 중", active: true, color: "#C4B5FD", image: "/characters/wiki/default.png" },
  { id: "run", name: "런", role: "개발자", status: "대기", active: true, color: "#67E8F9", image: "/characters/run/default.png" },
  { id: "pocke", name: "포케", role: "리서처", status: "준비", active: false, color: "#86EFAC", image: "/characters/pocke/default.png" },
  { id: "ka", name: "카", role: "분석가", status: "준비", active: false, color: "#A78BFA", image: "/characters/ka/default.png" },
  { id: "fact", name: "팩트", role: "검토자", status: "준비", active: false, color: "#CBD5E1", image: "/characters/fact/default.png" },
  { id: "over", name: "오버", role: "작가", status: "준비", active: false, color: "#F9A8D4", image: "/characters/over/default.png" },
  { id: "pixel", name: "픽셀", role: "디자이너", status: "준비", active: false, color: "#FDBA74", image: "/characters/pixel/default.png" },
  { id: "root", name: "루트", role: "DevOps", status: "준비", active: false, color: "#34D399", image: "/characters/root/default.png" },
  { id: "buzz", name: "버즈", role: "마케터", status: "준비", active: false, color: "#FB923C", image: "/characters/buzz/default.png" },
  { id: "ping", name: "핑", role: "아이디어 수집", status: "준비", active: false, color: "#6EE7B7", image: "/characters/ping/default.png" },
];

const systemChips = [
  { label: "헤르메스", value: "연결됨", dot: "bg-emerald-400", icon: RadioTower },
  { label: "옵시디언", value: "볼트 연결됨", dot: "bg-amber-400", icon: Archive },
  { label: "블로그", value: "보호됨", dot: "bg-sky-400", icon: ShieldCheck },
  { label: "백엔드", value: "유지 중", dot: "bg-rose-400", icon: HeartPulse },
];

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-[#0b0d10] text-zinc-100">

      {/* 헤더 */}
      <header className="border-b border-white/10 bg-[#111418]">
        <div className="mx-auto max-w-[1400px] px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-300">
                코스믹 허슬
              </p>
              <h1 className="mt-1 text-xl font-semibold text-white">관제 대시보드</h1>
            </div>

            {/* 시스템 상태 칩 */}
            <div className="flex flex-wrap items-center gap-2">
              {systemChips.map((chip) => (
                <div
                  key={chip.label}
                  className="flex items-center gap-2 rounded-full border border-white/10 bg-[#0f1216] px-3 py-1.5"
                >
                  <span className={`h-2 w-2 rounded-full ${chip.dot}`} />
                  <span className="text-xs text-zinc-400">{chip.label}</span>
                  <span className="text-xs font-medium text-zinc-200">{chip.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* 본문 */}
      <div className="mx-auto grid max-w-[1400px] gap-5 px-6 py-5 xl:grid-cols-[240px_1fr]">

        {/* 왼쪽: 직원 현황 */}
        <aside>
          <div className="rounded-md border border-white/10 bg-[#14181d]">
            <div className="border-b border-white/10 px-4 py-3">
              <h2 className="text-sm font-semibold text-white">직원 현황</h2>
              <p className="mt-0.5 text-xs text-zinc-500">Phase 1 활성: plan · run · wiki</p>
            </div>
            <div className="divide-y divide-white/[0.06]">
              {employees.map((emp) => (
                <div
                  key={emp.id}
                  className={`flex items-center gap-3 px-3 py-2.5 ${emp.active ? "" : "opacity-50"}`}
                >
                  <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md bg-zinc-900">
                    <Image src={emp.image} alt="" fill sizes="32px" className="object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: emp.color }}
                      />
                      <p className="text-sm font-medium text-zinc-100">{emp.name}</p>
                    </div>
                    <p className="truncate text-xs text-zinc-500">{emp.role}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] border ${
                      emp.active
                        ? "border-amber-300/30 text-amber-200"
                        : "border-white/10 text-zinc-500"
                    }`}
                  >
                    {emp.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* 오른쪽: 실행 패널 (실제 데이터) */}
        <section className="space-y-5">
          <VaultSyncPanel />
          <HermesCommandLauncher />
          <HermesWorkflowLauncher />
        </section>

      </div>
    </main>
  );
}
