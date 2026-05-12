"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Download,
  CheckCircle2,
  Clock,
  ListChecks,
  Timer,
  Hourglass,
  Briefcase,
  Calendar as CalendarIcon,
  User as UserIcon,
  CircleDot,
  Filter,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { TaskTimeDrawer } from "./task-time-drawer";
import { ReportsEmptyState } from "./empty-state";
import { FilterDropdown } from "./filter-dropdown";
import { Pagination } from "./pagination";

interface ProjectRef {
  id: string;
  name: string;
  projectKey: string;
  color: string | null;
  icon: string | null;
}
interface UserRef {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
}
interface StatusRef {
  id: string;
  name: string;
  color: string;
  category: string;
}
interface Task {
  id: string;
  key: string;
  title: string;
  type: string;
  project: ProjectRef | null;
  status: StatusRef | null;
  assignee: UserRef | null;
  startDate: string | null;
  dueDate: string | null;
  createdAt: string;
  etaHours: number;
  actualHours: number;
}
interface Summary {
  total: number;
  pending: number;
  closed: number;
  estHours: number;
  actualHours: number;
}

function monthInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(s: string): string {
  if (!/^\d{4}-\d{2}$/.test(s)) return s;
  const [y, m] = s.split("-").map(Number);
  return new Date(y!, m! - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export function ReportsView() {
  const [month, setMonth] = useState<string>(monthInput(new Date()));
  const [projectId, setProjectId] = useState("");
  const [statusName, setStatusName] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [startDate, setStartDate] = useState("");

  const [tasks, setTasks] = useState<Task[]>([]);
  const [summary, setSummary] = useState<Summary>({
    total: 0,
    pending: 0,
    closed: 0,
    estHours: 0,
    actualHours: 0,
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  // Filter dropdown sources, hydrated from the loaded task set so we don't
  // need separate listing endpoints.
  const projectOptions = useMemo(() => {
    const m = new Map<string, ProjectRef>();
    for (const t of tasks) if (t.project) m.set(t.project.id, t.project);
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks]);
  const statusOptions = useMemo(() => {
    // Status rows are scoped per-project, so different projects can each have
    // their own "To Do" status with different IDs. Dedupe on name so the
    // filter doesn't list duplicates; we'll match against name on the server.
    const m = new Map<string, StatusRef>();
    for (const t of tasks) if (t.status) m.set(t.status.name, t.status);
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks]);
  const assigneeOptions = useMemo(() => {
    const m = new Map<string, UserRef>();
    for (const t of tasks) if (t.assignee) m.set(t.assignee.id, t.assignee);
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (month) params.set("month", month);
      if (projectId) params.set("projectId", projectId);
      if (statusName) params.set("statusName", statusName);
      if (assigneeId) params.set("assigneeId", assigneeId);
      if (startDate) params.set("startDate", startDate);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      const res = await fetch(`/api/reports/tasks?${params.toString()}`).then((r) => r.json());
      if (res?.success) {
        setTasks(res.data.tasks);
        setSummary(res.data.summary);
        setTotalPages(res.data.totalPages ?? 1);
        setTotalRows(res.data.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [month, projectId, statusName, assigneeId, startDate, page, pageSize]);

  // Reset to page 1 whenever a filter changes so the user doesn't get
  // stranded on a now-empty page.
  useEffect(() => {
    setPage(1);
  }, [month, projectId, statusName, assigneeId, startDate, pageSize]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function clearFilters() {
    setProjectId("");
    setStatusName("");
    setAssigneeId("");
    setStartDate("");
  }

  function exportTasks() {
    const header = ["S.No", "Key", "Task", "Project", "Assignee", "Create Date", "Status", "Est (h)", "Actual (h)"];
    const rows = tasks.map((t, i) => [
      String(i + 1),
      t.key,
      escapeCsv(t.title),
      escapeCsv(t.project?.name ?? ""),
      escapeCsv(t.assignee?.name ?? ""),
      new Date(t.createdAt).toISOString().slice(0, 10),
      escapeCsv(t.status?.name ?? ""),
      String(t.etaHours),
      String(t.actualHours),
    ]);
    const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `project-report-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const utilization = summary.estHours > 0
    ? Math.round((summary.actualHours / summary.estHours) * 100)
    : 0;

  return (
    <div className="px-6 py-5 bg-gray-50/40 min-h-full">
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Project Reports</h1>
          <p className="mt-1 text-sm text-gray-500">
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
              className="h-10 pl-8 pr-3 text-sm border border-gray-200 rounded-md bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              aria-label={monthLabel(month)}
            />
          </div>
          <button
            type="button"
            onClick={exportTasks}
            disabled={tasks.length === 0}
            className="inline-flex items-center gap-2 h-10 px-4 text-sm font-semibold text-white bg-blue-600 rounded-md shadow-sm hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-500"
          >
            <Download className="h-4 w-4" />
            Export Tasks
          </button>
          <span className="h-10 inline-flex items-center px-3 text-xs text-gray-600 border border-gray-200 rounded-md bg-white shadow-sm">
            Total records
            <span className="ml-2 inline-flex items-center justify-center min-w-[24px] h-5 px-1.5 rounded-full bg-blue-50 text-blue-700 font-semibold">
              {totalRows}
            </span>
          </span>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <StatCard label="Total Task" value={summary.total} tone="blue" icon={ListChecks} />
        <StatCard label="Pending Task" value={summary.pending} tone="emerald" icon={Hourglass} />
        <StatCard label="Closed Task" value={summary.closed} tone="rose" icon={CheckCircle2} />
        <StatCard
          label="Est Time"
          value={`${formatH(summary.estHours)}h`}
          tone="sky"
          icon={Timer}
        />
        <StatCard
          label="Actual Time"
          value={`${formatH(summary.actualHours)}h`}
          tone="violet"
          icon={Clock}
          footer={
            summary.estHours > 0
              ? `${utilization}% of estimate`
              : undefined
          }
        />
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-gray-200 rounded-md shadow-sm px-3 py-2.5 mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 pr-1">
          <Filter className="h-3.5 w-3.5" />
          Filters
        </div>
        <FilterDropdown
          label="Project Name"
          icon={Briefcase}
          value={projectId}
          onChange={setProjectId}
          options={projectOptions.map((p) => ({ value: p.id, label: p.name }))}
        />
        <div className="relative">
          <CalendarIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="h-9 pl-8 pr-3 text-sm border border-gray-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[150px]"
            aria-label="Start Date"
          />
        </div>
        <FilterDropdown
          label="Status"
          icon={CircleDot}
          value={statusName}
          onChange={setStatusName}
          options={statusOptions.map((s) => ({ value: s.name, label: s.name }))}
        />
        <FilterDropdown
          label="Assignee"
          icon={UserIcon}
          value={assigneeId}
          onChange={setAssigneeId}
          options={assigneeOptions.map((u) => ({ value: u.id, label: u.name }))}
        />
        <button
          type="button"
          onClick={clearFilters}
          className="h-9 px-3 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors ml-auto"
        >
          Clear filters
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-md shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-[11px] uppercase tracking-wider text-gray-500">
                <th className="px-4 py-3 text-left w-12">#</th>
                <th className="px-4 py-3 text-left">Task</th>
                <th className="px-4 py-3 text-left">Project</th>
                <th className="px-4 py-3 text-left">Assignee</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Create Date</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Est Time</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Time Spent</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && tasks.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-500">
                    Loading…
                  </td>
                </tr>
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
                tasks.map((t, i) => {
                  const overBudget =
                    t.etaHours > 0 && t.actualHours > t.etaHours;
                  return (
                    <tr
                      key={t.id}
                      onClick={() => setOpenTaskId(t.id)}
                      className="border-b border-gray-100 cursor-pointer hover:bg-blue-50/40 transition-colors"
                    >
                      <td className="px-4 py-3 text-gray-500 text-xs font-medium">{i + 1}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded shrink-0">
                            {t.key}
                          </span>
                          <span className="text-gray-900 font-medium truncate max-w-[320px]">
                            {t.title}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="inline-flex items-center gap-2 text-gray-700 text-xs">
                          {t.project?.icon ? (
                            <span className="text-base leading-none">{t.project.icon}</span>
                          ) : (
                            <span
                              className="inline-block h-2 w-2 rounded-full shrink-0"
                              style={{ background: t.project?.color ?? "#94a3b8" }}
                            />
                          )}
                          <span className="truncate max-w-[160px]">
                            {t.project?.name ?? "—"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {t.assignee ? (
                          <div className="inline-flex items-center gap-2">
                            <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white text-[10px] font-semibold">
                              {t.assignee.name.charAt(0).toUpperCase()}
                            </span>
                            <span className="text-gray-800 text-xs">{t.assignee.name}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs italic">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                        {new Date(t.createdAt).toLocaleDateString(undefined, {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {t.etaHours > 0 ? (
                          <span className="text-gray-800 text-xs font-medium">
                            {formatH(t.etaHours)}h
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {t.actualHours > 0 ? (
                          <span
                            className={`text-xs font-medium ${
                              overBudget ? "text-rose-600" : "text-gray-800"
                            }`}
                            title={overBudget ? "Over the estimated time" : undefined}
                          >
                            {formatH(t.actualHours)}h
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {t.status ? (
                          <span
                            className="inline-flex items-center gap-1.5 px-2 h-6 rounded-full text-[11px] font-medium border"
                            style={{
                              backgroundColor: `${t.status.color}15`,
                              color: t.status.color,
                              borderColor: `${t.status.color}40`,
                            }}
                          >
                            <span
                              className="inline-block h-1.5 w-1.5 rounded-full"
                              style={{ background: t.status.color }}
                            />
                            {t.status.name}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
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

function StatCard({
  label,
  value,
  tone,
  icon: Icon,
  footer,
}: {
  label: string;
  value: string | number;
  tone: "blue" | "emerald" | "rose" | "sky" | "violet";
  icon: React.ElementType;
  footer?: string;
}) {
  const toneCls: Record<typeof tone, { card: string; iconBg: string; iconColor: string; num: string; bar: string }> = {
    blue: {
      card: "border-blue-100",
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
      num: "text-blue-700",
      bar: "bg-blue-500",
    },
    emerald: {
      card: "border-emerald-100",
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-600",
      num: "text-emerald-700",
      bar: "bg-emerald-500",
    },
    rose: {
      card: "border-rose-100",
      iconBg: "bg-rose-50",
      iconColor: "text-rose-600",
      num: "text-rose-700",
      bar: "bg-rose-500",
    },
    sky: {
      card: "border-sky-100",
      iconBg: "bg-sky-50",
      iconColor: "text-sky-600",
      num: "text-sky-700",
      bar: "bg-sky-500",
    },
    violet: {
      card: "border-violet-100",
      iconBg: "bg-violet-50",
      iconColor: "text-violet-600",
      num: "text-violet-700",
      bar: "bg-violet-500",
    },
  };
  const c = toneCls[tone];
  return (
    <div className={`relative bg-white border ${c.card} rounded-md shadow-sm overflow-hidden`}>
      <span className={`absolute left-0 top-0 bottom-0 w-1 ${c.bar}`} />
      <div className="flex items-start gap-3 px-4 py-3 pl-5">
        <span className={`inline-flex items-center justify-center h-10 w-10 rounded-md ${c.iconBg} ${c.iconColor} shrink-0`}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">{label}</div>
          <div className={`mt-0.5 text-2xl font-bold leading-tight ${c.num}`}>{value}</div>
          {footer && (
            <div className="mt-0.5 text-[11px] text-gray-500">{footer}</div>
          )}
        </div>
      </div>
    </div>
  );
}


function formatH(h: number): string {
  if (!Number.isFinite(h) || h <= 0) return "0";
  const fixed = h.toFixed(2).replace(/\.?0+$/, "");
  return fixed;
}

function escapeCsv(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}
