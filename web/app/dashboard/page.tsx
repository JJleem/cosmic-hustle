import Image from "next/image";
import {
  Activity,
  AlertCircle,
  Archive,
  CheckCircle2,
  Clock3,
  FileClock,
  HeartPulse,
  History,
  RadioTower,
  ShieldCheck,
} from "lucide-react";
import HermesCommandLauncher from "@/components/ops/HermesCommandLauncher";
import HermesWorkflowLauncher from "@/components/ops/HermesWorkflowLauncher";

const employees = [
  { id: "plan", name: "플랜", role: "PM", status: "Ready", color: "#FCD34D", image: "/characters/plan/default.png" },
  { id: "wiki", name: "위키", role: "Wiki", status: "Syncing", color: "#C4B5FD", image: "/characters/wiki/default.png" },
  { id: "run", name: "런", role: "Build", status: "Ready", color: "#67E8F9", image: "/characters/run/default.png" },
  { id: "pocke", name: "포케", role: "Research", status: "Standby", color: "#86EFAC", image: "/characters/pocke/default.png" },
  { id: "ka", name: "카", role: "Analysis", status: "Standby", color: "#A78BFA", image: "/characters/ka/default.png" },
  { id: "fact", name: "팩트", role: "Review", status: "Standby", color: "#CBD5E1", image: "/characters/fact/default.png" },
  { id: "over", name: "오버", role: "Writing", status: "Standby", color: "#F9A8D4", image: "/characters/over/default.png" },
  { id: "pixel", name: "픽셀", role: "Design", status: "Standby", color: "#FDBA74", image: "/characters/pixel/default.png" },
  { id: "root", name: "루트", role: "DevOps", status: "Standby", color: "#34D399", image: "/characters/root/default.png" },
  { id: "buzz", name: "버즈", role: "Market", status: "Standby", color: "#FB923C", image: "/characters/buzz/default.png" },
  { id: "ping", name: "핑", role: "Ideas", status: "Standby", color: "#6EE7B7", image: "/characters/ping/default.png" },
];

const statusTiles = [
  { label: "Hermes", value: "Detected", detail: "~/.local/bin/hermes", icon: RadioTower, tone: "text-emerald-300" },
  { label: "Obsidian", value: "Vault linked", detail: "logs/* handoff notes", icon: Archive, tone: "text-amber-300" },
  { label: "Blog", value: "Protected", detail: "/api/blog/* unchanged", icon: ShieldCheck, tone: "text-sky-300" },
  { label: "Backend", value: "Existing", detail: "FastAPI remains source", icon: HeartPulse, tone: "text-rose-300" },
];

const jobs = [
  { title: "Hermes dashboard transition", owner: "plan", state: "scoping", time: "now" },
  { title: "Protect blog publishing contract", owner: "fact", state: "guardrail", time: "today" },
  { title: "Map web routes for dashboard V1", owner: "run", state: "ready", time: "next" },
];

const logs = [
  "docs/hermes-dashboard-transition.md added",
  "web/app/api/blog/* marked as protected",
  "Phase 1 agents limited to plan, run, wiki",
  "Hermes runs write dashboard logs and vault handoffs",
];

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-[#0b0d10] text-zinc-100">
      <div className="border-b border-white/10 bg-[#111418]">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-6 px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">
              Cosmic Hustle Operations
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal text-white">
              Hermes Employee Dashboard
            </h1>
          </div>
          <div className="flex items-center gap-2 text-sm text-zinc-300">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            Local control room
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1500px] gap-4 px-6 py-5 xl:grid-cols-[300px_minmax(0,1fr)_360px]">
        <aside className="rounded-md border border-white/10 bg-[#14181d]">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Employees</h2>
              <p className="text-xs text-zinc-500">Phase 1 first: plan, run, wiki</p>
            </div>
            <Activity className="h-4 w-4 text-emerald-300" />
          </div>
          <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2 xl:grid-cols-1">
            {employees.map((employee) => (
              <div
                key={employee.id}
                className="flex h-[64px] items-center gap-3 rounded-md border border-white/10 bg-[#0f1216] px-3"
              >
                <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-zinc-900">
                  <Image src={employee.image} alt="" fill sizes="40px" className="object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: employee.color }}
                    />
                    <p className="truncate text-sm font-medium text-zinc-100">{employee.name}</p>
                  </div>
                  <p className="truncate text-xs text-zinc-500">{employee.role}</p>
                </div>
                <span className="rounded border border-white/10 px-2 py-1 text-[11px] text-zinc-400">
                  {employee.status}
                </span>
              </div>
            ))}
          </div>
        </aside>

        <section className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            {statusTiles.map((tile) => {
              const Icon = tile.icon;
              return (
                <div key={tile.label} className="rounded-md border border-white/10 bg-[#14181d] p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                      {tile.label}
                    </p>
                    <Icon className={`h-4 w-4 ${tile.tone}`} />
                  </div>
                  <p className="mt-3 text-lg font-semibold text-white">{tile.value}</p>
                  <p className="mt-1 truncate text-xs text-zinc-500">{tile.detail}</p>
                </div>
              );
            })}
          </div>

          <HermesCommandLauncher />

          <HermesWorkflowLauncher />

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-md border border-white/10 bg-[#14181d]">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <h2 className="text-sm font-semibold text-white">Active Jobs</h2>
                <Clock3 className="h-4 w-4 text-zinc-500" />
              </div>
              <div className="divide-y divide-white/10">
                {jobs.map((job) => (
                  <div key={job.title} className="grid grid-cols-[1fr_auto] gap-4 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-zinc-100">{job.title}</p>
                      <p className="mt-1 text-xs text-zinc-500">{job.owner} · {job.time}</p>
                    </div>
                    <span className="self-center rounded border border-white/10 px-2 py-1 text-xs text-zinc-400">
                      {job.state}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-md border border-white/10 bg-[#14181d]">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <h2 className="text-sm font-semibold text-white">Waiting Approvals</h2>
                <AlertCircle className="h-4 w-4 text-amber-300" />
              </div>
              <div className="p-4">
                <div className="rounded-md border border-amber-300/20 bg-amber-300/[0.08] p-4">
                  <p className="text-sm font-medium text-amber-100">Confirm homepage switch</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    Dashboard shell is isolated at `/dashboard`. Promote it to `/` after review.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-md border border-white/10 bg-[#14181d]">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <h2 className="text-sm font-semibold text-white">Recent Work Log</h2>
              <History className="h-4 w-4 text-zinc-500" />
            </div>
            <div className="space-y-3 p-4">
              {logs.map((log) => (
                <div key={log} className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                  <p className="text-sm leading-5 text-zinc-400">{log}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-white/10 bg-[#14181d]">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <h2 className="text-sm font-semibold text-white">Obsidian Notes</h2>
              <FileClock className="h-4 w-4 text-zinc-500" />
            </div>
            <div className="space-y-2 p-4">
              {["projects/cosmic-hustle.md", "agents/plan.md", "agents/run.md", "agents/wiki.md"].map((note) => (
                <div key={note} className="rounded-md border border-white/10 bg-[#0f1216] px-3 py-2">
                  <p className="truncate text-sm text-zinc-200">{note}</p>
                  <p className="mt-1 text-xs text-zinc-500">tracked</p>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
