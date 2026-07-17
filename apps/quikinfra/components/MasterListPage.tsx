"use client";

/**
 * MasterListPage — Reusable list page for all master data entities.
 * Now uses the Superadmin DataTable with sorting, filtering, pagination,
 * column toggle, group-by, and audit columns.
 */

import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Plus, Download, Upload, Trash2, Pencil, RotateCcw } from "lucide-react";
import { PageHeader, PageContainer, PrimaryButton, SecondaryButton, EmptyState } from "./PageShell";
import { DataTable, type ColDef } from "./DataTable";
import { useServerList } from "@/hooks/use-server-list";
import { exportCSV } from "./QuickCreateDrawer";
import { ConfirmDialog } from "./ConfirmDialog";
import { TableShimmer } from "./Shimmer";
import { toast } from "@/lib/toast";
import { useMenuActions } from "@/hooks/use-permissions";

// ─── Types ──────────────────────────────────────────────────────────

export interface MasterColumnDef<T> {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "status" | "boolean" | "select";
  width?: string;
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;
  getValue?: (row: T) => string | number;
  options?: string[];
}

export interface MasterListPageProps<T extends { id: string; status?: string }> {
  title: string;
  subtitle?: string;
  entityName: string;
  breadcrumbs?: Array<{ label: string; href?: string }>;
  columns: MasterColumnDef<T>[];
  /**
   * Full client-side dataset. Required for the classic (default) mode.
   * In {@link infinite} mode this is ignored — rows come from the server
   * one page at a time — so callers may omit it.
   */
  data?: T[];
  total?: number;
  isLoading?: boolean;
  /**
   * Opt into server-side pagination. When set, the page stops loading the
   * whole table: MasterListPage drives `useServerList` (search, sort, the
   * status tabs, and page/pageSize all become server query params) and the
   * DataTable shows a server-driven numbered pager. Leave undefined for the
   * classic client-paged behavior.
   */
  infinite?: {
    /** Stable React Query key prefix, e.g. "items-infinite". */
    queryKey: string;
    /** List endpoint, e.g. "/api/masters/items". */
    endpoint: string;
    /** Rows per request (default 50). */
    pageSize?: number;
    /** Extra static server filters (groupId, projectId, …). */
    filters?: Record<string, string | undefined>;
    /** Initial sort column / direction. */
    defaultSortBy?: string;
    defaultSortOrder?: "asc" | "desc";
  };
  /**
   * Called (in infinite mode) whenever the accumulated loaded rows change,
   * so a page can run side-effects over the visible set — e.g. Items fetches
   * per-row stock for exactly the rows on screen.
   */
  onRowsChange?: (rows: T[]) => void;
  onAdd?: () => void;
  onEdit?: (item: T) => void;
  /**
   * Delete handler. When provided, a Delete button is rendered next to
   * Edit in the actions column. Clicking Delete opens a confirm modal
   * (handled here, not by the page) and only calls this callback AFTER
   * the user confirms. The callback should actually delete the row —
   * fire a delete mutation and return the promise so the modal can
   * show its loading state and close automatically on success.
   */
  onDelete?: (item: T) => void | Promise<void>;
  /**
   * Direct re-activate handler for soft-deleted rows. When provided,
   * the Restore button (shown on inactive rows) calls this instead of
   * opening the edit drawer — useful for entities whose form no longer
   * exposes a Status field.
   */
  onRestore?: (item: T) => void | Promise<void>;
  /** Title shown at the top of the delete confirm modal. Defaults to "Delete {entityName}". */
  deleteConfirmTitle?: string;
  /**
   * Builds the confirm message per row. Receives the item so the message
   * can name it specifically (e.g. "Delete department 'Engineering'?").
   */
  deleteConfirmMessage?: (item: T) => ReactNode;
  onToggleStatus?: (item: T) => void;
  onImport?: () => void;
  onExport?: () => void;
  canCreate?: boolean;
  canImport?: boolean;
  canExport?: boolean;
  emptyIcon?: React.ReactNode;
  emptyDescription?: string;
  filters?: React.ReactNode;
  /**
   * Opt-in Active / Inactive / All tab switcher above the table. Off by
   * default — master pages just hide inactive rows. Used by the Users
   * page where the admin needs to find and re-activate disabled accounts.
   */
  showStatusTabs?: boolean;
  /**
   * When true, MasterListPage does NOT apply any status filtering — it renders
   * exactly the rows passed in `data`. Use this when the page provides its own
   * status filter UI (e.g. Vendors: All / Active / Inactive / Blacklisted) and
   * needs inactive rows to be selectable. Mutually exclusive with showStatusTabs.
   */
  externalStatusFilter?: boolean;
  /**
   * Entity type used to fetch real change-history from /api/history
   * for the per-row Approval Timeline drawer. When set, the drawer
   * shows merged audit log + approval history + the master row's own
   * createdAt/createdBy/updatedAt/updatedBy events.
   */
  historyEntityType?: string;
  /**
   * Sidebar URL of this page (e.g. "/masters/companies"). When set, the
   * shell consults the current user's permission matrix and silently
   * suppresses Add / Edit / Delete affordances the user is not granted.
   * Server-side route guards remain the authoritative check — this is
   * UX-only. Omit on pages not in the menu catalog.
   */
  permissionUrl?: string;
}

