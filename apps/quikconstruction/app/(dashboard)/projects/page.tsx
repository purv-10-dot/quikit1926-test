import Link from "next/link";
import {
  ListTree, ClipboardList, AlertTriangle,
  Calculator, Briefcase, Receipt, GanttChart,
} from "lucide-react";

const CORE = [
  { href: "/projects/boq",       label: "BOQ",        description: "Bill of Quantities — hierarchical item list with qty × rate per project. Lock once approved.", icon: ListTree },
  { href: "/projects/dpr",       label: "DPR",        description: "Daily Progress Report — one header per (project, date). Captures work done, labour, machinery.", icon: ClipboardList },
  { href: "/projects/hindrance", label: "Hindrance",  description: "Log blockers — weather, permits, material shortage. Used for delay claims.", icon: AlertTriangle },
];

const EXTENDED = [
  { href: "/projects/estimation",  label: "Estimation",    description: "Pre-BOQ cost estimate. Convert to BOQ once approved.",                   icon: Calculator },
  { href: "/projects/work-orders", label: "Work Orders",   description: "Sub-contract scope packages to contractors with per-line rates.",         icon: Briefcase },
  { href: "/projects/rab",         label: "RAB (Running Account Bill)", description: "Progressive billing to client against a locked BOQ.",         icon: Receipt },
  { href: "/projects/gantt",       label: "Gantt",         description: "Schedule BOQ items with start/end dates + % complete; SVG timeline.", icon: GanttChart },
];

const DEFERRED: string[] = [];

export default function ProjectsIndex() {
  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-lg font-semibold text-gray-900 mb-1">Projects</h1>
      <p className="text-sm text-gray-500 mb-6">
        Project operations — BOQ is the scope, DPR is the daily pulse, Hindrance is the delay record, RAB is the bill.
      </p>

      <section className="mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Core</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {CORE.map((p) => (
            <Link key={p.href} href={p.href}
              className="flex items-start gap-3 p-4 rounded-lg border border-gray-200 bg-white hover:border-accent-300 hover:shadow-sm transition">
              <div className="p-2 rounded-lg bg-accent-50 text-accent-700"><p.icon className="h-4 w-4" /></div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-900">{p.label}</div>
                <div className="text-xs text-gray-600 mt-0.5">{p.description}</div>
              </div>
              <span className="text-[10px] font-semibold uppercase bg-accent-100 text-accent-700 px-1.5 py-0.5 rounded">LIVE</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Extended (Phase 4b)</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {EXTENDED.map((p) => (
            <Link key={p.href} href={p.href}
              className="flex items-start gap-3 p-4 rounded-lg border border-gray-200 bg-white hover:border-accent-300 hover:shadow-sm transition">
              <div className="p-2 rounded-lg bg-accent-50 text-accent-700"><p.icon className="h-4 w-4" /></div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-900">{p.label}</div>
                <div className="text-xs text-gray-600 mt-0.5">{p.description}</div>
              </div>
              <span className="text-[10px] font-semibold uppercase bg-accent-100 text-accent-700 px-1.5 py-0.5 rounded">LIVE</span>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Deferred</h2>
        <div className="flex flex-wrap gap-1.5">
          {DEFERRED.map((d) => <span key={d} className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded px-2 py-0.5">{d}</span>)}
        </div>
      </section>
    </div>
  );
}
