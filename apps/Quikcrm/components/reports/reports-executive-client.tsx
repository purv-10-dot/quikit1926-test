"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ReportsToolbar } from "./reports-toolbar";
import { ExecutiveKpiGrid } from "@/components/dashboard/executive-kpi-grid";
import { ActivityMixChart } from "@/components/dashboard/activity-mix-chart";
import { LeadsByStageBar } from "@/components/dashboard/leads-by-stage-bar";
import { OppsByStageBar } from "@/components/dashboard/opps-by-stage-bar";
import { ChartCardSkeleton } from "@/components/dashboard/chart-card";
import type { DashboardSummaryDto } from "@/lib/dashboard/types";
import {
  presetToRange,
  type RangePreset,
  type RangeValue,
} from "@/components/dashboard/date-range-picker";

function clientTz(): string {
  if (typeof Intl === "undefined") return "UTC";
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
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
    const p = new URLSearchParams({ from, to });
    if (ownerId) p.set("ownerId", ownerId);
    return p.toString();
  }, [from, to, ownerId]);

  const { data: summary, isLoading, isError, error } = useQuery({
    queryKey: ["reports", "executive", qs, tz],
    queryFn: () => fetchExecutive(qs, tz),
  });

  return (
    <div>
      <ReportsToolbar
        from={from}
        to={to}
        ownerId={ownerId}
        ownerOptions={ownerOptions}
        onChange={(next) => setUrl(next)}
      />

      <p className="mb-4 text-sm text-crm-muted">
        Executive summary — same KPIs as the main dashboard, scoped to your selected
        filters. Use the report library for operational breakdowns or the builder for
        custom groupings.
      </p>

      {isError && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error instanceof Error ? error.message : "Failed to load overview"}
        </div>
      )}

      <ExecutiveKpiGrid
        summary={summary}
        loading={isLoading}
        labelForPrior={labelForPrior(preset)}
        rangeDescription={rangeLabel(preset, range)}
        onNavigate={(path) => router.push(path)}
      />

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {isLoading || !summary ? (
          <>
            <ChartCardSkeleton title="Leads by stage" />
            <ChartCardSkeleton title="Open deals by stage" />
          </>
        ) : (
          <>
            <LeadsByStageBar
              data={summary.leadsByStage}
              drill={{ fromIso: from, toIso: to, ownerId: ownerId || null }}
            />
            <OppsByStageBar
              data={summary.opportunitiesByStage}
              drill={{ fromIso: from, toIso: to, ownerId: ownerId || null }}
            />
          </>
        )}
      </div>

      {summary && !isLoading && (
        <div className="mt-4">
          <ActivityMixChart
            mix={summary.executive.activityMix}
            rangeDescription={rangeLabel(preset, range)}
          />
        </div>
      )}
    </div>
  );
}
