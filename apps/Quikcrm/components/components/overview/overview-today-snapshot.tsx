"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { TodaySnapshotMetric } from "@/lib/dashboard/executive-overview-advanced-types";

function TodayMetricCard({ metric }: { metric: TodaySnapshotMetric }) {
  const delta = metric.value - metric.priorValue;
  const isUp = delta > 0;
  const isDown = delta < 0;
  const isNeutral = delta === 0;
  const displayValue = metric.display ?? String(metric.value);

  return (
    <div className="rounded-lg border border-crm-border bg-white p-3 shadow-sm">
      <p className="text-xs text-crm-muted">{metric.label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-crm-text">{displayValue}</p>
      <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
        {isNeutral ? (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
            <Minus className="h-3 w-3" /> vs yesterday
          </span>
        ) : isUp ? (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
            <ArrowUpRight className="h-3 w-3" />+{delta} vs yesterday
          </span>
        ) : (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-50 px-2 py-0.5 font-medium text-rose-700">
            <ArrowDownRight className="h-3 w-3" />
            {delta} vs yesterday
          </span>
        )}
      </div>
    </div>
  );
}

export function OverviewTodaySnapshot({ metrics }: { metrics: TodaySnapshotMetric[] }) {
  return (
    <section aria-label="Today's CRM snapshot" className="crm-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-crm-text">Today&apos;s CRM snapshot</h2>
          <p className="text-xs text-crm-muted">10-second view of today vs yesterday</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {metrics.map((m) => (
          <TodayMetricCard key={m.label} metric={m} />
        ))}
      </div>
    </section>
  );
}
