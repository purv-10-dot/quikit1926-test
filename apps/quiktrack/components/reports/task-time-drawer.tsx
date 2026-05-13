"use client";

import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  X,
  Maximize2,
  Minimize2,
  Download,
  Clock,
  User as UserIcon,
} from "lucide-react";
import { ReportsEmptyState } from "./empty-state";
import { Pagination } from "./pagination";
import { FilterDropdown } from "./filter-dropdown";

interface UserRef {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
}
interface Entry {
  id: string;
  user: UserRef;
  entryDate: string;
  hours: number;
  description: string | null;
}
interface BreakdownRow {
  user: UserRef;
  hours: number;
}
interface DrawerData {
  task: {
    id: string;
    key: string;
    title: string;
    type: string;
    eta: number | null;
    startDate: string | null;
    dueDate: string | null;
  };
  entries: Entry[];
  breakdown: BreakdownRow[];
  totalHours: number;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function TaskTimeDrawer({
  taskId,
  onClose,
}: {
  taskId: string;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const query = useQuery({
    queryKey: ["reports.taskTime", taskId, { assigneeId, page, pageSize }],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams();
      if (assigneeId) params.set("assigneeId", assigneeId);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      const res = await fetch(
        `/api/reports/task-time/${taskId}?${params.toString()}`,
        { signal },
      );
      const j = await res.json();
      if (!j?.success) throw new Error(j?.error ?? "Failed");
      return j.data as DrawerData;
    },
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });

  const data = query.data;
  const loading = query.isLoading && !query.data;
  const isRefetching = query.isFetching && !!query.data;

  useEffect(() => {
    setPage(1);
  }, [taskId, assigneeId, pageSize]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const assigneeOptions = useMemo(() => {
    if (!data) return [];
    const seen = new Map<string, UserRef>();
    // Always include everyone who has logged time so the filter is useful even
    // when the current filter would otherwise empty the list.
    for (const e of data.entries) seen.set(e.user.id, e.user);
    for (const b of data.breakdown) seen.set(b.user.id, b.user);
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  function exportCsv() {
    if (!data) return;
    const taskLabel = `${data.task.key} ${data.task.title}`;
    // Metadata header so Excel users see the task name at a glance, plus a
    // dedicated Task column on every row so filters / pivots stay sane.
    const metaRows: string[][] = [
      ["Task", escapeCsv(taskLabel)],
      ["Exported", new Date().toISOString().slice(0, 10)],
      [],
    ];
    const header = ["Task Key", "Task Title", "Date", "User", "Hours", "Description"];
    const rows = data.entries.map((e) => [
      data.task.key,
      escapeCsv(data.task.title),
      new Date(e.entryDate).toISOString().slice(0, 10),
      escapeCsv(e.user.name),
      String(e.hours),
      escapeCsv(e.description ?? ""),
    ]);
    const summary = ["", "", "TOTAL", "", String(data.totalHours), ""];
    const csv = [...metaRows, header, ...rows, summary].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // Sanitize the title for the filename (drop characters Windows rejects).
    const safeTitle = data.task.title.replace(/[\\/:*?"<>|]/g, "").trim().slice(0, 60);
    a.download = `task-time-${data.task.key}${safeTitle ? `-${safeTitle}` : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/30" onMouseDown={onClose}>
      <aside
        onMouseDown={(e) => e.stopPropagation()}
        className={`fixed right-0 top-0 h-full bg-white border-l border-gray-200 shadow-2xl flex flex-col transition-all ${
          expanded ? "w-full" : "w-[640px] max-w-[96vw]"
        }`}
      >
        <header className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-gray-500">Time Summary</div>
            {data ? (
              <div className="mt-0.5 flex items-center gap-2">
                <span className="text-sm font-semibold text-blue-700">{data.task.key}</span>
                <span className="text-sm font-semibold text-gray-900 truncate max-w-[460px]">
                  {data.task.title}
                </span>
              </div>
            ) : (
              <div className="h-4 w-48 mt-1 bg-gray-100 rounded animate-pulse" />
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="p-1.5 rounded border border-gray-200 hover:bg-gray-100 text-gray-600"
              aria-label={expanded ? "Collapse" : "Expand"}
              title={expanded ? "Collapse" : "Expand"}
            >
              {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded border border-gray-200 hover:bg-gray-100 text-gray-600"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
          <FilterDropdown
            label="All assignees"
            icon={UserIcon}
            value={assigneeId}
            onChange={setAssigneeId}
            options={assigneeOptions.map((u) => ({ value: u.id, label: u.name }))}
            minWidth={180}
          />
          <div className="ml-auto inline-flex items-center gap-3 text-xs text-gray-600">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-blue-500" />
              <span>
                Total{" "}
                <span className="font-semibold text-gray-900">
                  {data?.totalHours.toFixed(2).replace(/\.?0+$/, "") ?? "0"}h
                </span>
              </span>
            </span>
            <button
              type="button"
              onClick={exportCsv}
              disabled={!data || data.entries.length === 0}
              className="inline-flex items-center gap-1 h-8 px-3 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-500"
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </button>
          </div>
        </div>

        {isRefetching && (
          <div className="relative h-0.5 bg-blue-100 overflow-hidden">
            <div className="absolute inset-y-0 w-1/3 bg-blue-500 qt-progress-slide" />
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <DrawerSkeleton />
          ) : !data || data.entries.length === 0 ? (
            <ReportsEmptyState
              title="No time logged yet"
              hint="Log time against this task to see a breakdown here."
            />
          ) : (
            <>
              {data.breakdown.length > 1 && (
                <section className="p-5 border-b border-gray-100">
                  <h4 className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">
                    By assignee
                  </h4>
                  <div className="space-y-2">
                    {data.breakdown.map((b) => {
                      const pct = data.totalHours ? (b.hours / data.totalHours) * 100 : 0;
                      return (
                        <div key={b.user.id} className="flex items-center gap-3 text-sm">
                          <Avatar name={b.user.name} />
                          <span className="text-gray-800 truncate flex-1">{b.user.name}</span>
                          <div className="w-40 h-1.5 bg-gray-100 rounded overflow-hidden">
                            <div
                              className="h-full bg-blue-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-gray-900 font-medium w-12 text-right">
                            {formatH(b.hours)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              <section className="p-5">
                <h4 className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Entries</h4>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
                      <th className="px-2 py-2 text-left">Date</th>
                      <th className="px-2 py-2 text-left">User</th>
                      <th className="px-2 py-2 text-left">Description</th>
                      <th className="px-2 py-2 text-right">Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.entries.map((e) => (
                      <tr key={e.id} className="border-b border-gray-100">
                        <td className="px-2 py-2 text-gray-700 text-xs whitespace-nowrap">
                          {new Date(e.entryDate).toLocaleDateString(undefined, {
                            day: "2-digit",
                            month: "short",
                            year: "2-digit",
                          })}
                        </td>
                        <td className="px-2 py-2">
                          <div className="inline-flex items-center gap-2">
                            <Avatar name={e.user.name} />
                            <span className="text-gray-800 text-xs">{e.user.name}</span>
                          </div>
                        </td>
                        <td className="px-2 py-2 text-gray-700 text-xs">
                          {e.description || <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-2 py-2 text-right text-gray-900 font-medium">
                          {formatH(e.hours)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50">
                      <td colSpan={3} className="px-2 py-2 font-semibold text-gray-700">
                        Total
                      </td>
                      <td className="px-2 py-2 text-right font-bold text-gray-900">
                        {formatH(data.totalHours)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </section>
              {data.total > pageSize && (
                <Pagination
                  page={data.page}
                  pageSize={data.pageSize}
                  total={data.total}
                  totalPages={data.totalPages}
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                  pageSizeOptions={[10, 25, 50]}
                />
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function DrawerSkeleton() {
  return (
    <div className="p-5 space-y-5">
      <div className="space-y-2">
        <span className="qt-shimmer block h-3 w-24 rounded" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="qt-shimmer block h-6 w-6 rounded-full" />
            <span className="qt-shimmer block h-3 w-32 rounded" />
            <span className="qt-shimmer block h-1.5 flex-1 max-w-[160px] rounded" />
            <span className="qt-shimmer block h-3 w-10 rounded ml-auto" />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <span className="qt-shimmer block h-3 w-20 rounded" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="grid grid-cols-[80px_1fr_1fr_60px] gap-3">
            <span className="qt-shimmer block h-3 rounded" />
            <span className="qt-shimmer block h-3 rounded" />
            <span className="qt-shimmer block h-3 rounded" />
            <span className="qt-shimmer block h-3 rounded ml-auto w-10" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initial = (name || "U").trim().charAt(0).toUpperCase();
  return (
    <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-blue-600 text-white text-[10px] font-semibold">
      {initial}
    </span>
  );
}

function formatH(h: number): string {
  if (!Number.isFinite(h) || h <= 0) return "0";
  return `${h.toFixed(2).replace(/\.?0+$/, "")}h`;
}

function escapeCsv(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}
