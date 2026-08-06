"use client";

/**
 * Daily Progress Reports — list page (matches reference screenshot).
 *
 *   [ Total DPRs | Approved | Pending | Halted Days ]   ← KPI cards
 *   [ 🔍 Search | filter | export ]                      ← action strip
 *   ┌─────────────────────────────────────────────────┐
 *   │ DATE | PROJECT | ITEMS REPORTED | STATUS | ...  │
 *   └─────────────────────────────────────────────────┘
 *
 * The "+ New DPR" button routes to /projects/dpr/new (full-page form).
 *
 * Status / RBAC flow mirrors Work Orders:
 *   draft     → [Submit] (raiser)            → submitted
 *   submitted → [Approve] / [Reject] (approver) → approved / rejected
 *   approved  → locked (edit/delete disabled)
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
  CheckCircle2,
  Clock,
  Ban,
  Search,
  Download,
  ChevronRight,
  ChevronLeft,
  Plus,
  FileText,
  Building2,
  Send,
  Pencil,
  Trash2,
  Check,
  X as XIcon,
  CalendarDays,
  LayoutList,
} from "lucide-react";
import { PageFrame, PageHeader, PageContainer } from "@/components/PageShell";
import { Pager } from "@/components/Pager";
import { FilterPopoverButton } from "@/components/FilterPopoverButton";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { WorkflowConfirmDialog } from "@/components/WorkflowConfirmDialog";
import { useDPRs, useDPRStats, useDeleteDPR } from "@/hooks/use-projects";
import { useProjects } from "@/hooks/use-masters";
import { usePermissions, useMenuActions } from "@/hooks/use-permissions";
import { useWorkflowConfirm } from "@/hooks/use-workflow-confirm";
import { useQueryClient } from "@tanstack/react-query";
import { DPRDrawer } from "./components/DPRDrawer";

const MENU_KEY = "pm.dpr";

interface DprRow {
  id: string;
  status?: string;
  workHalted?: boolean;
  dprNumber?: string;
  projectName?: string;
  projectId?: string;
  reportDate?: string;
  canActOnCurrentStep?: boolean;
  workItemCount?: number;
}

const STATUS_COLORS: Record<string, string> = {
  draft:       "bg-slate-50 text-slate-600 border-slate-200",
  submitted:   "bg-amber-50 text-amber-700 border-amber-200",
  approved_l1: "bg-sky-50 text-sky-700 border-sky-200",
  approved:    "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected:    "bg-rose-50 text-rose-700 border-rose-200",
};

// Status options for the Filter popover. Values map 1:1 to the DB status the
// list route matches on (`where.status = status`); "all" clears the filter.
const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

export default function DPRPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { canAdd } = useMenuActions("/projects/dpr");
  const [search, setSearch] = useState("");
  // Server-side filters (Filter popover). Status/project apply in both table
  // and calendar view; the date range applies only in table view (calendar
  // already scopes by the visible month).
  const [statusFilter, setStatusFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "calendar">("table");
  // Calendar always opens on the current month; users navigate with the
  // prev/next/today buttons. Stored as the *first* of the visible month.
  const [calMonth, setCalMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [deleteTarget, setDeleteTarget] = useState<DprRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Right-side "Add" drawer — replaces full-page navigation to
  // /projects/dpr/new for the New DPR action. Edit still uses the
  // full-page route via the row's edit button.
  const [addDrawerOpen, setAddDrawerOpen] = useState(false);
  // Workflow confirmation — the row that triggered the action lives in
  // local state so the dialog can render its label/number; the action
  // lifecycle (open/close/run/error) is owned by useWorkflowConfirm so
  // the surface mirrors Work Orders & Material Estimation 1:1.
  const [workflowRow, setWorkflowRow] = useState<DprRow | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const isCalendar = viewMode === "calendar";

  // Reset to first page when the search term, filters, or view change.
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, projectFilter, fromDate, toDate, viewMode, pageSize]);

  // Projects for the Filter popover's project dropdown.
  const { data: projectsResult } = useProjects();
  const freeScopeProjectIds = useMemo(
    () =>
      new Set(
        ((projectsResult?.data ?? []) as Array<{ id: string; executionMode?: string }>)
          .filter((p) => p.executionMode === "FREE_SCOPE")
          .map((p) => p.id),
      ),
    [projectsResult],
  );
  const projectOptions = useMemo(
    () => (projectsResult?.data ?? []) as Array<{ id: string; name?: string }>,
    [projectsResult],
  );
  const activeFilterCount =
    (statusFilter !== "all" ? 1 : 0) +
    (projectFilter ? 1 : 0) +
    (fromDate ? 1 : 0) +
    (toDate ? 1 : 0);
  const clearFilters = () => {
    setStatusFilter("all");
    setProjectFilter("");
    setFromDate("");
    setToDate("");
  };

  // Server-side export — hands the current filters to /export, which builds
  // the same WHERE and streams an .xlsx. Anchor-click so the attachment
  // downloads without opening a blank tab.
  const handleExport = () => {
    const qs = new URLSearchParams();
    if (search) qs.set("search", search);
    if (statusFilter !== "all") qs.set("status", statusFilter);
    if (projectFilter) qs.set("projectId", projectFilter);
    if (fromDate) qs.set("fromDate", fromDate);
    if (toDate) qs.set("toDate", toDate);
    const q = qs.toString();
    const a = document.createElement("a");
    a.href = `/api/projects/dpr/export${q ? `?${q}` : ""}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // Calendar view fetches one month at a time (date-scoped, unpaged);
  // table view fetches a page at a time.
  const monthFrom = `${calMonth.getFullYear()}-${String(calMonth.getMonth() + 1).padStart(2, "0")}-01`;
  const monthLastDay = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).getDate();
  const monthTo = `${calMonth.getFullYear()}-${String(calMonth.getMonth() + 1).padStart(2, "0")}-${String(monthLastDay).padStart(2, "0")}`;

  const { data: result, isLoading } = useDPRs(
    isCalendar
      ? {
          search,
          status: statusFilter,
          projectId: projectFilter,
          fromDate: monthFrom,
          toDate: monthTo,
        }
      : {
          search,
          status: statusFilter,
          projectId: projectFilter,
          fromDate,
          toDate,
          page,
          pageSize,
        },
  );
  const total = (result as { total?: number } | undefined)?.total ?? 0;
  // KPI tiles come from a server-side groupBy (scope-wide, search-aware),
  // so they stay correct regardless of pagination or calendar month. The
  // project filter narrows them too; status/date are intentionally ignored
  // so the tiles keep reflecting the full status breakdown.
  const { data: statsResult } = useDPRStats({ search, projectId: projectFilter });
  const deleteMutation = useDeleteDPR();

  // RBAC — mirrors the Work Order gate.
  const { permissionMatrix, isSuper } = usePermissions();
  const matrixRow = permissionMatrix?.[MENU_KEY];
  const canEdit = isSuper || !matrixRow || matrixRow.edit !== false;
  const canDelete = isSuper || !matrixRow || matrixRow.delete !== false;
  const canSubmit = canEdit;
  // Approve/Reject visibility is decided PER ROW by the workflow's
  // current step (server-computed in the list API as
  // `row.canActOnCurrentStep`).
  const canApproveRow = (row: DprRow): boolean =>
    isSuper || row?.canActOnCurrentStep === true;

  const rows: DprRow[] = useMemo(() => (result?.data ?? []) as unknown as DprRow[], [result]);

  const totalDPRs = statsResult?.stats?.total ?? 0;
  const approved = statsResult?.stats?.approved ?? 0;
  const pending = statsResult?.stats?.pending ?? 0;
  const halted = statsResult?.stats?.halted ?? 0;

  // Workflow URLs are recomputed from the active row each time the
  // dialog opens. The hook re-reads the config on every call, so toggling
  // workflowRow + invoking workflow.open() picks up the right ids.
  const workflow = useWorkflowConfirm({
    submitUrl: workflowRow ? `/api/projects/dpr/${workflowRow.id}/submit` : "",
    approveUrl: workflowRow ? `/api/projects/dpr/${workflowRow.id}/approve` : "",
    invalidateKeys: [["dprs"], ["dpr"]],
  });

  const openWorkflow = (
    kind: "submit" | "approve" | "reject",
    row: DprRow,
  ) => {
    setWorkflowRow(row);
    workflow.open(kind);
  };
  const closeWorkflow = () => {
    workflow.close();
    if (!workflow.pending) setWorkflowRow(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch { /* error toast handled globally */ }
    finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <PageFrame>
      <PageHeader
        title="Daily Progress Report (DPR)"
        subtitle="Track daily site activities, material consumption, and labor"
        breadcrumbs={[
          { label: "Projects", href: "/projects" },
          { label: "DPR" },
        ]}
        actions={
          canAdd ? (
            <button
              type="button"
              onClick={() => setAddDrawerOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-b from-accent-500 to-accent-600 hover:from-accent-600 hover:to-accent-700 shadow-brand active:translate-y-[1px] transition-all"
            >
              <Plus className="w-4 h-4" /> New DPR
            </button>
          ) : null
        }
      />

      <PageContainer fill>
        {/* ── KPI cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <KPICard
            icon={<ClipboardList className="w-5 h-5" />}
            label="Total DPRs"
            value={totalDPRs.toString()}
            tone="indigo"
          />
          <KPICard
            icon={<CheckCircle2 className="w-5 h-5" />}
            label="Approved"
            value={approved.toString()}
            tone="green"
          />
          <KPICard
            icon={<Clock className="w-5 h-5" />}
            label="Pending"
            value={pending.toString()}
            tone="amber"
          />
          <KPICard
            icon={<Ban className="w-5 h-5" />}
            label="Halted Days"
            value={halted.toString()}
            tone="red"
          />
        </div>

        {/* ── Action strip + table ── */}
        <div className="flex min-h-0 flex-1 flex-col bg-white rounded-2xl border border-slate-200 shadow-soft overflow-hidden">
          <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
            <div className="flex items-center gap-2 flex-1 max-w-sm">
              <div className="relative w-full">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search DPRs…"
                  className="w-full text-sm pl-9 pr-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent-200 focus:border-accent-400 transition-shadow"
                />
              </div>
            </div>
            <FilterPopoverButton activeCount={activeFilterCount} onClear={clearFilters}>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Status
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent-200 focus:border-accent-400"
                >
                  {STATUS_FILTERS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Project
                </label>
                <select
                  value={projectFilter}
                  onChange={(e) => setProjectFilter(e.target.value)}
                  className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent-200 focus:border-accent-400"
                >
                  <option value="">All projects</option>
                  {projectOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name ?? p.id}
                    </option>
                  ))}
                </select>
              </div>

              {!isCalendar && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      From
                    </label>
                    <input
                      type="date"
                      value={fromDate}
                      max={toDate || undefined}
                      onChange={(e) => setFromDate(e.target.value)}
                      className="w-full text-sm px-2 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent-200 focus:border-accent-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      To
                    </label>
                    <input
                      type="date"
                      value={toDate}
                      min={fromDate || undefined}
                      onChange={(e) => setToDate(e.target.value)}
                      className="w-full text-sm px-2 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent-200 focus:border-accent-400"
                    />
                  </div>
                </div>
              )}
            </FilterPopoverButton>
            <button
              type="button"
              onClick={handleExport}
              className="p-2 text-slate-400 hover:text-accent-700 hover:bg-accent-50 rounded-lg border border-transparent hover:border-accent-200 transition-colors"
              title="Export to Excel"
            >
              <Download className="w-4 h-4" />
            </button>
            <ViewToggle value={viewMode} onChange={setViewMode} />
          </div>

          {viewMode === "calendar" ? (
            <DPRCalendar
              rows={rows}
              isLoading={isLoading}
              month={calMonth}
              onMonthChange={setCalMonth}
              onOpen={(row) => router.push(`/projects/dpr/${row.id}`)}
              onAddOnDate={(date) => {
                if (!canAdd) return;
                // Click on an empty day cell in the current month → open the
                // Add drawer. The drawer takes its own default date today;
                // future polish can plumb a prefilled date prop through.
                if (date) setAddDrawerOpen(true);
              }}
            />
          ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-b from-slate-50 to-slate-100/70 border-b border-slate-200">
                <tr className="text-[11px] uppercase font-bold text-slate-600 tracking-wider">
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Project</th>
                  <th className="px-4 py-3 text-left">Items Reported</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-500">
                      Loading DPRs…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-16 text-center">
                      <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-accent-50 text-accent-500 mb-3 ring-4 ring-accent-100">
                        <ClipboardList className="w-6 h-6" />
                      </div>
                      <div className="text-sm font-semibold text-slate-800">
                        No DPRs yet
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Click <b className="text-accent-700">New DPR</b> to record today&apos;s progress.
                      </p>
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <DPRRow
                      key={row.id}
                      row={row}
                      isFreeScope={freeScopeProjectIds.has(String(row.projectId ?? ""))}
                      canEdit={canEdit}
                      canDelete={canDelete}
                      canSubmit={canSubmit}
                      canApprove={canApproveRow(row)}
                      onOpen={() => router.push(`/projects/dpr/${row.id}`)}
                      onEdit={() => router.push(`/projects/dpr/${row.id}/edit`)}
                      onDelete={() => setDeleteTarget(row)}
                      onSubmit={() => openWorkflow("submit", row)}
                      onApprove={() => openWorkflow("approve", row)}
                      onReject={() => openWorkflow("reject", row)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
          )}
          {!isCalendar && total > 0 && (
            <Pager
              variant="footer"
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          )}
        </div>
      </PageContainer>
      </PageFrame>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        tone="danger"
        title="Delete DPR"
        confirmLabel="Delete"
        message={
          deleteTarget ? (
            <>
              Mark{" "}
              <span className="font-semibold text-slate-900">
                {deleteTarget.dprNumber}
              </span>{" "}
              as inactive? It will be hidden from the list.
            </>
          ) : null
        }
      />

      <WorkflowConfirmDialog
        action={workflow.action}
        pending={workflow.pending}
        rejectReason={workflow.rejectReason}
        onRejectReasonChange={workflow.setRejectReason}
        onClose={closeWorkflow}
        onConfirm={workflow.run}
        entityNoun="DPR"
        entityLabel={workflowRow?.dprNumber ?? ""}
        approveHint="On approval the reported quantities are posted to the BOQ progress ledger and the DPR becomes locked."
        rejectPlaceholder="e.g. quantities don't match the site photos — please re-check chainage 100-200"
        error={workflow.error}
      />

      <DPRDrawer
        open={addDrawerOpen}
        onClose={() => setAddDrawerOpen(false)}
        onSaved={() => {
          setAddDrawerOpen(false);
          qc.invalidateQueries({ queryKey: ["dprs"] });
        }}
      />
    </>
  );
}

