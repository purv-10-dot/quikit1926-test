"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Briefcase, TrendingUp, Wallet, CreditCard,
  FileSearch, PackageCheck, ClipboardList, AlertTriangle,
  ArrowRight, PackageOpen,
} from "lucide-react";
import { KpiTileSkeleton, TableSkeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";

interface DashboardData {
  kpis: { activeProjects: number; revenueMtd: number; arTotal: number; arOverdue: number; apTotal: number; apOverdue: number };
  activity: { openPrs: number; monthGrnCount: number; weekDprCount: number; openIncidentCount: number };
  overdue: {
    invoices: Array<{ id: string; ref: string; party: string; days: number; outstanding: number }>;
    bills: Array<{ id: string; ref: string; party: string; days: number; outstanding: number }>;
  };
  recentDprs: Array<{ id: string; dprDate: string; status: string; project: { name: string; code: string } | null; _count: { lines: number; materials: number } }>;
  recentRabs: Array<{ id: string; rabNumber: string; rabDate: string; status: string; total: string; project: { name: string } | null }>;
  incidents: Array<{ id: string; incidentNumber: string; incidentDate: string; severity: string; category: string; title: string; project: { name: string } | null }>;
  stockLow: Array<{ qty: number; project: string; location: string; itemCode: string; itemName: string }>;
}

const SEV: Record<string, string> = { low: "bg-gray-100 text-gray-700", medium: "bg-amber-100 text-amber-700", high: "bg-orange-100 text-orange-700", critical: "bg-red-100 text-red-700" };
const STATUS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600", submitted: "bg-amber-100 text-amber-700",
  posted: "bg-blue-100 text-blue-700", approved: "bg-green-100 text-green-700",
  paid: "bg-blue-100 text-blue-700", rejected: "bg-red-100 text-red-700",
};

