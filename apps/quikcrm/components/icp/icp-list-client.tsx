"use client";

/**
 * ICP list — mirrors components/quotes/price-lists-list-client.tsx: plain
 * fetch + useState + useCallback load(), 300 ms debounced search, Select
 * filters, StatsBar, in-table loading/empty rows, Trash tab, and useConfirm +
 * useToast for row actions. No react-query, so the loading/empty behaviour is
 * identical to the other master pages.
 */

import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { Plus, RotateCcw, Search, Trash2, X, Pencil } from "lucide-react";
import { TrashBanner, useConfirm } from "@quikit/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableScroll, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Pagination } from "@/components/shared/pagination";
import { StatsBar } from "@/components/shared/stats-bar";
import { useToast } from "@/hooks/use-toast";
import { IcpFormModal } from "@/components/icp/icp-form-modal";
import { IcpTaxonomyModal } from "@/components/icp/icp-taxonomy-modal";

type Tab = "all" | "trash";

export interface IcpStats {
  total: number;
  active: number;
  taxonomyTotal: number;
}

export interface IcpRow {
  id: string;
  name: string;
  description: string | null;
  segment: "Enterprise" | "MidMarket" | "SMB" | null;
  employeeCountMin: number | null;
  employeeCountMax: number | null;
  annualRevenueMin: string | null;
  annualRevenueMax: string | null;
  revenueCurrency: string | null;
  countryCodes: string[];
  regions: string[];
  isActive: boolean;
  deletedAt: string | null;
  updatedAt: string;
  taxonomyCount: number;
  productCount: number;
  accountCount: number;
}

const SEGMENT_LABEL: Record<string, string> = {
  Enterprise: "Enterprise",
  MidMarket: "Mid-Market",
  SMB: "SMB",
};

/** "50–200" / "50+" / "up to 200" / "—" — honest about open-ended ranges. */
function rangeLabel(min: number | null, max: number | null): string {
  if (min == null && max == null) return "—";
  if (min != null && max == null) return `${min.toLocaleString("en-IN")}+`;
  if (min == null && max != null) return `up to ${max.toLocaleString("en-IN")}`;
  return `${min!.toLocaleString("en-IN")}–${max!.toLocaleString("en-IN")}`;
}

function revenueLabel(row: IcpRow): string {
  const cur = row.revenueCurrency ?? "INR";
  const min = row.annualRevenueMin != null ? Number(row.annualRevenueMin) : null;
  const max = row.annualRevenueMax != null ? Number(row.annualRevenueMax) : null;
  if (min == null && max == null) return "—";
  const fmt = (n: number) =>
    n >= 1_00_00_000
      ? `${(n / 1_00_00_000).toFixed(2).replace(/\.00$/, "")}Cr`
      : n >= 1_00_000
        ? `${(n / 1_00_000).toFixed(2).replace(/\.00$/, "")}L`
        : n.toLocaleString("en-IN");
  if (min != null && max == null) return `${cur} ${fmt(min)}+`;
  if (min == null && max != null) return `${cur} up to ${fmt(max)}`;
  return `${cur} ${fmt(min!)}–${fmt(max!)}`;
}

