"use client";

import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Download,
  CheckCircle2,
  Clock,
  ListChecks,
  Timer,
  Hourglass,
  Calendar as CalendarIcon,
} from "lucide-react";
import { TaskTimeDrawer } from "./task-time-drawer";
import { ReportsEmptyState } from "./empty-state";
import { Pagination } from "./pagination";
import { KpiCard } from "./resource-report-bits";
import { ProjectReportToolbar } from "./project-report-toolbar";
import { showToast } from "@/lib/ui/toast";
import {
  formatH,
  monthInput,
  monthLabel,
  ProjectRowSkeleton,
  ProjectTaskRow,
  type Task,
} from "./project-report-bits";

interface Summary { total: number; pending: number; closed: number; estHours: number; actualHours: number; }

export function ReportsView() {
  const [month, setMonth] = useState<string>(monthInput(new Date()));
  const [projectId, setProjectId] = useState("");
  const [statusName, setStatusName] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [startDate, setStartDate] = useState("");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const query = useQuery({
    queryKey: [
      "reports.tasks",
      { month, projectId, statusName, assigneeId, startDate, page, pageSize },
    ],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams();
      if (month) params.set("month", month);
      if (projectId) params.set("projectId", projectId);
      if (statusName) params.set("statusName", statusName);
      if (assigneeId) params.set("assigneeId", assigneeId);
      if (startDate) params.set("startDate", startDate);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      const res = await fetch(`/api/reports/tasks?${params.toString()}`, { signal });
      const j = await res.json();
      if (!j?.success) throw new Error(j?.error ?? "Failed");
      return j.data as {
        tasks: Task[];
        summary: Summary;
        facets: { statuses: { name: string }[]; assignees: { id: string; name: string }[] };
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      };
    },
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });

  const tasks = query.data?.tasks ?? [];
  const summary: Summary = query.data?.summary ?? {
    total: 0,
    pending: 0,
    closed: 0,
    estHours: 0,
    actualHours: 0,
  };
  const totalRows = query.data?.total ?? 0;
  const totalPages = query.data?.totalPages ?? 1;
  const isInitialLoading = query.isLoading && !query.data;
  const isRefetching = query.isFetching && !!query.data;

  // Projects the caller may report on — scoped the same way as the report data
  // (admins: all; Space Admins: only their projects). Uses the dedicated
  // /api/reports/projects endpoint so the filter can't list member-only
  // projects that the report itself excludes.
  const projectsQuery = useQuery({
    queryKey: ["reports.projects"],
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/reports/projects", { signal });
      const j = await res.json();
      if (!j?.success) throw new Error(j?.error ?? "Failed");
      return (j.data as { id: string; name: string }[]) ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
  const projectOptions = useMemo(
    () =>
      (projectsQuery.data ?? [])
        .map((p) => ({ id: p.id, name: p.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [projectsQuery.data],
  );
  // Status / assignee options come from the server-computed facets (the full
  // accessible dataset for the period), not the current page of `tasks` — so
  // the dropdowns list every option regardless of which page is loaded.
  const statusOptions = query.data?.facets?.statuses ?? [];
  const assigneeOptions = query.data?.facets?.assignees ?? [];

  useEffect(() => {
    setPage(1);
  }, [month, projectId, statusName, assigneeId, startDate, pageSize]);

  function clearFilters() {
    setProjectId("");
    setStatusName("");
    setAssigneeId("");
    setStartDate("");
  }

  // Export runs server-side so it covers EVERY matching row, not just the page
  // currently loaded in the table. The endpoint applies the same filters and
  // streams back a downloadable CSV.
  async function exportTasks() {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (month) params.set("month", month);
      if (projectId) params.set("projectId", projectId);
      if (statusName) params.set("statusName", statusName);
      if (assigneeId) params.set("assigneeId", assigneeId);
      if (startDate) params.set("startDate", startDate);
      const res = await fetch(`/api/reports/tasks/export?${params.toString()}`);
      if (!res.ok) {
        let msg = "Export failed";
        try {
          const j = await res.json();
          msg = j?.error ?? msg;
        } catch {
          /* non-JSON error body */
        }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `project-report-${month || "all"}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Export failed", "error");
    } finally {
      setExporting(false);
    }
  }

  const utilization = summary.estHours > 0
    ? (summary.actualHours / summary.estHours) * 100
    : 0;
  const closedPct = summary.total > 0 ? (summary.closed / summary.total) * 100 : 0;
  const filtersActive = !!(projectId || statusName || assigneeId || startDate);

  return (
    <div className="p-6 space-y-5">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Project Reports</h1>
          <p className="text-sm text-gray-500">
            Tasks, estimates and logged time across every project you can access.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <CalendarIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-9 pl-8 pr-3 text-sm rounded-lg border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
              aria-label={monthLabel(month)}
            />
          </div>
          <button
            type="button"
            onClick={exportTasks}
            disabled={exporting || totalRows === 0}
            className="inline-flex items-center gap-2 h-9 px-3 text-sm font-medium text-white bg-blue-600 rounded-lg shadow-sm hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-500"
          >
            <Download className="h-4 w-4" />
            {exporting ? "Exporting…" : "Export"}
          </button>
          <span className="inline-flex items-center gap-1.5 h-9 px-3 text-xs rounded-lg border border-gray-200 bg-white text-gray-500">
            Total
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-gray-100 text-gray-700 font-semibold text-[11px] tabular-nums">
              {totalRows}
            </span>
          </span>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <KpiCard
          icon={<ListChecks className="h-4 w-4" />}
          tone="blue"
          label="Total tasks"
          value={String(summary.total)}
          hint={filtersActive ? "Filtered" : "In this period"}
        />
        <KpiCard
          icon={<Hourglass className="h-4 w-4" />}
          tone="amber"
          label="Pending"
          value={String(summary.pending)}
          hint={`${Math.round(100 - closedPct)}% open`}
        />
        <KpiCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="emerald"
          label="Closed"
          value={String(summary.closed)}
          hint={`${Math.round(closedPct)}% completed`}
          progressPct={closedPct}
        />
        <KpiCard
          icon={<Timer className="h-4 w-4" />}
          tone="blue"
          label="Estimated time"
          value={`${formatH(summary.estHours)}h`}
          hint="Across listed tasks"
        />
        <KpiCard
          icon={<Clock className="h-4 w-4" />}
          tone={utilization > 100 ? "rose" : "gray"}
          label="Actual time"
          value={`${formatH(summary.actualHours)}h`}
          hint={summary.estHours > 0 ? `${Math.round(utilization)}% of estimate` : "No estimates set"}
          progressPct={Math.min(100, utilization)}
        />
      </div>

      <ProjectReportToolbar
        projectId={projectId}
        onProjectIdChange={setProjectId}
        projectOptions={projectOptions.map((p) => ({ value: p.id, label: p.name }))}
        startDate={startDate}
        onStartDateChange={setStartDate}
        statusName={statusName}
        onStatusNameChange={setStatusName}
        statusOptions={statusOptions.map((s) => ({ value: s.name, label: s.name }))}
        assigneeId={assigneeId}
        onAssigneeIdChange={setAssigneeId}
        assigneeOptions={assigneeOptions.map((u) => ({ value: u.id, label: u.name }))}
        onClear={clearFilters}
        filtersActive={filtersActive}
      />

      <div className="relative rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        {isRefetching && (
          <div className="absolute left-0 right-0 top-0 h-0.5 bg-blue-100 overflow-hidden z-10">
            <div className="h-full w-1/3 bg-blue-500 qt-progress-slide" />
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold w-12">#</th>
                <th className="px-4 py-3 text-left font-semibold">Task</th>
                <th className="px-4 py-3 text-left font-semibold">Project</th>
                <th className="px-4 py-3 text-left font-semibold">Assignee</th>
                <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Create Date</th>
                <th className="px-4 py-3 text-right font-semibold whitespace-nowrap">Est Time</th>
                <th className="px-4 py-3 text-right font-semibold whitespace-nowrap">Time Spent</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className={isRefetching ? "opacity-60 transition-opacity" : "transition-opacity"}>
              {isInitialLoading ? (
                <ProjectRowSkeleton rows={pageSize} />
              ) : tasks.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4">
                    <ReportsEmptyState
                      title="No data available."
                      hint="Try widening the filters or pick a different month."
                    />
                  </td>
                </tr>
              ) : (
                tasks.map((t, i) => (
                  <ProjectTaskRow key={t.id} task={t} index={i} onOpen={setOpenTaskId} />
                ))
              )}
            </tbody>
          </table>
        </div>
        {tasks.length > 0 && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={totalRows}
            totalPages={totalPages}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        )}
      </div>

      {openTaskId && (
        <TaskTimeDrawer taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
      )}
    </div>
  );
}