function fmtInr(n: number) {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();
  useEffect(() => {
    fetch("/api/dashboard").then(r => r.json()).then(j => {
      if (j.success) setData(j.data);
      else { setErr(j.error ?? "Failed to load"); toast.error(j.error ?? "Failed to load dashboard"); }
    }).catch(e => { setErr(e.message); toast.error(e.message); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (err) return (
    <div className="p-6 max-w-2xl">
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        <div className="font-semibold mb-1">Couldn&apos;t load dashboard</div>
        <div className="text-xs">{err}</div>
      </div>
    </div>
  );
  if (!data) return (
    <div className="p-6 max-w-7xl">
      <div className="h-6 w-40 animate-pulse rounded bg-gray-200 mb-6" />
      <div className="grid gap-3 md:grid-cols-4 mb-4">
        {Array.from({ length: 4 }).map((_, i) => <KpiTileSkeleton key={i} />)}
      </div>
      <div className="grid gap-3 md:grid-cols-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => <KpiTileSkeleton key={i} />)}
      </div>
      <div className="grid gap-4 md:grid-cols-2"><TableSkeleton rows={5} cols={4} /><TableSkeleton rows={5} cols={4} /></div>
    </div>
  );

  const kpiTiles = [
    { label: "Active Projects", value: data.kpis.activeProjects.toString(), icon: Briefcase, color: "text-indigo-700 bg-indigo-50", href: "/masters/projects" },
    { label: "Revenue (MTD)", value: fmtInr(data.kpis.revenueMtd), icon: TrendingUp, color: "text-emerald-700 bg-emerald-50", href: "/finance/invoices" },
    { label: "AR Outstanding", value: fmtInr(data.kpis.arTotal), sub: data.kpis.arOverdue > 0 ? `${fmtInr(data.kpis.arOverdue)} overdue` : "on track", subWarn: data.kpis.arOverdue > 0, icon: Wallet, color: "text-emerald-700 bg-emerald-50", href: "/finance/invoices" },
    { label: "AP Outstanding", value: fmtInr(data.kpis.apTotal), sub: data.kpis.apOverdue > 0 ? `${fmtInr(data.kpis.apOverdue)} overdue` : "on track", subWarn: data.kpis.apOverdue > 0, icon: CreditCard, color: "text-rose-700 bg-rose-50", href: "/finance/bills" },
  ];

  const activityTiles = [
    { label: "Open PRs", value: data.activity.openPrs, icon: FileSearch, href: "/purchase/requisitions" },
    { label: "GRNs this month", value: data.activity.monthGrnCount, icon: PackageCheck, href: "/store/grn" },
    { label: "DPRs last 7 days", value: data.activity.weekDprCount, icon: ClipboardList, href: "/projects/dpr" },
    { label: "Open incidents", value: data.activity.openIncidentCount, icon: AlertTriangle, href: "/safety/incidents", warn: data.activity.openIncidentCount > 0 },
  ];

  return (
    <div className="p-6 max-w-7xl">
      <h1 className="text-lg font-semibold text-gray-900 mb-1">Dashboard</h1>
      <p className="text-sm text-gray-500 mb-6">Operations snapshot across projects, finance, stock, and safety.</p>

      {/* KPI tiles */}
      <section className="grid gap-3 md:grid-cols-4 mb-4">
        {kpiTiles.map(t => (
          <Link key={t.label} href={t.href} className="rounded-lg border border-gray-200 bg-white p-4 hover:border-accent-300 hover:shadow-sm transition block">
            <div className="flex items-start justify-between">
              <div className={`p-2 rounded-lg ${t.color}`}><t.icon className="h-4 w-4" /></div>
              <ArrowRight className="h-3 w-3 text-gray-300" />
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mt-3">{t.label}</div>
            <div className="text-xl font-semibold text-gray-900 mt-0.5 break-words">{t.value}</div>
            {t.sub && <div className={`text-xs mt-1 ${t.subWarn ? "text-amber-700" : "text-gray-500"}`}>{t.sub}</div>}
          </Link>
        ))}
      </section>

      {/* Activity tiles */}
      <section className="grid gap-3 md:grid-cols-4 mb-6">
        {activityTiles.map(t => (
          <Link key={t.label} href={t.href} className="rounded-lg border border-gray-200 bg-white p-3 hover:border-accent-300 transition flex items-center gap-3">
            <div className={`p-2 rounded ${t.warn && t.value > 0 ? "text-red-700 bg-red-50" : "text-gray-600 bg-gray-50"}`}><t.icon className="h-4 w-4" /></div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-gray-500">{t.label}</div>
              <div className={`text-lg font-semibold ${t.warn && t.value > 0 ? "text-red-700" : "text-gray-900"}`}>{t.value}</div>
            </div>
          </Link>
        ))}
      </section>

      <div className="grid gap-4 md:grid-cols-2 mb-6">
        {/* Overdue invoices */}
        <section className="rounded-lg border border-gray-200 bg-white">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Top Overdue Invoices</h2>
            <Link href="/reports/ar-aging" className="text-xs text-accent-700 hover:underline">AR aging →</Link>
          </div>
          {data.overdue.invoices.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-gray-500">No overdue invoices. Clean slate.</div>
          ) : (
            <table className="w-full text-sm">
              <tbody>{data.overdue.invoices.map(i => (
                <tr key={i.id} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-mono text-xs"><Link href={`/finance/invoices/${i.id}`} className="text-accent-700 hover:underline">{i.ref}</Link></td>
                  <td className="px-4 py-2 text-xs text-gray-600">{i.party}</td>
                  <td className="px-4 py-2 text-xs text-right text-red-700 font-semibold">{i.days}d</td>
                  <td className="px-4 py-2 text-right font-medium">{fmtInr(i.outstanding)}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </section>

        {/* Overdue bills */}
        <section className="rounded-lg border border-gray-200 bg-white">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Top Overdue Bills</h2>
            <Link href="/reports/ap-aging" className="text-xs text-accent-700 hover:underline">AP aging →</Link>
          </div>
          {data.overdue.bills.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-gray-500">No overdue bills.</div>
          ) : (
            <table className="w-full text-sm">
              <tbody>{data.overdue.bills.map(b => (
                <tr key={b.id} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-mono text-xs"><Link href={`/finance/bills/${b.id}`} className="text-accent-700 hover:underline">{b.ref}</Link></td>
                  <td className="px-4 py-2 text-xs text-gray-600">{b.party}</td>
                  <td className="px-4 py-2 text-xs text-right text-red-700 font-semibold">{b.days}d</td>
                  <td className="px-4 py-2 text-right font-medium">{fmtInr(b.outstanding)}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-2 mb-6">
        {/* Recent DPRs */}
        <section className="rounded-lg border border-gray-200 bg-white">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Recent DPRs</h2>
            <Link href="/projects/dpr" className="text-xs text-accent-700 hover:underline">All →</Link>
          </div>
          {data.recentDprs.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-gray-500">No DPRs yet.</div>
          ) : (
            <table className="w-full text-sm">
              <tbody>{data.recentDprs.map(d => (
                <tr key={d.id} className="border-t border-gray-100">
                  <td className="px-4 py-2 text-xs"><Link href={`/projects/dpr/${d.id}`} className="text-accent-700 hover:underline">{new Date(d.dprDate).toISOString().slice(0, 10)}</Link></td>
                  <td className="px-4 py-2 text-xs text-gray-600">{d.project?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-xs text-gray-500">{d._count.lines} activities · {d._count.materials} materials</td>
                  <td className="px-4 py-2"><span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${STATUS[d.status] ?? "bg-gray-100"}`}>{d.status}</span></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </section>

        {/* Recent RABs */}
        <section className="rounded-lg border border-gray-200 bg-white">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Recent RABs</h2>
            <Link href="/projects/rab" className="text-xs text-accent-700 hover:underline">All →</Link>
          </div>
          {data.recentRabs.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-gray-500">No RABs yet.</div>
          ) : (
            <table className="w-full text-sm">
              <tbody>{data.recentRabs.map(r => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-mono text-xs"><Link href={`/projects/rab/${r.id}`} className="text-accent-700 hover:underline">{r.rabNumber}</Link></td>
                  <td className="px-4 py-2 text-xs text-gray-600">{r.project?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-xs text-gray-500">{new Date(r.rabDate).toISOString().slice(0, 10)}</td>
                  <td className="px-4 py-2 text-right font-medium">{fmtInr(Number(r.total))}</td>
                  <td className="px-4 py-2"><span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${STATUS[r.status] ?? "bg-gray-100"}`}>{r.status}</span></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Open incidents */}
        <section className="rounded-lg border border-gray-200 bg-white">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Open Safety Incidents</h2>
            <Link href="/safety/incidents" className="text-xs text-accent-700 hover:underline">All →</Link>
          </div>
          {data.incidents.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-gray-500">No open incidents.</div>
          ) : (
            <table className="w-full text-sm">
              <tbody>{data.incidents.map(i => (
                <tr key={i.id} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-mono text-xs">{i.incidentNumber}</td>
                  <td className="px-4 py-2 text-xs"><span className={`font-semibold uppercase text-[10px] px-1.5 py-0.5 rounded ${SEV[i.severity] ?? "bg-gray-100"}`}>{i.severity}</span></td>
                  <td className="px-4 py-2 text-xs text-gray-500">{i.category}</td>
                  <td className="px-4 py-2 text-xs text-gray-700">{i.title}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </section>

        {/* Low stock */}
        <section className="rounded-lg border border-gray-200 bg-white">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Low Stock</h2>
            <Link href="/reports/stock-valuation" className="text-xs text-accent-700 hover:underline">Valuation →</Link>
          </div>
          {data.stockLow.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-gray-500 flex flex-col items-center gap-2"><PackageOpen className="h-6 w-6 text-gray-300" /> No stock yet. Post some GRNs.</div>
          ) : (
            <table className="w-full text-sm">
              <tbody>{data.stockLow.map((s, idx) => (
                <tr key={idx} className="border-t border-gray-100">
                  <td className="px-4 py-2"><div className="text-xs font-mono">{s.itemCode}</div><div className="text-xs text-gray-700">{s.itemName}</div></td>
                  <td className="px-4 py-2 text-xs text-gray-500">{s.project} · {s.location}</td>
                  <td className="px-4 py-2 text-right font-medium text-amber-700">{s.qty}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
