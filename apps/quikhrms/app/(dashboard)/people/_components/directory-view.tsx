"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import {
  Search, Share2, Download, Filter as FilterIcon, UserPlus,
  Columns3, Bookmark, ListTree, ChevronDown, Trash2,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { clsx } from "clsx";
import { FilterChipsBar, type FilterChip } from "./filter-chips";
import { QuickFilters, type FilterColumn } from "./quick-filters";

interface Employee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  workEmail: string;
  jobTitle: string | null;
  profilePhoto: string | null;
  dateOfJoining: string;
  status: string;
  department: { id: string; name: string } | null;
  designation: { id: string; title: string } | null;
  officeLocation: { id: string; name: string; city: string | null } | null;
  reportingManager?: { id: string; firstName: string; lastName: string; profilePhoto: string | null } | null;
}

const ALL_COLS = [
  { key: "displayName", label: "Display name", default: true },
  { key: "department", label: "Department", default: true },
  { key: "jobTitle", label: "Job title", default: true },
  { key: "email", label: "Email", default: true },
  { key: "manager", label: "Reports to", default: true },
  { key: "joining", label: "Start date", default: true },
  { key: "location", label: "Site", default: false },
  { key: "code", label: "Employee code", default: false },
] as const;

type ColKey = (typeof ALL_COLS)[number]["key"];

// Server clamps `limit` to 100 (see lib/utils/pagination.ts); keep this at or
// below that so a single page never silently drops rows.
const PAGE_SIZE = 25;

interface Props {
  filterColumns: FilterColumn[];
}

