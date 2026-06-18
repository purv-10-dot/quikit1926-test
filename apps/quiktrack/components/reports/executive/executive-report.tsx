"use client";

import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, RefreshCw, Bell } from "lucide-react";
import { ExecutiveToolbar } from "./executive-toolbar";
import { ExecutiveKpiStrip } from "./executive-kpi-strip";
import { WeeklyTrendChart } from "./weekly-trend-chart";
import { TeamProductivityBar } from "./team-productivity-bar";
import { TeamHeatmap } from "./team-heatmap";
import { SlippingTasksChart } from "./slipping-tasks-chart";
import { WorkloadScatter } from "./workload-scatter";
import { TopEmployeesTable } from "./top-employees-table";
import { SavedViewsMenu, SaveViewModal } from "./saved-views-menu";
import {
  DEFAULT_FILTERS,
  normalizeFilters,
  type ExecutiveFilters,
  type ExecutiveReportData,
  type SavedView,
} from "./types";

export function ExecutiveReport() {
  const [filters, setFilters] = useState<ExecutiveFilters>(DEFAULT_FILTERS);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const qc = useQueryClient();

  const queryParams = useMemo(() => buildQueryString(filters), [filters]);

  const report = useQuery({
    queryKey: ["reports.executive", queryParams],
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/reports/executive?${queryParams}`, { signal });
      const j = await res.json();
      if (!j?.success) throw new Error(j?.error ?? "Failed to load report");
      return j.data as ExecutiveReportData;
    },
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });

  const views = useQuery({
    queryKey: ["reports.executive.views"],
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/reports/views", { signal });
      const j = await res.json();
      if (!j?.success) throw new Error(j?.error ?? "Failed to load saved views");
      return (j.data?.views ?? []) as SavedView[];
    },
    staleTime: 60 * 1000,
  });

  const [didApplyPinned, setDidApplyPinned] = useState(false);
  useEffect(() => {
    if (didApplyPinned || !views.data) return;
    const pinned = views.data.find((v) => v.isPinned);
    if (pinned) {
      setFilters(normalizeFilters(pinned.filtersJson));
      setActiveViewId(pinned.id);
    }
    setDidApplyPinned(true);
  }, [didApplyPinned, views.data]);

  const saveMutation = useMutation({
    mutationFn: async (input: { name: string; isPinned: boolean; filtersJson: ExecutiveFilters }) => {
      const res = await fetch("/api/reports/views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const j = await res.json();
      if (!j?.success) throw new Error(j?.error ?? "Save failed");
      return j.data.view as SavedView;
    },
    onSuccess: (view) => {
      qc.invalidateQueries({ queryKey: ["reports.executive.views"] });
      setActiveViewId(view.id);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/reports/views/${id}`, { method: "DELETE" });
      const j = await res.json();
      if (!j?.success) throw new Error(j?.error ?? "Delete failed");
      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["reports.executive.views"] });
      if (activeViewId === id) setActiveViewId(null);
    },
  });

  const pinMutation = useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      const res = await fetch(`/api/reports/views/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPinned: pinned }),
      });
      const j = await res.json();
      if (!j?.success) throw new Error(j?.error ?? "Update failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reports.executive.views"] }),
  });

  const filtersDirty = useMemo(() => filtersAreDirty(filters), [filters]);

  function applyFilters(next: ExecutiveFilters) {
    setFilters(next);
    setActiveViewId(null);
  }

  function applyView(view: SavedView) {
    setFilters(normalizeFilters(view.filtersJson));
    setActiveViewId(view.id);
  }

  function exportCsv() {
    if (!report.data) return;
    const d = report.data;
    const header = [
      "Week",
      "Productivity %",
      "Created",
      "Closed",
      "Slipped",
      "Blocked",
      "Estimated hours",
      "Logged hours",
    ];
    const rows = d.weeks.map((w, i) => [
      w.weekStart,
      String(d.series.productivity[i] ?? 0),
      String(d.series.created[i] ?? 0),
      String(d.series.closed[i] ?? 0),
      String(d.series.slipped[i] ?? 0),
      String(d.series.blocked[i] ?? 0),
      String(d.series.estHours[i] ?? 0),
      String(d.series.actualHours[i] ?? 0),
    ]);
    const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `productivity-report-${d.range.from}-to-${d.range.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const data = report.data;
  const isInitialLoad = report.isLoading && !data;

  return (
    <div className="p-6 space-y-5 min-h-screen bg-gray-50 exec-surface">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
            Overall Company Productivity
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Week over Week Report
            {data?.range.label && (
              <>
                {" · "}
                <span className="font-medium text-gray-700 dark:text-gray-300">{data.range.label}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => report.refetch()}
            disabled={report.isFetching}
            className="inline-flex items-center gap-1.5 h-9 px-3 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200 disabled:opacity-50"
            aria-label="Refresh"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${report.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!data}
            className="inline-flex items-center gap-1.5 h-9 px-3 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
          <SavedViewsMenu
            views={views.data ?? []}
            activeId={activeViewId}
            onApply={applyView}
            onDelete={(id) => deleteMutation.mutate(id)}
            onTogglePin={(id, pinned) => pinMutation.mutate({ id, pinned })}
          />
         
        </div>
      </header>

      <ExecutiveToolbar
        filters={filters}
        onChange={applyFilters}
        projectOptions={data?.projects ?? []}
        teamOptions={data?.teamOptions ?? []}
        sprintOptions={data?.sprintOptions ?? []}
        onSaveClick={() => setSaveModalOpen(true)}
        filtersDirty={filtersDirty}
        rangeLabel={data?.range.label}
      />

      {isInitialLoad ? (
        <LoadingState />
      ) : report.isError ? (
        <ErrorState message={(report.error as Error)?.message ?? "Failed to load"} />
      ) : data ? (
        <div className="space-y-5">
          <ExecutiveKpiStrip data={data} />

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            <div className="xl:col-span-2">
              <WeeklyTrendChart data={data} />
            </div>
            <div className="xl:col-span-1">
              <TeamProductivityBar data={data} />
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            <div className="xl:col-span-1">
              <TeamHeatmap data={data} />
            </div>
            <div className="xl:col-span-1">
              <SlippingTasksChart data={data} />
            </div>
            <div className="xl:col-span-1">
              <WorkloadScatter data={data} />
            </div>
          </div>

          <TopEmployeesTable data={data} queryParams={queryParams} />
        </div>
      ) : null}

      <SaveViewModal
        open={saveModalOpen}
        onCancel={() => setSaveModalOpen(false)}
        onSubmit={async (name, isPinned) => {
          await saveMutation.mutateAsync({ name, isPinned, filtersJson: filters });
          setSaveModalOpen(false);
        }}
      />
    </div>
  );
}

function buildQueryString(filters: ExecutiveFilters): string {
  const params = new URLSearchParams();
  params.set("preset", filters.rangePreset);
  if (filters.year !== undefined) params.set("year", String(filters.year));
  if (filters.quarter !== undefined) params.set("quarter", String(filters.quarter));
  if (filters.month !== undefined) params.set("month", String(filters.month));
  if (filters.rangePreset === "custom") {
    if (filters.customFrom) params.set("from", filters.customFrom);
    if (filters.customTo) params.set("to", filters.customTo);
  }
  // compareMode intentionally omitted — week-over-week deltas are computed
  // from the current series' last 2 weeks; no parallel range query is needed.
  if (filters.projectIds.length > 0) params.set("projectIds", filters.projectIds.join(","));
  if (filters.assigneeIds.length > 0) params.set("assigneeIds", filters.assigneeIds.join(","));
  if (filters.teamIds.length > 0) params.set("teamIds", filters.teamIds.join(","));
  if (filters.sprintIds.length > 0) params.set("sprintIds", filters.sprintIds.join(","));
  return params.toString();
}

function filtersAreDirty(filters: ExecutiveFilters): boolean {
  return (
    filters.rangePreset !== DEFAULT_FILTERS.rangePreset ||
    // compareMode is locked to previous-period; never counts as dirty.
    filters.projectIds.length > 0 ||
    filters.assigneeIds.length > 0 ||
    filters.teamIds.length > 0 ||
    filters.sprintIds.length > 0 ||
    filters.year !== undefined ||
    filters.quarter !== undefined ||
    filters.month !== undefined ||
    filters.customFrom !== undefined ||
    filters.customTo !== undefined
  );
}

function LoadingState() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[140px] rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 h-[360px] rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 animate-pulse" />
        <div className="h-[360px] rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 animate-pulse" />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="h-[320px] rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 animate-pulse" />
        <div className="h-[320px] rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 animate-pulse" />
        <div className="h-[320px] rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 animate-pulse" />
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 px-4 py-3 text-sm">
      {message}
    </div>
  );
}
