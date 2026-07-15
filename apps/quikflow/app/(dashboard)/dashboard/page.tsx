"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Zap, Clock, CheckCircle2, AlertTriangle, Plus } from "lucide-react";
import { apiGet } from "@/lib/client/fetcher";
import { StatusPill } from "@/components/ui/status-pill";
import { LoadingState, ErrorState } from "@/components/ui/page-states";
import type { DashboardSummary } from "@/types";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => apiGet<DashboardSummary>("/api/dashboard"),
  });

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">Good day 👋</h1>
          <p className="mt-1 text-sm text-gray-500">Here&apos;s what your workflows have been up to.</p>
        </div>
        <Link
          href="/workflows/new"
          className="flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700"
        >
          <Plus className="h-4 w-4" />
          Create workflow
        </Link>
      </div>

      {isLoading ? <LoadingState /> : null}
      {error ? <ErrorState message={(error as Error).message} /> : null}

      {data ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile icon={Zap} label="Active workflows" value={data.activeWorkflows} sub={`+${data.newThisMonth} this month`} />
            <StatTile icon={Clock} label="Runs today" value={data.runsToday} sub="across your workflows" />
            <StatTile
              icon={CheckCircle2}
              label="Success rate"
              value={data.successRate === null ? "—" : `${data.successRate}%`}
              sub="last 7 days"
            />
            <StatTile
              icon={AlertTriangle}
              label="Needs attention"
              value={data.needsAttention.total}
              sub={`${data.needsAttention.failed} failed · ${data.needsAttention.waiting} waiting`}
              warn
            />
          </div>

          <div className="mt-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">Recent activity</h2>
              <Link href="/runs" className="text-sm font-medium text-accent-700 hover:underline">
                View all
              </Link>
            </div>
            {data.recentActivity.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">No runs yet.</p>
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {data.recentActivity.map((r) => (
                  <li key={r.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <StatusPill status={r.status} />
                      <div>
                        <p className="text-sm font-medium">{r.workflowName}</p>
                        {r.detail ? <p className="text-xs text-gray-500">{r.detail}</p> : null}
                      </div>
                    </div>
                    <span className="text-xs text-gray-400">{timeAgo(r.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  warn,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  sub: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-5">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Icon className={warn ? "h-4 w-4 text-amber-500" : "h-4 w-4 text-accent-600"} />
        {label}
      </div>
      <p className="mt-3 text-3xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-gray-400">{sub}</p>
    </div>
  );
}