function ViewToggle({
  value,
  onChange,
}: {
  value: "table" | "calendar";
  onChange: (v: "table" | "calendar") => void;
}) {
  // Segmented control — visually identical to the action-strip icon buttons
  // when un-selected; the active option fills with brand orange. Sits flush
  // with the Filter / Export icons so the strip stays one consistent rail.
  const cls = (active: boolean) =>
    `flex items-center justify-center w-8 h-8 transition-colors ${
      active
        ? "bg-accent-500 text-white shadow-inner"
        : "text-slate-500 hover:text-accent-700 hover:bg-accent-50"
    }`;
  return (
    <div className="ml-1 inline-flex rounded-lg border border-slate-200 overflow-hidden bg-white">
      <button
        type="button"
        onClick={() => onChange("table")}
        className={cls(value === "table")}
        title="Table view"
        aria-pressed={value === "table"}
      >
        <LayoutList className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => onChange("calendar")}
        className={`${cls(value === "calendar")} border-l border-slate-200`}
        title="Calendar view"
        aria-pressed={value === "calendar"}
      >
        <CalendarDays className="w-4 h-4" />
      </button>
    </div>
  );
}

// Status → calendar pill colors. Each entry has the left-stripe (saturated)
// for the status accent, the body bg, and the dot used in the legend.
const CAL_STATUS: Record<
  string,
  { stripe: string; body: string; dot: string; text: string; label: string }