// ─── Status badge ───────────────────────────────────────────────────
// Default renderer for `type: "status"` columns. Semantic (not themeable)
// colors — active = green, inactive = grey, blacklisted = red, anything
// else = amber. Raw value stays lowercase for sort/filter; only the label
// is title-cased ("active" → "Active").
const STATUS_BADGE_STYLES: Record<string, { pill: string; dot: string }> = {
  active: { pill: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500" },
  inactive: { pill: "bg-slate-100 text-slate-500 ring-slate-200", dot: "bg-slate-400" },
  blacklisted: { pill: "bg-rose-50 text-rose-700 ring-rose-200", dot: "bg-rose-500" },
};
const DEFAULT_STATUS_STYLE = { pill: "bg-amber-50 text-amber-700 ring-amber-200", dot: "bg-amber-500" };

function titleCase(s: string): string {
  return s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function StatusBadge({ value }: { value: string }) {
  const key = value.trim().toLowerCase();
  if (!key) return <span className="text-slate-400">—</span>;
  const { pill, dot } = STATUS_BADGE_STYLES[key] ?? DEFAULT_STATUS_STYLE;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${pill}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {titleCase(value)}
    </span>
  );
}

// ─── Component ──────────────────────────────────────────────────────

export function MasterListPage<T extends { id: string; status?: string }>({
  title, subtitle, entityName, breadcrumbs, columns,
  data: dataProp, total: totalProp, isLoading: isLoadingProp,
  infinite, onRowsChange,
  onAdd, onEdit, onDelete, onRestore, deleteConfirmTitle, deleteConfirmMessage,
  onImport, onExport,
  canCreate = true, canImport = false, canExport = false,
  emptyIcon, emptyDescription,
  filters,
  showStatusTabs = false,
  externalStatusFilter = false,
  historyEntityType,
  permissionUrl,
}: MasterListPageProps<T>) {
  // ── Server-driven (infinite) state ──────────────────────────────────
  // Search + sort are emitted by the DataTable in infinite mode; status
  // comes from the tabs below. All three become server query params.
  const [serverSearch, setServerSearch] = useState("");
  const [serverSort, setServerSort] = useState<{ by?: string; order?: "asc" | "desc" }>({
    by: infinite?.defaultSortBy,
    order: infinite?.defaultSortOrder,
  });
  // Permission matrix gating: if the caller supplied a `permissionUrl`,
  // we silently drop the action callbacks the user isn't granted so the
  // shell never even renders the buttons.
  const { canAdd: matrixCanAdd, canEdit: matrixCanEdit, canDelete: matrixCanDelete } =
    useMenuActions(permissionUrl);
  const effectiveCanCreate = permissionUrl ? canCreate && matrixCanAdd : canCreate;
  const effectiveOnEdit = permissionUrl ? (matrixCanEdit ? onEdit : undefined) : onEdit;
  const effectiveOnDelete = permissionUrl ? (matrixCanDelete ? onDelete : undefined) : onDelete;
  const effectiveOnRestore = permissionUrl ? (matrixCanEdit ? onRestore : undefined) : onRestore;
  const effectiveOnAdd = effectiveCanCreate ? onAdd : undefined;
  // Delete confirm modal state — lives here so every master page gets
  // the same modal UX for free.
  const [deleteTarget, setDeleteTarget] = useState<T | null>(null);
  const [deletingInFlight, setDeletingInFlight] = useState(false);

  // Soft delete = flip status to "inactive". By default the list hides
  // inactive rows so the admin sees the row disappear after delete
  // (matches typical admin-UX expectations). Toggling "Show inactive"
  // flips to the deactivated-only view so the admin can find a row to
  // restore via Edit. There's also an "All" mode that mixes both.
  const [statusView, setStatusView] = useState<"active" | "inactive" | "all">(
    "active",
  );

  // Map the status view to the server `status` param (infinite mode only).
  //   active   → "active"   (backend hides inactive)
  //   inactive → "inactive" · all → "all"
  // Pages with their own filter UI (externalStatusFilter, e.g. Vendors) send
  // status through infinite.filters instead, so we emit nothing here.
  const serverStatus: string | undefined =
    !infinite || externalStatusFilter
      ? undefined
      : !showStatusTabs
        ? "active"
        : statusView === "inactive"
          ? "inactive"
          : statusView === "all"
            ? "all"
            : "active";

  const srv = useServerList<T>(
    infinite?.queryKey ?? "__ml_disabled__",
    infinite?.endpoint ?? "",
    {
      search: serverSearch,
      sortBy: serverSort.by,
      sortOrder: serverSort.order,
      initialPageSize: infinite?.pageSize,
      filters: { ...(infinite?.filters ?? {}), ...(serverStatus ? { status: serverStatus } : {}) },
    },
    { enabled: !!infinite },
  );

  // Effective data source: server page (server-driven) or the client dataset.
  const data: T[] = infinite ? srv.items : (dataProp ?? []);
  const total = infinite ? srv.total : (totalProp ?? 0);
  const isLoading = infinite ? srv.isLoading : isLoadingProp;

  // Let the page react to the loaded rows (e.g. Items fetches per-row stock).
  useEffect(() => {
    if (infinite && onRowsChange) onRowsChange(srv.items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [infinite, onRowsChange, srv.items]);

  const inactiveCount = useMemo(
    () => data.filter((r) => (r as { status?: string })?.status === "inactive").length,
    [data],
  );
  const visibleData = useMemo(
    () => {
      // Infinite mode: the server already applied the status filter.
      if (infinite) return data;
      // Page owns the status filter (e.g. Vendors) — render data verbatim.
      if (externalStatusFilter) return data;
      if (!showStatusTabs) {
        return data.filter((r) => (r as { status?: string })?.status !== "inactive");
      }
      if (statusView === "all") return data;
      if (statusView === "inactive") {
        return data.filter((r) => (r as { status?: string })?.status === "inactive");
      }
      return data.filter((r) => (r as { status?: string })?.status !== "inactive");
    },
    [data, statusView, showStatusTabs, externalStatusFilter, infinite],
  );

  // Export always reflects the live master list — soft-deleted (inactive)
  // rows never belong in an export file, even when the user is currently
  // viewing the Inactive / All tab. Independent of `visibleData` so the
  // on-screen view and the export can diverge intentionally.
  const exportableData = useMemo(
    () => data.filter((r) => (r as { status?: string })?.status !== "inactive"),
    [data],
  );

  const requestDelete = useCallback((row: T) => setDeleteTarget(row), []);
  const cancelDelete = () => {
    if (deletingInFlight) return; // prevent race: user can't cancel mid-flight
    setDeleteTarget(null);
  };
  const confirmDelete = async () => {
    if (!deleteTarget || !effectiveOnDelete) return;
    setDeletingInFlight(true);
    try {
      await effectiveOnDelete(deleteTarget);
      setDeleteTarget(null);
    } catch (err: unknown) {
      toast.error(toErrorMessage(err, "Failed to delete"));
    } finally {
      setDeletingInFlight(false);
    }
  };
  const defaultBreadcrumbs = breadcrumbs ?? [
    { label: "Masters", href: "/masters" },
    { label: title },
  ];

  // Status filter options auto-adapt per module: always offer the
  // universal active / inactive, plus any other status that actually
  // occurs in this module's data (e.g. "blacklisted" for vendors). This
  // avoids surfacing workflow statuses (draft, pending_approval, approved,
  // rejected) that master records never use.
  const statusOptions = useCallback(
    (col: MasterColumnDef<T>): string[] => {
      const base = ["active", "inactive"];
      const extras = new Set<string>();
      for (const row of data) {
        const v = col.getValue ? col.getValue(row) : (row as Record<string, unknown>)[col.key];
        const s = v == null ? "" : String(v).trim();
        if (s && !base.includes(s)) extras.add(s);
      }
      return [...base, ...Array.from(extras).sort()];
    },
    [data],
  );

  // Convert MasterColumnDef → DataTable ColDef
  const dtColumns = useMemo<ColDef<T>[]>(() => {
    return columns.map(col => ({
      key: col.key,
      label: col.label,
      type: col.type === "status" ? ("select" as const) : (col.type ?? "text"),
      width: col.width,
      sortable: col.sortable ?? true,
      searchable: true,
      hideable: true,
      freezable: true,
      options: col.type === "status" ? (col.options ?? statusOptions(col)) : col.options,
      render: col.render
        ? (row: T) => col.render!(row)
        : col.type === "status"
          ? (row: T) => (
              <StatusBadge value={String((row as Record<string, unknown>)[col.key] ?? "")} />
            )
          : undefined,
      getValue: col.getValue ? (row: T) => col.getValue!(row) as string : undefined,
    }));
  }, [columns, statusOptions]);

  // Add Edit + Delete action column.
  // Note: the Delete button opens MasterListPage's internal confirm modal
  // via `requestDelete` — it does NOT directly call the page's onDelete
  // callback. The page's onDelete only fires after the user confirms.
  const allColumns = useMemo<ColDef<T>[]>(() => {
    if (!effectiveOnEdit && !effectiveOnDelete) return dtColumns;
    return [
      ...dtColumns,
      {
        key: "__actions",
        label: "Actions",
        width: effectiveOnDelete ? "130px" : "80px",
        sortable: false,
        searchable: false,
        hideable: false,
        freezable: false,
        render: (row: T) => {
          // Already-deleted rows: only show Restore (so user can re-activate
          // by flipping status). No Delete button — it's already gone.
          // Restore prefers `onRestore` (direct status flip, no drawer)
          // when provided, falling back to `onEdit` so forms that still
          // expose a Status field keep working.
          const isInactive = (row as { status?: string })?.status === "inactive";
          const showEdit = !!effectiveOnEdit && !isInactive;
          const showRestore = (!!effectiveOnRestore || !!effectiveOnEdit) && isInactive;
          const showDelete = !!effectiveOnDelete && !isInactive;
          const showSeparator = (showEdit || showRestore) && showDelete;
          return (
            <div className="inline-flex items-center gap-0.5 rounded-xl p-0.5">
              {showEdit && (
                <button
                  onClick={(e) => { e.stopPropagation(); effectiveOnEdit!(row); }}
                  className="group/btn relative w-7 h-7 flex items-center justify-center rounded-lg bg-gradient-to-br from-amber-50 to-orange-100 text-orange-600 ring-1 ring-inset ring-orange-200/50 hover:from-amber-100 hover:to-orange-200 hover:text-orange-700 hover:ring-orange-300 hover:shadow-[0_0_0_3px_rgba(251,146,60,0.15)] active:scale-95 transition-all duration-200"
                  title="Edit"
                >
                  <span className="absolute inset-0 rounded-lg bg-white/30 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                  <Pencil className="w-3.5 h-3.5 relative z-10 transition-transform duration-300 group-hover/btn:rotate-[-8deg]" />
                </button>
              )}
              {showRestore && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (effectiveOnRestore) effectiveOnRestore(row);
                    else if (effectiveOnEdit) effectiveOnEdit(row);
                  }}
                  className="group/btn relative w-7 h-7 flex items-center justify-center rounded-lg bg-gradient-to-br from-emerald-50 to-teal-100 text-emerald-600 ring-1 ring-inset ring-emerald-200/50 hover:from-emerald-100 hover:to-teal-200 hover:text-emerald-700 hover:ring-emerald-300 hover:shadow-[0_0_0_3px_rgba(16,185,129,0.15)] active:scale-95 transition-all duration-200"
                  title="Restore"
                >
                  <RotateCcw className="w-3.5 h-3.5 relative z-10 transition-transform duration-500 group-hover/btn:-rotate-180" />
                </button>
              )}
              {showSeparator && (
                <span className="w-px h-4 bg-gradient-to-b from-transparent via-slate-200 to-transparent" />
              )}
              {showDelete && (
                <button
                  onClick={(e) => { e.stopPropagation(); requestDelete(row); }}
                  className="group/btn relative w-7 h-7 flex items-center justify-center rounded-lg bg-gradient-to-br from-rose-50 to-red-100 text-rose-600 ring-1 ring-inset ring-rose-200/50 hover:from-rose-100 hover:to-red-200 hover:text-rose-700 hover:ring-rose-300 hover:shadow-[0_0_0_3px_rgba(244,63,94,0.15)] active:scale-95 transition-all duration-200"
                  title="Soft delete — the row is hidden from the list but can be restored later"
                >
                  <span className="absolute inset-0 rounded-lg bg-white/30 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                  <Trash2 className="w-3.5 h-3.5 relative z-10 transition-transform duration-200 group-hover/btn:scale-110" />
                </button>
              )}
              {isInactive && (
                <span className="text-[10px] text-slate-400 italic px-1.5">deleted</span>
              )}
            </div>
          );
        },
      },
    ];
  }, [dtColumns, effectiveOnEdit, effectiveOnDelete, effectiveOnRestore, requestDelete]);

  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle ?? `Manage ${entityName.toLowerCase()} master data`}
        breadcrumbs={defaultBreadcrumbs}
        actions={
          <div className="flex items-center gap-2">
            {canImport && (
              <SecondaryButton onClick={onImport ?? (() => toast.info("Prepare a CSV file with matching columns and upload."))}>
                <Upload className="w-4 h-4" /> Import
              </SecondaryButton>
            )}
            {canExport && (
              <SecondaryButton onClick={onExport ?? (() => exportCSV(exportableData, entityName.toLowerCase().replace(/\s+/g, "-")))}>
                <Download className="w-4 h-4" /> Export
              </SecondaryButton>
            )}
          </div>
        }
      />

      <PageContainer>
        {/* Status-view switcher — Active | Inactive | All. Opt-in via
            `showStatusTabs` so the default master pages keep the
            previous behavior of just hiding inactive rows. The Users
            page enables this so admins can find disabled accounts. */}
        {showStatusTabs && (effectiveOnDelete || effectiveOnRestore || effectiveOnEdit) ? (
          <div className="mb-3 inline-flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            {(
              [
                { key: "active", label: "Active" },
                // In infinite mode `data` is only the loaded pages, so the
                // client-side inactive count would be wrong — omit it.
                { key: "inactive", label: infinite ? "Inactive" : `Inactive · ${inactiveCount}` },
                { key: "all", label: "All" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatusView(tab.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  statusView === tab.key
                    ? "bg-white text-orange-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        ) : null}
        {filters ? (
          <div className="mb-3">
            {filters}
          </div>
        ) : null}
        {(isLoading && visibleData.length === 0) ? (
          <TableShimmer rows={8} columns={Math.min(Math.max(columns.length, 3), 8)} />
        ) : (!infinite && !isLoading && visibleData.length === 0) ? (
          // Classic mode "nothing here yet" state. In infinite mode the
          // DataTable owns the empty state so the search box stays visible
          // (a search with no matches should not read as an empty master).
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm py-16">
            <EmptyState
              title={`No ${entityName.toLowerCase()}s yet`}
              description={emptyDescription ?? `Click "Add ${entityName}" to create your first record.`}
              icon={emptyIcon}
              action={effectiveOnAdd ? (
                <PrimaryButton onClick={effectiveOnAdd}>
                  <Plus className="w-4 h-4" /> Add {entityName}
                </PrimaryButton>
              ) : undefined}
            />
          </div>
        ) : (
          <DataTable<T>
            id={`master-${entityName.toLowerCase().replace(/\s+/g, "-")}`}
            columns={allColumns}
            data={visibleData}
            onAdd={effectiveOnAdd}
            addLabel={`Add ${entityName}`}
            historyEntityType={historyEntityType}
            loading={infinite ? !!isLoading : undefined}
            serverMode={!!infinite}
            serverTotal={infinite ? total : undefined}
            serverPage={infinite ? srv.page : undefined}
            serverPageSize={infinite ? srv.pageSize : undefined}
            onPageChange={infinite ? srv.setPage : undefined}
            onPageSizeChange={infinite ? srv.setPageSize : undefined}
            onSearchChange={infinite ? setServerSearch : undefined}
            onSortChange={infinite ? (k, d) => setServerSort({ by: k, order: d }) : undefined}
          />
        )}
      </PageContainer>

      {/* Delete confirm modal — the page's onDelete fires only after the
          user clicks Delete in this dialog. */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={cancelDelete}
        onConfirm={confirmDelete}
        loading={deletingInFlight}
        tone="danger"
        title={deleteConfirmTitle ?? `Delete ${entityName}`}
        confirmLabel="Delete"
        message={
          deleteTarget && deleteConfirmMessage
            ? deleteConfirmMessage(deleteTarget)
            : (
                <>
                  Mark this {entityName.toLowerCase()} as inactive? It will stay
                  in the list with status “inactive” and can be re-activated
                  later via Edit.
                </>
              )
        }
      />
    </>
  );
}