export function DirectoryView({ filterColumns }: Props) {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [chips, setChips] = useState<FilterChip[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [groupBy, setGroupBy] = useState<"" | "department" | "officeLocation" | "designation">("");
  const [activeCols, setActiveCols] = useState<Set<ColKey>>(
    new Set(ALL_COLS.filter((c) => c.default).map((c) => c.key)),
  );
  const [confirmDelete, setConfirmDelete] = useState<Employee | null>(null);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // Server-side pagination: changing the search term or any filter resets to
  // the first page so the user never lands on an out-of-range page.
  useEffect(() => { setPage(1); }, [search, chips]);

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/employees/${id}`),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ["people", "directory"] });
      const snapshots = queryClient.getQueriesData<{ success: boolean; data: Employee[] }>({ queryKey: ["people", "directory"] });
      queryClient.setQueriesData<{ success: boolean; data: Employee[] }>(
        { queryKey: ["people", "directory"] },
        (old) => (old ? { ...old, data: old.data.filter((emp) => emp.id !== id) } : old),
      );
      return { snapshots };
    },
    onError: (e: Error, _id, ctx) => {
      setDeleteErr(e.message);
      if (ctx?.snapshots) {
        for (const [key, value] of ctx.snapshots) queryClient.setQueryData(key, value);
      }
    },
    onSuccess: () => {
      setConfirmDelete(null);
      setDeleteErr(null);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["people", "directory"] });
      queryClient.invalidateQueries({ queryKey: ["people"] });
      queryClient.invalidateQueries({ queryKey: ["org-chart"] });
    },
  });

  const queryParams = useMemo(() => {
    const p = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
      fields: "manager",
    });
    if (search) p.set("search", search);
    for (const chip of chips) {
      if (chip.key === "department") p.set("department", chip.values[0]);
      if (chip.key === "status") p.set("status", chip.values[0]);
      if (chip.key === "employmentType") p.set("employmentType", chip.values[0]);
      if (chip.key === "workLocation") p.set("workLocation", chip.values[0]);
      if (chip.key === "officeLocationId") p.set("officeLocationId", chip.values[0]);
    }
    return p.toString();
  }, [search, chips, page]);

  const { data, isLoading } = useQuery({
    queryKey: ["people", "directory", queryParams],
    queryFn: () => api.get<Employee[]>(`/api/v1/hrms/employees?${queryParams}`),
    placeholderData: (prev) => prev, // keep prior page visible while the next loads
  });
  const employees = data?.data ?? [];
  const total = data?.meta?.total ?? employees.length;
  const totalPages = data?.meta?.totalPages ?? 1;

  // If the result set shrinks (e.g. deleting the last row on the final page),
  // clamp back into range so the pager never points past the last page.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const grouped = useMemo(() => {
    if (!groupBy) return { __all: employees };
    const map: Record<string, Employee[]> = {};
    for (const e of employees) {
      let key = "—";
      if (groupBy === "department") key = e.department?.name ?? "No department";
      if (groupBy === "officeLocation") key = e.officeLocation?.name ?? "No location";
      if (groupBy === "designation") key = e.designation?.title ?? "No designation";
      (map[key] ??= []).push(e);
    }
    return map;
  }, [employees, groupBy]);

  const toggleCol = (k: ColKey) => {
    setActiveCols((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  const [exporting, setExporting] = useState(false);

  // Export must cover the whole filtered result set, not just the visible page,
  // so we page through the API (server caps limit at 100) and concatenate.
  const fetchAllMatching = async (): Promise<Employee[]> => {
    const base = new URLSearchParams(queryParams);
    base.set("limit", "100");
    const all: Employee[] = [];
    let p = 1;
    for (;;) {
      base.set("page", String(p));
      const res = await api.get<Employee[]>(`/api/v1/hrms/employees?${base.toString()}`);
      all.push(...res.data);
      const pages = res.meta?.totalPages ?? 1;
      if (p >= pages || res.data.length === 0) break;
      p += 1;
    }
    return all;
  };

  const exportCsv = async () => {
    if (exporting) return;
    setExporting(true);
    let exportRows: Employee[] = [];
    try {
      exportRows = await fetchAllMatching();
    } finally {
      setExporting(false);
    }
    const headers = ["Code", "Name", "Department", "Job Title", "Email", "Reports To", "Start Date", "Site"];
    const rows = exportRows.map((e) => [
      e.employeeCode,
      e.displayName ?? `${e.firstName} ${e.lastName}`,
      e.department?.name ?? "",
      e.jobTitle ?? e.designation?.title ?? "",
      e.workEmail,
      e.reportingManager ? `${e.reportingManager.firstName} ${e.reportingManager.lastName}` : "",
      new Date(e.dateOfJoining).toLocaleDateString("en-IN"),
      e.officeLocation?.name ?? "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => /[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `directory-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button onClick={() => setShowFilters(true)} className="btn btn-secondary btn-sm">
            <FilterIcon size={13} /> Filters{chips.length > 0 && ` (${chips.length})`}
          </button>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              className="pl-8 pr-3 py-2 text-sm border border-[var(--border)] rounded-full w-72 focus:outline-none focus:ring-1 focus:ring-[#16243A]"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-secondary btn-sm" title="Share view">
            <Share2 size={13} />
          </button>
          <button onClick={exportCsv} disabled={exporting} className="btn btn-secondary btn-sm disabled:opacity-50" title="Export CSV">
            <Download size={13} />
          </button>
          <Link href="/employees/new" className="btn btn-primary btn-sm">
            <UserPlus size={13} /> New hire
          </Link>
        </div>
      </div>

      <FilterChipsBar
        chips={chips}
        onRemove={(k) => setChips((c) => c.filter((x) => x.key !== k))}
        onResetAll={() => setChips([])}
      />

      {/* Sub-toolbar */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>Total: <strong className="text-gray-900">{total}</strong></span>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              placeholder="Search"
              className="pl-8 pr-3 py-1.5 text-xs border border-[var(--border)] rounded-md w-44 focus:outline-none focus:ring-1 focus:ring-[#16243A]"
            />
          </div>
          <Link href="/employees/new" className="btn btn-secondary btn-sm">
            <UserPlus size={12} /> New hire
          </Link>
          <button
            onClick={() => setGroupBy((g) => (g === "department" ? "" : "department"))}
            className={clsx("btn btn-sm", groupBy ? "btn-primary" : "btn-secondary")}
          >
            <ListTree size={12} /> Group by {groupBy && <ChevronDown size={11} />}
          </button>
          <button title="Save view" className="btn btn-secondary btn-sm">
            <Bookmark size={12} />
          </button>
          <button onClick={() => setShowColumns((s) => !s)} className="btn btn-secondary btn-sm relative">
            <Columns3 size={12} />
            {showColumns && (
              <div className="absolute right-0 top-full mt-1 w-48 z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-2 text-left">
                {ALL_COLS.map((c) => (
                  <label key={c.key} className="flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-gray-50 rounded">
                    <input
                      type="checkbox"
                      checked={activeCols.has(c.key)}
                      onChange={() => toggleCol(c.key)}
                      className="rounded"
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            )}
          </button>
          <button onClick={exportCsv} disabled={exporting} title="Export" className="btn btn-secondary btn-sm disabled:opacity-50">
            <Download size={12} />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="surface-card overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-gray-500">Loading…</div>
        ) : employees.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-500">No employees match your filters.</div>
        ) : (
          Object.entries(grouped).map(([groupName, list]) => (
            <div key={groupName} className="border-b border-gray-100 last:border-0">
              {groupBy && (
                <div className="px-5 py-2 bg-gray-50 text-xs font-bold text-gray-700 uppercase tracking-wide flex items-center gap-2">
                  {groupName} <span className="text-gray-400 font-normal">({list.length})</span>
                </div>
              )}
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] font-bold text-gray-500 uppercase border-b border-gray-100">
                    <th className="w-10 px-3"><input type="checkbox" className="rounded" /></th>
                    <th className="text-left px-3 py-2"></th>
                    {activeCols.has("displayName") && <th className="text-left py-2 px-3">Display name</th>}
                    {activeCols.has("department") && <th className="text-left py-2 px-3">Department</th>}
                    {activeCols.has("jobTitle") && <th className="text-left py-2 px-3">Job title</th>}
                    {activeCols.has("email") && <th className="text-left py-2 px-3">Email</th>}
                    {activeCols.has("manager") && <th className="text-left py-2 px-3">Reports to</th>}
                    {activeCols.has("joining") && <th className="text-left py-2 px-3">Start date</th>}
                    {activeCols.has("location") && <th className="text-left py-2 px-3">Site</th>}
                    {activeCols.has("code") && <th className="text-left py-2 px-3">Code</th>}
                    <th className="w-12 px-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((e, i) => (
                    <tr key={e.id} className="row-stagger border-b border-gray-50 hover:bg-gray-50/50" style={{ ["--i" as never]: Math.min(i, 10) }}>
                      <td className="px-3 py-3"><input type="checkbox" className="rounded" /></td>
                      <td className="px-3 py-3">
                        <Link href={`/employees/${e.id}`} className="flex items-center gap-3">
                          <Avatar emp={e} />
                          <div>
                            <p className="font-semibold text-gray-900 group-hover:text-[#3b82f6]">
                              {e.displayName ?? `${e.firstName} ${e.lastName}`}
                            </p>
                            <p className="text-xs text-gray-500">{e.jobTitle ?? e.designation?.title ?? "—"}</p>
                          </div>
                        </Link>
                      </td>
                      {activeCols.has("displayName") && <td className="py-3 px-3 text-gray-700">{e.displayName ?? `${e.firstName} ${e.lastName}`}</td>}
                      {activeCols.has("department") && <td className="py-3 px-3 text-gray-700">{e.department?.name ?? "—"}</td>}
                      {activeCols.has("jobTitle") && <td className="py-3 px-3 text-gray-700">{e.jobTitle ?? e.designation?.title ?? "—"}</td>}
                      {activeCols.has("email") && <td className="py-3 px-3 text-gray-700">{e.workEmail}</td>}
                      {activeCols.has("manager") && (
                        <td className="py-3 px-3 text-gray-700">
                          {e.reportingManager ? `${e.reportingManager.firstName} ${e.reportingManager.lastName}` : "—"}
                        </td>
                      )}
                      {activeCols.has("joining") && (
                        <td className="py-3 px-3 text-gray-700">{new Date(e.dateOfJoining).toLocaleDateString("en-IN")}</td>
                      )}
                      {activeCols.has("location") && <td className="py-3 px-3 text-gray-700">{e.officeLocation?.name ?? "—"}</td>}
                      {activeCols.has("code") && <td className="py-3 px-3 text-gray-700 font-mono">{e.employeeCode}</td>}
                      <td className="py-3 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => { setDeleteErr(null); setConfirmDelete(e); }}
                          title="Delete employee"
                          className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </div>

      {/* Pager */}
      {!isLoading && total > 0 && (
        <div className="flex items-center justify-between text-xs text-gray-600">
          <span>
            Showing{" "}
            <strong className="text-gray-900">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)}
            </strong>{" "}
            of <strong className="text-gray-900">{total}</strong>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="btn btn-secondary btn-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={13} /> Prev
            </button>
            <span className="px-1">Page <strong className="text-gray-900">{page}</strong> of {totalPages}</span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="btn btn-secondary btn-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}

      <QuickFilters
        open={showFilters}
        onClose={() => setShowFilters(false)}
        columns={filterColumns}
        initial={chips}
        onApply={(c) => setChips(c)}
      />

      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !deleteMut.isPending && setConfirmDelete(null)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-5" onClick={(ev) => ev.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-600 shrink-0">
                <Trash2 size={18} />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-gray-900">Delete employee?</h3>
                <p className="text-sm text-gray-600 mt-1">
                  This will soft-delete <strong>{confirmDelete.displayName ?? `${confirmDelete.firstName} ${confirmDelete.lastName}`}</strong> ({confirmDelete.employeeCode}) and unlink direct reports. Audit and financial records are kept.
                </p>
                {deleteErr && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-2 py-1 mt-2">{deleteErr}</p>}
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                disabled={deleteMut.isPending}
                onClick={() => setConfirmDelete(null)}
                className="px-3 py-1.5 text-sm border border-[var(--border)] bg-white hover:bg-gray-50 text-gray-700 rounded-md"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteMut.isPending}
                onClick={() => deleteMut.mutate(confirmDelete.id)}
                className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white rounded-md font-semibold"
              >
                {deleteMut.isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Avatar({ emp }: { emp: Employee }) {
  const initials = `${emp.firstName[0] ?? ""}${emp.lastName[0] ?? ""}`.toUpperCase();
  const colors = ["bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-pink-500", "bg-violet-500", "bg-cyan-500"];
  const color = colors[emp.id.charCodeAt(0) % colors.length];
  if (emp.profilePhoto) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={emp.profilePhoto} alt="" className="w-9 h-9 rounded-full object-cover ring-2 ring-gray-100" />
    );
  }
  return (
    <div className={`w-9 h-9 rounded-full ${color} flex items-center justify-center text-white text-xs font-bold`}>
      {initials}
    </div>
  );
}
