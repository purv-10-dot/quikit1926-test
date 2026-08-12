"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DashboardToolbar } from "@/components/dashboard/dashboard-toolbar";
import {
  OverviewFilterBar,
  countActiveOverviewFilters,
  type OverviewFilterValues,
} from "@/components/overview/overview-filter-bar";
import { OverviewTodaySnapshot } from "@/components/overview/overview-today-snapshot";
import { OverviewKpiGrid } from "@/components/overview/overview-kpi-grid";
import { OverviewSections } from "@/components/overview/overview-sections";
import { OverviewAdvancedSections } from "@/components/overview/overview-advanced-sections";
import { KpiCardSkeleton } from "@/components/dashboard/kpi-card-skeleton";
import {
  presetToRange,
  type RangePreset,
  type RangeValue,
} from "@/components/dashboard/date-range-picker";
import type { ExecutiveOverviewDto } from "@/lib/dashboard/executive-overview-types";
import { emptyExecutiveOverviewAdvanced } from "@/lib/dashboard/executive-overview-empty";

const REFRESH_MS = 60_000;

const FILTER_KEYS = [
  "source",
  "role",
  "teamId",
  "department",
  "leadStage",
  "oppStage",
  "territory",
  "industry",
  "dealStatus",
  "revenueMin",
  "revenueMax",
] as const;

function clientTz(): string {
  if (typeof Intl === "undefined") return "UTC";
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

async function fetchOverview(qs: string, tz: string): Promise<ExecutiveOverviewDto> {
  const res = await fetch(`/api/dashboard/executive-overview?${qs}`, {
    credentials: "include",
    headers: { "X-Client-TZ": tz },
  });
  if (res.status === 403) throw new Error("Executive overview requires administrator access.");
  if (!res.ok) throw new Error(`Overview load failed (${res.status})`);
  return res.json();
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

function labelForPrior(preset: RangePreset, value: RangeValue): string {
  switch (preset) {
    case "today":
      return "yesterday";
    case "7d":
      return "prior 7d";
    case "30d":
      return "prior 30d";
    case "month":
      return "prior month";
    case "quarter":
      return "prior quarter";
    default: {
      const fromShort = value.fromIso.slice(5);
      const toShort = value.toIso.slice(5);
      return `prior ${fromShort}–${toShort}`;
    }
  }
}

function readFiltersFromParams(params: { get(key: string): string | null }): OverviewFilterValues {
  return {
    source: params.get("source") ?? "",
    role: params.get("role") ?? "",
    teamId: params.get("teamId") ?? "",
    department: params.get("department") ?? "",
    leadStage: params.get("leadStage") ?? "",
    oppStage: params.get("oppStage") ?? "",
    territory: params.get("territory") ?? "",
    industry: params.get("industry") ?? "",
    dealStatus: params.get("dealStatus") ?? "",
    revenueMin: params.get("revenueMin") ?? "",
    revenueMax: params.get("revenueMax") ?? "",
  };
}

export function OverviewClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const tz = useMemo(() => clientTz(), []);
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; SameSite=Lax`;
  }, [tz]);

  const fromQ = searchParams.get("from");
  const toQ = searchParams.get("to");
  const ownerIdQ = searchParams.get("ownerId") ?? "";
  const filterValues = useMemo(() => readFiltersFromParams(searchParams), [searchParams]);
  const activeFilterCount = useMemo(() => countActiveOverviewFilters(filterValues), [filterValues]);
  const [filtersOpen, setFiltersOpen] = useState(() => activeFilterCount > 0);

  useEffect(() => {
    if (activeFilterCount > 0) setFiltersOpen(true);
  }, [activeFilterCount]);

  const range: RangeValue = useMemo(() => {
    if (fromQ && toQ) return { fromIso: fromQ, toIso: toQ };
    return presetToRange("30d");
  }, [fromQ, toQ]);

  const preset: RangePreset = useMemo(() => detectPreset(range), [range]);

  const updateUrl = useCallback(
    (next: {
      range?: RangeValue;
      ownerId?: string;
      filters?: Partial<OverviewFilterValues>;
    }) => {
      const params = new URLSearchParams(searchParams.toString());
      const r = next.range ?? range;
      params.set("from", r.fromIso);
      params.set("to", r.toIso);
      if (next.ownerId !== undefined) {
        if (next.ownerId) params.set("ownerId", next.ownerId);
        else params.delete("ownerId");
      }
      if (next.filters) {
        for (const key of FILTER_KEYS) {
          const val = next.filters[key];
          if (val !== undefined) {
            if (val && val !== "all") params.set(key, val);
            else params.delete(key);
          }
        }
      }
      router.replace(`/overview?${params.toString()}`, { scroll: false });
    },
    [range, router, searchParams],
  );

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    p.set("from", range.fromIso);
    p.set("to", range.toIso);
    if (ownerIdQ) p.set("ownerId", ownerIdQ);
    for (const key of FILTER_KEYS) {
      const val = filterValues[key];
      if (val && val !== "all") p.set(key, val);
    }
    return p.toString();
  }, [range, ownerIdQ, filterValues]);

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ["executive-overview", qs, tz],
    queryFn: () => fetchOverview(qs, tz),
    staleTime: 30_000,
    refetchInterval: REFRESH_MS,
  });

  const priorLabel = labelForPrior(preset, range);
  const rangeDescription = rangeLabel(preset, range);

  const safeData = useMemo(() => {
    if (!data) return null;
    return {
      ...data,
      advanced: data.advanced ?? emptyExecutiveOverviewAdvanced(),
    };
  }, [data]);

  if (isError) {
    return (
      <div className="crm-card border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        {(error as Error)?.message ?? "Failed to load executive overview."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DashboardToolbar
        range={range}
        preset={preset}
        onRangeChange={(v) => updateUrl({ range: v })}
        ownerId={ownerIdQ}
        onOwnerIdChange={(id) => updateUrl({ ownerId: id })}
        onRefresh={() => {
          void queryClient.invalidateQueries({ queryKey: ["executive-overview"] });
          void refetch();
        }}
        refreshing={isFetching}
        filtersOpen={filtersOpen}
        onToggleFilters={() => setFiltersOpen((open) => !open)}
        activeFilterCount={activeFilterCount}
      />
      {filtersOpen ? (
        <OverviewFilterBar
          filters={filterValues}
          onChange={(patch) => updateUrl({ filters: patch })}
        />
      ) : null}

      {isLoading || !safeData ? (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <KpiCardSkeleton key={i} />
            ))}
          </div>
        </div>
      ) : (
        <>
          <OverviewTodaySnapshot metrics={safeData.advanced.todaySnapshot} />
          <OverviewKpiGrid
            data={safeData}
            priorLabel={priorLabel}
            rangeDescription={rangeDescription}
          />
          <OverviewSections
            data={safeData}
            priorLabel={priorLabel}
            rangeDescription={rangeDescription}
            ownerId={ownerIdQ || null}
          />
          <OverviewAdvancedSections data={safeData} />
        </>
      )}
    </div>
  );
}