export function IcpListClient({
  initialStats,
  canCreate = false,
  canEdit = false,
  canDelete = false,
}: {
  initialStats?: IcpStats;
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}) {
  const toast = useToast();
  const confirm = useConfirm();

  const [tab, setTab] = useState<Tab>("all");
  const viewTrash = tab === "trash";
  const [items, setItems] = useState<IcpRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<IcpRow | null>(null);
  const [managingTaxonomy, setManagingTaxonomy] = useState(false);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [filterSegment, setFilterSegment] = useState("");
  const [filterActive, setFilterActive] = useState("");
  // "Has any linked Industry / Vertical / Technology" — narrows to profiles whose
  // fit is defined along that dimension. Backed by the API's `kind` param.
  const [filterKind, setFilterKind] = useState("");
  const [sortBy, setSortBy] = useState<"updatedAt" | "createdAt" | "name">("updatedAt");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sortBy,
        sortDir: sortBy === "name" ? "asc" : "desc",
      });
      if (viewTrash) params.set("trashed", "true");
      if (debouncedSearch) params.set("q", debouncedSearch);
      if (filterSegment) params.set("segment", filterSegment);
      if (filterActive) params.set("isActive", filterActive);
      if (filterKind) params.set("kind", filterKind);

      const res = await fetch(`/api/icp?${params.toString()}`, { credentials: "include" });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error ?? "Failed to load");
      setItems(body.data.items);
      setTotal(body.data.total ?? body.data.items.length);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load ICP profiles");
    } finally {
      setLoading(false);
    }
  }, [viewTrash, page, pageSize, debouncedSearch, filterSegment, filterActive, filterKind, sortBy]);

  useEffect(() => {
    void load();
  }, [load]);

  // Any filter change invalidates the current page offset.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filterSegment, filterActive, filterKind, viewTrash, sortBy]);

  const onSoftDelete = useCallback(
    async (row: IcpRow) => {
      if (!canDelete) return;
      const ok = await confirm({
        title: "Move to Trash?",
        description: `"${row.name}" will be moved to Trash. You can restore it later.`,
        confirmLabel: "Move to Trash",
        cancelLabel: "Cancel",
        tone: "warning",
      });
      if (!ok) return;
      try {
        const res = await fetch(`/api/icp/${row.id}`, { method: "DELETE", credentials: "include" });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !(j as { success?: boolean }).success) {
          throw new Error((j as { error?: string }).error || "Delete failed");
        }
        toast.success("ICP profile moved to Trash");
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Delete failed");
      }
    },
    [canDelete, confirm, load, toast],
  );

  const onRestore = useCallback(
    async (row: IcpRow) => {
      try {
        const res = await fetch(`/api/icp/${row.id}/restore`, {
          method: "POST",
          credentials: "include",
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !(j as { success?: boolean }).success) {
          throw new Error((j as { error?: string }).error || "Restore failed");
        }
        toast.success("ICP profile restored");
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Restore failed");
      }
    },
    [load, toast],
  );

  const onPermanentDelete = useCallback(
    async (row: IcpRow) => {
      if (!canDelete) return;
      const ok = await confirm({
        title: "Delete permanently?",
        description: `"${row.name}" and all of its links will be deleted for good. This cannot be undone.`,
        confirmLabel: "Delete permanently",
        cancelLabel: "Cancel",
        tone: "danger",
      });
      if (!ok) return;
      try {
        const res = await fetch(`/api/icp/${row.id}?permanent=true`, {
          method: "DELETE",
          credentials: "include",
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !(j as { success?: boolean }).success) {
          throw new Error((j as { error?: string }).error || "Delete failed");
        }
        toast.success("ICP profile deleted");
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Delete failed");
      }
    },
    [canDelete, confirm, load, toast],
  );

  const tabs: Array<{ key: Tab; label: string }> = canDelete
    ? [
        { key: "all", label: "All" },
        { key: "trash", label: "Trash" },
      ]
    : [{ key: "all", label: "All" }];

  const showActionsCol = canEdit || canDelete;
  const colCount = 7 + (showActionsCol ? 1 : 0);

  function handleSaved() {
    setCreating(false);
    setEditing(null);
    void load();
  }

  return (
    <div className="space-y-3">
      {initialStats && (
        <StatsBar
          items={[
            { label: "profiles", value: initialStats.total.toLocaleString("en-IN") },
            {
              label: "active",
              value: initialStats.active.toLocaleString("en-IN"),
              accent: initialStats.active > 0,
            },
            {
              label: "taxonomy entries",
              value: initialStats.taxonomyTotal.toLocaleString("en-IN"),
            },
          ]}
        />
      )}

      {canDelete && tabs.length > 1 && (
        <div className="inline-flex max-w-full overflow-x-auto rounded border border-crm-border bg-white p-0.5 text-sm">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={[
                "shrink-0 rounded px-3 py-1.5",
                tab === t.key ? "bg-crm-blue text-white" : "text-crm-text hover:bg-crm-panel",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {viewTrash && canDelete && <TrashBanner count={total} onExit={() => setTab("all")} />}

      {!viewTrash && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] max-w-md flex-1">
              <Search
                size={16}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-crm-muted"
              />
              <Input
                className="pl-9"
                placeholder="Search ICP profiles…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select
              value={filterSegment}
              onChange={(e) => setFilterSegment(e.target.value)}
              aria-label="Segment filter"
              className="w-auto min-w-[140px]"
            >
              <option value="">All segments</option>
              <option value="Enterprise">Enterprise</option>
              <option value="MidMarket">Mid-Market</option>
              <option value="SMB">SMB</option>
            </Select>
            <Select
              value={filterActive}
              onChange={(e) => setFilterActive(e.target.value)}
              aria-label="Status filter"
              className="w-auto min-w-[120px]"
            >
              <option value="">All status</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </Select>
            <Select
              value={filterKind}
              onChange={(e) => setFilterKind(e.target.value)}
              aria-label="Linked dimension filter"
              className="w-auto min-w-[150px]"
            >
              <option value="">Any dimension</option>
              <option value="Industry">Has industries</option>
              <option value="Vertical">Has verticals</option>
              <option value="Technology">Has technologies</option>
            </Select>
            <Select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              aria-label="Sort by"
              className="w-auto min-w-[150px]"
            >
              <option value="updatedAt">Recently updated</option>
              <option value="createdAt">Recently created</option>
              <option value="name">Name</option>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canCreate && (
              <Button variant="secondary" onClick={() => setManagingTaxonomy(true)}>
                Manage taxonomy
              </Button>
            )}
            {canCreate && (
              <Button onClick={() => setCreating(true)}>
                <Plus size={16} /> New ICP
              </Button>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-crm-border bg-white">
        <TableScroll minWidth={880}>
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH hideBelow="sm">Segment</TH>
                <TH className="text-right" hideBelow="md">
                  Employees
                </TH>
                <TH className="text-right" hideBelow="lg">
                  Revenue
                </TH>
                <TH className="text-right">Linked</TH>
                <TH>Status</TH>
                <TH className="text-right" hideBelow="lg">
                  Updated
                </TH>
                {showActionsCol && <TH aria-label="Actions" className="w-24 text-center" />}
              </TR>
            </THead>
            <TBody>
              {loading && items.length === 0 ? (
                <TR>
                  <TD colSpan={colCount} className="py-6 text-center text-sm text-crm-muted">
                    Loading…
                  </TD>
                </TR>
              ) : items.length === 0 ? (
                <TR>
                  <TD colSpan={colCount} className="py-12 text-center text-sm text-crm-muted">
                    <div className="mx-auto max-w-sm space-y-1">
                      <p className="font-medium text-crm-text">
                        {viewTrash ? "No trashed ICP profiles." : "No ICP profiles yet"}
                      </p>
                      {!viewTrash && (
                        <p>
                          Define who you sell to — segment, size, geography — then link the
                          products, industries, verticals and technologies that describe the fit.
                        </p>
                      )}
                    </div>
                  </TD>
                </TR>
              ) : (
                items.map((row) => (
                  <TR
                    key={row.id}
                    className={
                      viewTrash
                        ? "bg-amber-50/30 hover:bg-amber-50/60"
                        : "transition-colors hover:bg-blue-50/40"
                    }
                  >
                    <TD>
                      <div className="font-medium text-crm-text">{row.name}</div>
                      {row.description && (
                        <div className="mt-0.5 line-clamp-1 text-xs text-crm-muted">
                          {row.description}
                        </div>
                      )}
                    </TD>
                    <TD hideBelow="sm">
                      {row.segment ? (
                        <span className="rounded-full bg-accent-100 px-2 py-0.5 text-xs font-medium text-accent-700">
                          {SEGMENT_LABEL[row.segment] ?? row.segment}
                        </span>
                      ) : (
                        <span className="text-crm-muted">—</span>
                      )}
                    </TD>
                    <TD className="text-right tabular-nums" hideBelow="md">
                      {rangeLabel(row.employeeCountMin, row.employeeCountMax)}
                    </TD>
                    <TD className="text-right tabular-nums" hideBelow="lg">
                      {revenueLabel(row)}
                    </TD>
                    <TD className="text-right tabular-nums text-xs text-crm-muted">
                      {/* One compact cell instead of three columns — keeps the
                          table readable on a laptop without hiding the data. */}
                      {row.taxonomyCount}t · {row.productCount}p · {row.accountCount}c
                    </TD>
                    <TD>
                      {row.isActive ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                          Inactive
                        </span>
                      )}
                    </TD>
                    <TD className="text-right text-xs text-crm-muted" hideBelow="lg">
                      {new Date(row.updatedAt).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </TD>
                    {showActionsCol && (
                      <TD className="text-center">
                        <IcpRowActions
                          row={row}
                          viewTrash={viewTrash}
                          canEdit={canEdit}
                          canDelete={canDelete}
                          onEdit={setEditing}
                          onDelete={onSoftDelete}
                          onRestore={onRestore}
                          onPermanentDelete={onPermanentDelete}
                        />
                      </TD>
                    )}
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </TableScroll>
      </div>

      {total > 0 && (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPage={setPage}
          pageSizeOptions={[10, 25, 50, 100]}
          onPageSizeChange={(n) => {
            setPageSize(n);
            setPage(1);
          }}
          showPageNumbers
        />
      )}

      {(creating || editing) && (
        <IcpFormModal
          open={creating || !!editing}
          profile={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={handleSaved}
        />
      )}

      {managingTaxonomy && (
        <IcpTaxonomyModal
          open={managingTaxonomy}
          canEdit={canEdit}
          canDelete={canDelete}
          onClose={() => {
            setManagingTaxonomy(false);
            // Taxonomy edits change the picker feed and the stats strip.
            void load();
          }}
        />
      )}
    </div>
  );
}

function IcpRowActions({
  row,
  viewTrash,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  onRestore,
  onPermanentDelete,
}: {
  row: IcpRow;
  viewTrash: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (row: IcpRow) => void;
  onDelete: (row: IcpRow) => void;
  onRestore: (row: IcpRow) => void;
  onPermanentDelete: (row: IcpRow) => void;
}) {
  const stop = (e: MouseEvent) => e.stopPropagation();

  if (viewTrash) {
    return (
      <div className="flex items-center justify-center gap-1">
        <button
          type="button"
          onClick={(e) => {
            stop(e);
            onRestore(row);
          }}
          className="rounded-md p-1.5 text-crm-muted transition hover:bg-green-50 hover:text-green-700"
          aria-label={`Restore ${row.name}`}
          title="Restore"
        >
          <RotateCcw size={14} />
        </button>
        {canDelete && (
          <button
            type="button"
            onClick={(e) => {
              stop(e);
              onPermanentDelete(row);
            }}
            className="rounded-md p-1.5 text-crm-muted transition hover:bg-red-50 hover:text-red-600"
            aria-label={`Delete ${row.name} permanently`}
            title="Delete permanently"
          >
            <X size={14} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-1">
      {canEdit && (
        <button
          type="button"
          onClick={(e) => {
            stop(e);
            onEdit(row);
          }}
          className="rounded-md p-1.5 text-crm-muted opacity-60 transition hover:bg-crm-panel hover:text-crm-text hover:opacity-100 focus:opacity-100"
          aria-label={`Edit ${row.name}`}
          title="Edit"
        >
          <Pencil size={14} />
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          onClick={(e) => {
            stop(e);
            onDelete(row);
          }}
          className="rounded-md p-1.5 text-crm-muted opacity-60 transition hover:bg-red-50 hover:text-red-600 hover:opacity-100 focus:opacity-100"
          aria-label={`Move ${row.name} to trash`}
          title="Move to Trash"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}
