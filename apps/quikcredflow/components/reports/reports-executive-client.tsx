"use client";

import { useCallback, useEffect, useMemo, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, Calendar, Sparkles, Users, type LucideIcon } from "lucide-react";
import { ReportsToolbar } from "./reports-toolbar";
import { CannedReportChart } from "./canned-report-chart";
import { ExecutiveKpiGrid } from "@/components/dashboard/executive-kpi-grid";
import { ActivityMixChart } from "@/components/dashboard/activity-mix-chart";
import { ChartCardSkeleton } from "@/components/dashboard/chart-card";
import {
  leadsByStageHref,
  opportunitiesByStageHref,
} from "@/lib/dashboard/urls";
import type { DashboardSummaryDto } from "@/lib/dashboard/types";
import {
  presetToRange,
  type RangePreset,
  type RangeValue,
} from "@/components/dashboard/date-range-picker";

/** Premium framed card used for the Overview charts. */
function OverviewChartCard({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-crm-border bg-white shadow-sm transition hover:shadow-md">
      <div className="flex items-center gap-2.5 border-b border-crm-border bg-gradient-to-r from-crm-panel/60 to-white px-4 py-3">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent-50 text-accent-600">
          <Icon size={16} />
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-crm-text">{title}</h3>
          {subtitle ? (
            <p className="truncate text-[11px] text-crm-muted">{subtitle}</p>
          ) : null}
        </div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function clientTz(): string {
  if (typeof Intl === "undefined") return "UTC";
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * The executive API (shared dashboard `parseFilters`) accepts only
 * `YYYY-MM-DD`, but the shared ReportsToolbar writes full ISO instants to the
 * URL. Convert an instant (or pass-through a date) to the calendar date as
 * observed in the user's tz so "Today"/"7d"/custom ranges don't 400.
 */
function toIsoDay(value: string, tz: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d); // en-CA → YYYY-MM-DD
  } catch {
    return value.slice(0, 10);
  }
}

function detectPreset(value: RangeValue): RangePreset {
  for (const p of ["today", "7d", "30d", "month", "quarter"] as const) {
    const r = presetToRange(p);
    if (r.fromIso === value.fromIso && r.toIso === value.toIso) return p;
  }
  return "custom";
}

function rangeLabel(preset: RangePreset, value: RangeValue): string {
  switch (preset) {
    case "today":
      return "today";
    case "7d":
      return "last 7 days";
    case "30d":
      return "last 30 days";
    case "month":
      return "this month";
    case "quarter":
      return "this quarter";
    default:
      return `${value.fromIso.slice(0, 10)} → ${value.toIso.slice(0, 10)}`;
  }
}

function labelForPrior(preset: RangePreset): string {
  switch (preset) {
    case "today":
      return "today";
    case "7d":
      return "prior 7d";
    case "30d":
      return "prior 30d";
    case "month":
      return "prior month";
    case "quarter":
      return "prior quarter";
    default:
      return "prior period";
  }
}

async function fetchExecutive(qs: string, tz: string): Promise<DashboardSummaryDto> {
  const res = await fetch(`/api/reports/executive?${qs}`, {
    credentials: "include",
    headers: { "X-Client-TZ": tz },
  });
  const body = (await res.json()) as
    | { success: true; data: DashboardSummaryDto }
    | { success: false; error: string };
  if (!res.ok || !body.success) {
    throw new Error(!body.success ? body.error : `Load failed (${res.status})`);
  }
  return body.data;
}

interface ReportsExecutiveClientProps {
  ownerOptions: { value: string; label: string }[];
}

export function ReportsExecutiveClient({ ownerOptions }: ReportsExecutiveClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tz = useMemo(() => clientTz(), []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; SameSite=Lax`;
  }, [tz]);

  const fallback = presetToRange("30d");
  const from = searchParams.get("from") || fallback.fromIso;
  const to = searchParams.get("to") || fallback.toIso;
  const ownerId = searchParams.get("ownerId") || "";

  const range: RangeValue = useMemo(
    () => ({ fromIso: from, toIso: to }),
    [from, to],
  );
  const preset = useMemo(() => detectPreset(range), [range]);

  const setUrl = useCallback(
    (patch: { from?: string; to?: string; ownerId?: string }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (patch.from !== undefined) params.set("from", patch.from);
      if (patch.to !== undefined) params.set("to", patch.to);
      if (patch.ownerId !== undefined) {
        if (patch.ownerId) params.set("ownerId", patch.ownerId);
        else params.delete("ownerId");
      }
      router.replace(`/reports/overview?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const qs = useMemo(() => {
    const p = new URLSearchParams({
      from: toIsoDay(from, tz),
      to: toIsoDay(to, tz),
    });
    if (ownerId) p.set("ownerId", ownerId);
    return p.toString();
  }, [from, to, ownerId, tz]);

  const { data: summary, isLoading, isError, error } = useQuery({
    queryKey: ["reports", "executive", qs, tz],
    queryFn: () => fetchExecutive(qs, tz),
  });

  const ownerLabel =
    ownerOptions.find((o) => o.value === ownerId)?.label ?? "All agents";
  const rangeDesc = rangeLabel(preset, range);
  const drill = { fromIso: from, toIso: to, ownerId: ownerId || null };

  // Reuse the report module's own chart (top-N + "Others", formatted tooltip,
  // drill) instead of the plain shared dashboard bars — fixes the unreadable
  // high-cardinality "Leads by stage" and keeps the look cohesive.
  const leadRows = (summary?.leadsByStage ?? []).map((x) => ({
    stage: x.stage || "—",
    leads: x.count,
    _drillUrl: leadsByStageHref(x.stage || "", drill),
  }));
  const oppRows = (summary?.opportunitiesByStage ?? []).map((x) => ({
    stage: x.stage || "—",
    deals: x.count,
    _drillUrl: opportunitiesByStageHref(x.stage || "", drill),
  }));

  return (
    <div className="space-y-5">
      <ReportsToolbar
        from={from}
        to={to}
        ownerId={ownerId}
        ownerOptions={ownerOptions}
        onChange={(next) => setUrl(next)}
      />

      {/* Premium context band */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-crm-border bg-gradient-to-r from-accent-50 via-white to-white p-4 shadow-sm">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent-600 text-white shadow-sm">
          <Sparkles size={18} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-crm-text">Executive summary</p>
          <p className="text-xs text-crm-muted">
            Same KPIs as your dashboard, scoped to your filters — library for
            operational breakdowns, builder for custom groupings.
          </p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-accent-200 bg-white px-3 py-1 text-xs font-medium text-accent-700">
          <Calendar size={13} />
          {rangeDesc} · {ownerLabel}
        </span>
      </div>

      {isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error instanceof Error ? error.message : "Failed to load overview"}
        </div>
      )}

      <ExecutiveKpiGrid
        summary={summary}
        loading={isLoading}
        labelForPrior={labelForPrior(preset)}
        rangeDescription={rangeDesc}
        onNavigate={(path) => router.push(path)}
      />

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-crm-muted">
          Pipeline &amp; leads
        </h3>
        <div className="grid gap-4 lg:grid-cols-2">
          {isLoading || !summary ? (
            <>
              <ChartCardSkeleton title="Leads by stage" />
              <ChartCardSkeleton title="Open deals by stage" />
            </>
          ) : (
            <>
              <OverviewChartCard
                icon={Users}
                title="Leads by stage"
                subtitle="Counts per stage · click a bar to drill in"
              >
                <CannedReportChart
                  type="bar"
                  xKey="stage"
                  yKey="leads"
                  valueFormat="number"
                  rows={leadRows}
                />
              </OverviewChartCard>
              <OverviewChartCard
                icon={Briefcase}
                title="Open deals by stage"
                subtitle="Open opportunities (Won & Lost excluded)"
              >
                <CannedReportChart
                  type="bar"
                  xKey="stage"
                  yKey="deals"
                  valueFormat="number"
                  rows={oppRows}
                />
              </OverviewChartCard>
            </>
          )}
        </div>
      </section>

      {summary && !isLoading && (
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-crm-muted">
            Activity
          </h3>
          <ActivityMixChart
            mix={summary.executive.activityMix}
            rangeDescription={rangeDesc}
          />
        </section>
      )}
    </div>
  );
}