> = {
  draft:       { stripe: "bg-slate-400",   body: "bg-slate-50 hover:bg-slate-100",       dot: "bg-slate-400",   text: "text-slate-700",   label: "Draft" },
  submitted:   { stripe: "bg-amber-500",   body: "bg-amber-50 hover:bg-amber-100",       dot: "bg-amber-500",   text: "text-amber-800",   label: "Submitted" },
  approved_l1: { stripe: "bg-sky-500",     body: "bg-sky-50 hover:bg-sky-100",           dot: "bg-sky-500",     text: "text-sky-800",     label: "L1 Approved" },
  approved:    { stripe: "bg-emerald-500", body: "bg-emerald-50 hover:bg-emerald-100",   dot: "bg-emerald-500", text: "text-emerald-800", label: "Approved" },
  rejected:    { stripe: "bg-rose-500",    body: "bg-rose-50 hover:bg-rose-100",         dot: "bg-rose-500",    text: "text-rose-700",    label: "Rejected" },
};

function ymd(d: Date): string {
  // Local-date YYYY-MM-DD — avoids the timezone-flip a naive
  // toISOString().slice(0,10) introduces in IST around midnight UTC.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function DPRCalendar({
  rows,
  isLoading,
  month,
  onMonthChange,
  onOpen,
  onAddOnDate,
}: {
  rows: DprRow[];
  isLoading: boolean;
  month: Date;
  onMonthChange: (d: Date) => void;
  onOpen: (row: DprRow) => void;
  onAddOnDate: (date: Date) => void;
}) {
  // Bucket DPR rows by their reportDate (local YYYY-MM-DD). Cheap to
  // recompute on every render — usually < 200 rows in view at once.
  const byDate = useMemo(() => {
    const map = new Map<string, DprRow[]>();
    for (const r of rows) {
      if (!r.reportDate) continue;
      const key = ymd(new Date(r.reportDate));
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    }
    return map;
  }, [rows]);

  // 6×7 = 42 cells, always. Start from the Sunday on/before the 1st of
  // the month so weeks render cleanly even when the 1st falls mid-week.
  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const startWeekday = first.getDay(); // 0 (Sun) … 6 (Sat)
    const start = new Date(first);
    start.setDate(first.getDate() - startWeekday);
    const out: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      out.push(d);
    }
    return out;
  }, [month]);

  const today = new Date();
  const todayKey = ymd(today);
  const monthLabel = month.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const goPrev = () => onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1));
  const goNext = () => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1));
  const goToday = () => onMonthChange(new Date(today.getFullYear(), today.getMonth(), 1));

  const totalInMonth = useMemo(() => {
    let n = 0;
    for (const d of cells) {
      if (d.getMonth() !== month.getMonth()) continue;
      n += byDate.get(ymd(d))?.length ?? 0;
    }
    return n;
  }, [cells, byDate, month]);

  // Stable list of statuses present in the visible month — drives the
  // legend so we never show colors that aren't on screen.
  const legendStatuses = useMemo(() => {
    const set = new Set<string>();
    for (const d of cells) {
      if (d.getMonth() !== month.getMonth()) continue;
      for (const r of byDate.get(ymd(d)) ?? []) set.add(r.status ?? "draft");
    }
    // Stable display order matching CAL_STATUS map order.
    return ["draft", "submitted", "approved_l1", "approved", "rejected"].filter((k) =>
      set.has(k),
    );
  }, [cells, byDate, month]);

  return (
    <div>
      {/* Month strip — bigger month label, brand-tinted gradient, status legend on the right */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-200 bg-accent-50">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goPrev}
            className="p-1.5 rounded-lg text-slate-500 hover:text-accent-700 hover:bg-white hover:shadow-sm border border-transparent hover:border-accent-200 transition-all"
            title="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="text-base font-bold text-slate-900 tabular-nums min-w-[140px] text-center tracking-tight">
            {monthLabel}
          </div>
          <button
            type="button"
            onClick={goNext}
            className="p-1.5 rounded-lg text-slate-500 hover:text-accent-700 hover:bg-white hover:shadow-sm border border-transparent hover:border-accent-200 transition-all"
            title="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={goToday}
          className="px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider text-accent-700 bg-white border border-accent-200 shadow-sm hover:bg-accent-50 hover:border-accent-300 transition-all"
        >
          Today
        </button>

        <div className="ml-auto flex items-center gap-4">
          {/* Status legend — only colors that appear this month, keeps it honest */}
          {legendStatuses.length > 0 && (
            <div className="hidden md:flex items-center gap-3">
              {legendStatuses.map((s) => {
                const cfg = CAL_STATUS[s] ?? CAL_STATUS.draft;
                return (
                  <span key={s} className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-slate-600">
                    <span className={`w-2 h-2 rounded-full ${cfg.dot}`} aria-hidden />
                    {cfg.label}
                  </span>
                );
              })}
            </div>
          )}
          <div className="inline-flex items-baseline gap-1.5 px-2.5 py-1 rounded-md bg-white border border-slate-200 shadow-sm">
            <span className="text-base font-bold text-slate-900 tabular-nums leading-none">{totalInMonth}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 leading-none">
              DPR{totalInMonth === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      </div>

      {/* Weekday header — Sun-first; weekend columns subtly tinted */}
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/80">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((w, i) => {
          const isWeekend = i === 0 || i === 6;
          return (
            <div
              key={w}
              className={`px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.08em] text-center ${
                isWeekend ? "text-orange-600/70" : "text-slate-500"
              }`}
            >
              {w}
            </div>
          );
        })}
      </div>

      {/* 6×7 grid */}
      {isLoading ? (
        <div className="px-4 py-16 text-center text-sm text-slate-500">Loading DPRs…</div>
      ) : (
        <div className="grid grid-cols-7 grid-rows-6">
          {cells.map((d, idx) => {
            const inMonth = d.getMonth() === month.getMonth();
            const key = ymd(d);
            const dprList = byDate.get(key) ?? [];
            const isToday = key === todayKey;
            const dow = d.getDay();
            const isWeekend = dow === 0 || dow === 6;
            const isLastCol = (idx + 1) % 7 === 0;
            const isLastRow = idx >= 35;
            const empty = dprList.length === 0;

            // Cell background — layered: today wins, then weekend-in-month,
            // then in-month, then out-of-month gets the most muted tint.
            const bg = !inMonth
              ? "bg-slate-50/60"
              : isToday
                ? "bg-accent-50"
                : isWeekend
                  ? "bg-slate-50/40"
                  : "bg-white";

            return (
              <div
                key={key + "-" + idx}
                onClick={() => inMonth && empty && onAddOnDate(d)}
                className={`group relative min-h-[128px] p-2 flex flex-col gap-1.5 ${
                  !isLastCol ? "border-r" : ""
                } ${!isLastRow ? "border-b" : ""} border-slate-100 ${bg} ${
                  isToday ? "ring-1 ring-inset ring-accent-300" : ""
                } ${
                  inMonth && empty ? "cursor-pointer hover:bg-accent-50" : ""
                } transition-colors`}
              >
                {/* Date row — number + per-day count chip */}
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex items-center justify-center min-w-[26px] h-[26px] px-1.5 rounded-full text-[12px] font-bold tabular-nums leading-none ${
                      isToday
                        ? "bg-gradient-to-br from-accent-500 to-accent-600 text-white shadow-md ring-2 ring-accent-200"
                        : inMonth
                          ? isWeekend
                            ? "text-orange-600/80"
                            : "text-slate-700"
                          : "text-slate-300"
                    }`}
                  >
                    {d.getDate()}
                  </span>
                  {dprList.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-[9px] font-bold text-accent-700 bg-white border border-accent-200 rounded-full pl-1.5 pr-1.5 py-0.5 shadow-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent-500" aria-hidden />
                      {dprList.length}
                    </span>
                  )}
                </div>

                {/* Up to 2 DPR cards, then "+N more" */}
                <div className="space-y-1 flex-1">
                  {dprList.slice(0, 2).map((row) => {
                    const cfg = CAL_STATUS[row.status ?? "draft"] ?? CAL_STATUS.draft;
                    return (
                      <button
                        key={row.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(row);
                        }}
                        title={`${row.dprNumber ?? ""} — ${row.projectName ?? ""}`}
                        className={`relative w-full text-left rounded-md overflow-hidden border border-slate-200 ${cfg.body} hover:border-slate-300 hover:shadow-sm transition-all`}
                      >
                        {/* Status accent stripe */}
                        <span className={`absolute left-0 top-0 bottom-0 w-[3px] ${cfg.stripe}`} aria-hidden />
                        <div className="pl-2 pr-1.5 py-1">
                          <div className={`truncate text-[10px] font-bold ${cfg.text}`}>
                            {row.dprNumber ?? "DPR"}
                          </div>
                          <div className="truncate text-[9px] font-medium text-slate-600">
                            {row.projectName ?? ""}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  {dprList.length > 2 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        // Open the first hidden one — keeps the action useful
                        // without needing a popover. Users can re-click for
                        // each subsequent one (or use the table view to see all).
                        onOpen(dprList[2]);
                      }}
                      className="w-full text-left text-[10px] font-semibold text-accent-700 hover:bg-accent-50 rounded px-1.5 py-1 transition border border-dashed border-transparent hover:border-accent-200"
                    >
                      + {dprList.length - 2} more
                    </button>
                  )}
                </div>

                {/* Empty current-month cell — show a faint "+ Add" cue on hover */}
                {inMonth && empty && (
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-accent-700 bg-white border border-accent-200 rounded-full px-2 py-0.5 shadow-sm">
                      <Plus className="w-3 h-3" /> New DPR
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function KPICard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "indigo" | "green" | "amber" | "red";
}) {
  // All tones map to the unified construction-ERP semantic palette so
  // the four DPR KPI tiles read as one design system, not four colors.
  const toneClasses = {
    indigo: "bg-accent-50 text-accent-600 ring-accent-100",      // Primary metric → brand
    green:  "bg-emerald-50 text-emerald-600 ring-emerald-100",   // Success
    amber:  "bg-amber-50 text-amber-600 ring-amber-100",         // Warn / pending
    red:    "bg-rose-50 text-rose-600 ring-rose-100",            // Danger
  }[tone];
  const stripe = {
    indigo: "from-accent-400 to-accent-600",
    green:  "from-emerald-400 to-emerald-600",
    amber:  "from-sky-400 to-sky-600",
    red:    "from-rose-400 to-rose-600",
  }[tone];
  return (
    <div className="relative bg-white border border-slate-200 rounded-xl shadow-soft px-5 py-4 flex items-center gap-4 overflow-hidden">
      <span aria-hidden className={`absolute top-0 left-0 h-0.5 w-full bg-gradient-to-r ${stripe} opacity-80`} />
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ring-1 ${toneClasses}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
        <div className="text-xl font-bold text-slate-900 mt-0.5 tabular-nums">{value}</div>
      </div>
    </div>
  );
}

function DPRRow({
  row,
  isFreeScope,
  canEdit,
  canDelete,
  canSubmit,
  canApprove,
  onOpen,
  onEdit,
  onDelete,
  onSubmit,
  onApprove,
  onReject,
}: {
  row: DprRow;
  isFreeScope?: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSubmit: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const d = row.reportDate ? new Date(row.reportDate) : null;
  const day = d ? d.getDate().toString() : "—";
  const monthYear = d
    ? d.toLocaleDateString("en-GB", { month: "short", year: "numeric" })
    : "";

  const status = String(row.status ?? "draft").toLowerCase();
  const isDraft = status === "draft";
  const isSubmitted = status === "submitted" || status === "approved_l1";
  const isApproved = status === "approved";
  // Once approved, the DPR has posted to the BOQ ledger — silently editing
  // or deleting would desync the rollup. Lock both actions but keep them
  // visible (greyed) so the state is explicit.
  const baseLocked = isApproved;
  const lockReason = isApproved ? "Locked — DPR is approved" : "";

  const statusColor = STATUS_COLORS[row.status ?? "draft"] ?? STATUS_COLORS.draft;
  const itemCount = Number(row.workItemCount ?? 0);

  return (
    <tr className="border-t border-slate-100 hover:bg-accent-50 transition-colors">
      {/* Date calendar chip */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-lg bg-accent-50 border border-accent-200 flex flex-col items-center justify-center shrink-0">
            <div className="text-[9px] font-bold text-accent-600 uppercase leading-none">
              {d ? d.toLocaleDateString("en-GB", { month: "short" }) : ""}
            </div>
            <div className="text-sm font-bold text-accent-900 leading-none mt-0.5">
              {day}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">
              {row.dprNumber ?? "—"}
            </div>
            <div className="text-[11px] text-slate-500">{monthYear}</div>
          </div>
        </div>
      </td>

      {/* Project */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-slate-900">
          <Building2 className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-medium truncate">{row.projectName ?? "—"}</span>
          {isFreeScope && (
            <span className="shrink-0 whitespace-nowrap rounded bg-accent-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-accent-700 border border-accent-200">
              Free-Scope
            </span>
          )}
        </div>
        {row.workHalted && (
          <div className="mt-1">
            <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-200">
              <Ban className="w-2.5 h-2.5" /> Halted
            </span>
          </div>
        )}
      </td>

      {/* Items Reported */}
      <td className="px-4 py-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded bg-accent-50 text-accent-700 border border-accent-200">
          <FileText className="w-3 h-3" />
          {itemCount} {itemCount === 1 ? "Activity" : "Activities"}
        </span>
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <span
          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${statusColor}`}
        >
          {(row.status ?? "draft").replace(/_/g, " ")}
        </span>
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1 flex-wrap">
          {canEdit && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (baseLocked) return;
                onEdit();
              }}
              disabled={baseLocked}
              className={`p-1.5 rounded-lg transition-colors ${
                baseLocked
                  ? "text-slate-300 cursor-not-allowed"
                  : "text-slate-500 hover:bg-accent-50 hover:text-accent-700"
              }`}
              title={baseLocked ? lockReason : "Edit"}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (baseLocked) return;
                onDelete();
              }}
              disabled={baseLocked}
              className={`p-1.5 rounded-lg transition-colors ${
                baseLocked
                  ? "text-slate-300 cursor-not-allowed"
                  : "text-slate-500 hover:bg-rose-50 hover:text-rose-600"
              }`}
              title={baseLocked ? lockReason : "Delete"}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Workflow actions — filled pills so they stand out from the
              base icon buttons; mirrors the Work Order UX. */}
          {isDraft && canSubmit && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSubmit();
              }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-orange-700 bg-orange-50 border border-orange-200 hover:bg-orange-100 transition"
              title="Submit for approval"
            >
              <Send className="w-3 h-3" /> Submit
            </button>
          )}
          {isSubmitted && canApprove && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onApprove();
                }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition"
                title="Approve"
              >
                <Check className="w-3 h-3" /> Approve
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onReject();
                }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition"
                title="Reject"
              >
                <XIcon className="w-3 h-3" /> Reject
              </button>
            </>
          )}
          {isSubmitted && !canApprove && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200">
              Awaiting approver
            </span>
          )}
          {isApproved && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200"
              title={lockReason}
            >
              <Check className="w-3 h-3" /> Locked
            </span>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              window.open(`/api/projects/dpr/${row.id}/pdf`, "_blank", "noopener");
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-accent-700 hover:bg-accent-50 transition-colors"
            title="View PDF"
          >
            <FileText className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onOpen}
            className="p-1.5 rounded-lg text-slate-400 hover:text-accent-700 hover:bg-accent-50 transition-colors"
            title="Open"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}
