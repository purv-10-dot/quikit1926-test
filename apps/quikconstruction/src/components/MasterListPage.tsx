"use client";

/**
 * MasterListPage — Reusable list page for all master data entities.
 * Now uses the Superadmin DataTable with sorting, filtering, pagination,
 * column toggle, group-by, and audit columns.
 */

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Plus, Download, Upload, Trash2 } from "lucide-react";
import { PageHeader, PageContainer, PrimaryButton, SecondaryButton, EmptyState } from "./PageShell";
import { DataTable, type ColDef } from "./DataTable";
import { exportCSV } from "./QuickCreateDrawer";
import { ConfirmDialog } from "./ConfirmDialog";
import { TableShimmer } from "./Shimmer";

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
  data: T[];
  total: number;
  isLoading?: boolean;
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
   * Per-row gate for the Delete button. Return `false` to hide Delete on
   * that row (e.g. protected accounts like SUPER_ADMIN). Only consulted
   * when `onDelete` is also provided. Defaults to allowing delete on
   * every row.
   */
  canDelete?: (item: T) => boolean;
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
}

// ─── Component ──────────────────────────────────────────────────────

export function MasterListPage<T extends { id: string; status?: string }>({
  title, subtitle, entityName, breadcrumbs, columns, data, total, isLoading,
  onAdd, onEdit, onDelete, canDelete, deleteConfirmTitle, deleteConfirmMessage,
  onImport, onExport,
  canCreate = true, canImport = false, canExport = false,
  emptyIcon, emptyDescription,
}: MasterListPageProps<T>) {
  // Delete confirm modal state — lives here so every master page gets
  // the same modal UX for free.
  const [deleteTarget, setDeleteTarget] = useState<T | null>(null);
  const [deletingInFlight, setDeletingInFlight] = useState(false);

  // Soft delete = flip status to "inactive". Inactive rows are hidden from
  // the table so the user sees the row disappear immediately after delete,
  // matching typical admin-UX expectations. Restoration flows (for rows
  // that need to come back) can re-set status to "active" via the API,
  // but they won't appear in this list until they do.
  const visibleData = useMemo(
    () => data.filter(r => (r as any)?.status !== "inactive"),
    [data],
  );

  const requestDelete = useCallback((row: T) => setDeleteTarget(row), []);
  const cancelDelete = () => {
    if (deletingInFlight) return; // prevent race: user can't cancel mid-flight
    setDeleteTarget(null);
  };
  const confirmDelete = async () => {
    if (!deleteTarget || !onDelete) return;
    setDeletingInFlight(true);
    try {
      await onDelete(deleteTarget);
      setDeleteTarget(null);
    } catch (err: any) {
      alert(err?.message ?? "Failed to delete");
    } finally {
      setDeletingInFlight(false);
    }
  };
  const defaultBreadcrumbs = breadcrumbs ?? [
    { label: "Masters", href: "/masters" },
    { label: title },
  ];

  // Convert MasterColumnDef → DataTable ColDef
  const dtColumns = useMemo<ColDef<T>[]>(() => {
    return columns.map(col => ({
      key: col.key,
      label: col.label,
      type: col.type === "status" ? "select" as const : (col.type as any) ?? "text",
      width: col.width,
      sortable: col.sortable ?? true,
      searchable: true,
      hideable: true,
      freezable: true,
      options: col.type === "status" ? ["active", "inactive", "draft", "pending_approval", "approved", "rejected"] : col.options,
      render: col.render ? (row: T) => col.render!(row) : undefined,
      getValue: col.getValue ? (row: T) => col.getValue!(row) as string : undefined,
    }));
  }, [columns]);

  // Add Edit + Delete action column.
  // Note: the Delete button opens MasterListPage's internal confirm modal
  // via `requestDelete` — it does NOT directly call the page's onDelete
  // callback. The page's onDelete only fires after the user confirms.
  const allColumns = useMemo<ColDef<T>[]>(() => {
    if (!onEdit && !onDelete) return dtColumns;
    return [
      ...dtColumns,
      {
        key: "__actions",
        label: "Actions",
        width: onDelete ? "130px" : "80px",
        sortable: false,
        searchable: false,
        hideable: false,
        freezable: false,
        render: (row: T) => {
          // Already-deleted rows: only show Edit (so user can re-activate
          // by flipping status). No Delete button — it's already gone.
          const isInactive = (row as any)?.status === "inactive";
          const deletable = onDelete && !isInactive && (canDelete ? canDelete(row) : true);
          return (
            <div className="flex items-center gap-1.5">
              {onEdit && (
                <button
                  onClick={(e) => { e.stopPropagation(); onEdit(row); }}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-slate-700 hover:text-orange-700 hover:bg-orange-50 transition-colors"
                >
                  {isInactive ? "Restore" : "Edit"}
                </button>
              )}
              {deletable && (
                <button
                  onClick={(e) => { e.stopPropagation(); requestDelete(row); }}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                  title="Soft delete — the row is hidden from the list but can be restored later"
                >
                  <Trash2 className="w-3 h-3" /> Delete
                </button>
              )}
              {isInactive && (
                <span className="text-[10px] text-slate-400 italic">deleted</span>
              )}
            </div>
          );
        },
      },
    ];
  }, [dtColumns, onEdit, onDelete, canDelete, requestDelete]);

  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle ?? `Manage ${entityName.toLowerCase()} master data`}
        breadcrumbs={defaultBreadcrumbs}
        actions={
          <div className="flex items-center gap-2">
            {canImport && (
              <SecondaryButton onClick={onImport ?? (() => alert("Prepare a CSV file with matching columns and upload."))}>
                <Upload className="w-4 h-4" /> Import
              </SecondaryButton>
            )}
            {canExport && (
              <SecondaryButton onClick={onExport ?? (() => exportCSV(visibleData, entityName.toLowerCase().replace(/\s+/g, "-")))}>
                <Download className="w-4 h-4" /> Export
              </SecondaryButton>
            )}
          </div>
        }
      />

      <PageContainer>
        <div className="table-enter">
          {isLoading ? (
            <TableShimmer rows={8} columns={Math.min(Math.max(columns.length, 3), 8)} />
          ) : visibleData.length === 0 ? (
            <div className="relative bg-gradient-to-br from-white to-orange-50/30 rounded-xl border border-dashed border-orange-200 shadow-soft py-16 overflow-hidden">
              {/* corner glow accents — purely decorative, soft enough not to
                  compete with the empty-state CTA. */}
              <span aria-hidden className="pointer-events-none absolute -top-16 -left-16 w-48 h-48 rounded-full bg-orange-100/40 blur-3xl" />
              <span aria-hidden className="pointer-events-none absolute -bottom-20 -right-12 w-56 h-56 rounded-full bg-amber-100/40 blur-3xl" />
              <div className="relative">
                <EmptyState
                  title={`No ${entityName.toLowerCase()}s yet`}
                  description={emptyDescription ?? `Click "Add ${entityName}" to create your first record.`}
                  icon={emptyIcon}
                  action={canCreate && onAdd ? (
                    <PrimaryButton onClick={onAdd}>
                      <Plus className="w-4 h-4" /> Add {entityName}
                    </PrimaryButton>
                  ) : undefined}
                />
              </div>
            </div>
          ) : (
            <DataTable<T>
              id={`master-${entityName.toLowerCase().replace(/\s+/g, "-")}`}
              columns={allColumns}
              data={visibleData}
              onAdd={canCreate ? onAdd : undefined}
              addLabel={`Add ${entityName}`}
            />
          )}
        </div>
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
