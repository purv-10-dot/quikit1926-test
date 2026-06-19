"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  X,
  Maximize2,
  Minimize2,
  Download,
  Clock,
  Search as SearchIcon,
  Folder,
} from "lucide-react";
import { ReportsEmptyState } from "@/components/reports/empty-state";
import { Pagination } from "@/components/reports/pagination";
import { FilterDropdown } from "@/components/reports/filter-dropdown";
import { dateKey } from "@/lib/utils/timesheetPeriod";

interface ProjectRef {
  id: string;
  key: string;
  name: string;
  color: string | null;
}
interface IssueRef {
  id: string;
  key: string;
  title: string;
}
interface Entry {
  id: string;
  entryDate: string;
  hours: number;
  description: string | null;
  project: ProjectRef;
  issue: IssueRef | null;
}
interface BreakdownRow {
  project: ProjectRef;
  hours: number;
}
interface FilterProject {
  id: string;
  key: string;
  name: string;
}
interface DrawerData {
  user: { id: string; name: string; email: string; avatar: string | null };
  entries: Entry[];
  byProject: BreakdownRow[];
  filterProjects: FilterProject[];
  totalHours: number;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function UserTimeDrawer({
  userId,
  userLabel,
  from,
  to,
  rangeLabel,
  onClose,
}: {
  userId: string;
  userLabel: string;
  from: Date;
  to: Date;
  rangeLabel: string;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [projectId, setProjectId] = useState<string>("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Debounce search.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [userId, projectId, search, pageSize]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Portal target — set after mount so SSR doesn't try to access `document`.
  // Without the portal, an ancestor stacking context (sticky header z-50,
  // theme/impersonation wrappers, etc.) can clip the drawer below the chrome.
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setPortalEl(document.body);
  }, []);

  const query = useQuery({
    queryKey: ["reports.userTime", userId, dateKey(from), dateKey(to), { projectId, search, page, pageSize }],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({
        from: dateKey(from),
        to: dateKey(to),
        page: String(page),
        pageSize: String(pageSize),
      });
      if (projectId) params.set("projectId", projectId);
      if (search) params.set("search", search);
      const res = await fetch(`/api/reports/user-time/${userId}?${params.toString()}`, { signal });
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
  const fetchError = query.isError ? (query.error instanceof Error ? query.error.message : "Failed to load") : null;

  const projectOptions = useMemo(
    () => (data?.filterProjects ?? []).map((p) => ({ value: p.id, label: `${p.key ? `${p.key} ` : ""}${p.name}` })),
    [data?.filterProjects],
  );

  function exportCsv() {
    if (!data) return;
    const metaRows: string[][] = [
      ["User", escapeCsv(data.user.name)],
      ["Range", escapeCsv(rangeLabel)],
      ["Exported", new Date().toISOString().slice(0, 10)],
      [],
    ];
    const header = ["Date", "Project", "Issue Key", "Issue Title", "Hours", "Description"];
    const rows = data.entries.map((e) => [
      new Date(e.entryDate).toISOString().slice(0, 10),
      escapeCsv(e.project.name),
      e.issue?.key ?? "",
      escapeCsv(e.issue?.title ?? ""),
      String(e.hours),
      escapeCsv(e.description ?? ""),
    ]);
    const summary = ["", "", "", "TOTAL", String(data.totalHours), ""];
    const csv = [...metaRows, header, ...rows, summary].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safe = data.user.name.replace(/[\\/:*?"<>|]/g, "").trim().slice(0, 60);
    a.download = `user-time-${safe || data.user.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!portalEl) return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black/30" onMouseDown={onClose}>
      <aside
        onMouseDown={(e) => e.stopPropagation()}
        className={`fixed right-0 top-0 h-full bg-white border-l border-gray-200 shadow-2xl flex flex-col transition-all ${
          expanded ? "w-full" : "w-[680px] max-w-[96vw]"
        }`}
      >
        <header className="flex items-start justify-between gap-3 px-5 py-3 border-b border-gray-200">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-wider text-gray-500">Time Summary</div>
            <div className="mt-1 flex items-center gap-2 min-w-0">
              <Avatar name={userLabel} />
              <span className="text-sm font-semibold text-gray-900 truncate">
                {userLabel}
              </span>
            </div>
            <div className="mt-0.5 text-[11px] text-gray-500">{rangeLabel}</div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
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
            label="All projects"
            icon={Folder}
            value={projectId}
            onChange={setProjectId}
            options={projectOptions}
            searchable
            minWidth={200}
          />
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search description, issue…"
              className="h-8 w-56 pl-8 pr-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
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
            <div className="p-5 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <span key={i} className="qt-shimmer block h-6 rounded" />
              ))}
            </div>
          ) : fetchError ? (
            <div className="m-5 p-4 rounded-md border border-red-200 bg-red-50 text-sm text-red-700">
              <div className="font-semibold mb-1">Couldn&apos;t load this user&apos;s time</div>
              <div className="text-[12px] text-red-600">{fetchError}</div>
            </div>
          ) : !data || data.entries.length === 0 ? (
            <ReportsEmptyState
              title="No time logged in this range"
              hint={
                projectId || search
                  ? "Clear the project filter or search to see all entries."
                  : "Nothing was logged by this user across the selected period."
              }
            />
          ) : (
            <>
              {data.byProject.length > 1 && (
                <section className="p-5 border-b border-gray-100">
                  <h4 className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">By project</h4>
                  <div className="space-y-2">
                    {data.byProject.map((b) => {
                      const pct = data.totalHours ? (b.hours / data.totalHours) * 100 : 0;
                      return (
                        <div key={b.project.id} className="flex items-center gap-3 text-sm">
                          <span
                            className="h-4 w-4 rounded-sm shrink-0"
                            style={{ background: b.project.color ?? "#2563eb" }}
                          />
                          <span className="text-gray-800 truncate flex-1">{b.project.name}</span>
                          <div className="w-40 h-1.5 bg-gray-100 rounded overflow-hidden">
                            <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
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
                      <th className="px-2 py-2 text-left">Project</th>
                      <th className="px-2 py-2 text-left">Issue</th>
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
                          <div className="inline-flex items-center gap-1.5">
                            <span
                              className="h-3 w-3 rounded-sm shrink-0"
                              style={{ background: e.project.color ?? "#2563eb" }}
                            />
                            <span className="text-gray-800 text-xs truncate max-w-[140px]">
                              {e.project.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-2 py-2 text-xs">
                          {e.issue ? (
                            <span>
                              <span className="font-medium text-blue-700">{e.issue.key}</span>{" "}
                              <span className="text-gray-700">{e.issue.title}</span>
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
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
                      <td colSpan={4} className="px-2 py-2 font-semibold text-gray-700">
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
    </div>,
    portalEl,
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
