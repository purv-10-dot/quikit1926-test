"use client";

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { Search } from "lucide-react";
import { Pagination } from "@/components/shared/pagination";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, ExternalLink, RotateCcw, Trash2, X } from "lucide-react";
import { TrashBanner, useConfirm } from "@quikit/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableScroll,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui/table";
import { StatsBar } from "@/components/shared/stats-bar";
import { useToast } from "@/hooks/use-toast";

type Tab = "all" | "trash";

/**
 * Aggregate stats for the Price Lists page — computed server-side in
 * `app/(dashboard)/price-lists/page.tsx::computePriceListStats`.
 */
export interface PriceListsStats {
  total: number;
  totalItems: number;
  defaultName: string | null;
}

interface PriceListRow {
  id: string;
  name: string;
  description: string | null;
  currency: string;
  isActive: boolean;
  isDefault: boolean;
  itemsCount: number;
  updatedAt: string;
  deletedAt: string | null;
}

export function PriceListsListClient({
  initialStats,
  canDelete = false,
  isAdmin = false,
}: {
  initialStats?: PriceListsStats;
  canDelete?: boolean;
  isAdmin?: boolean;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>("all");
  const viewTrash = tab === "trash";
  const [items, setItems] = useState<PriceListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [filterActive, setFilterActive] = useState<string>("");
  const [filterDefault, setFilterDefault] = useState<string>("");
  const [filterCurrency, setFilterCurrency] = useState("");
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
        sortDir: "desc",
      });
      if (viewTrash) params.set("trashed", "true");
      if (debouncedSearch) params.set("q", debouncedSearch);
      if (filterActive) params.set("isActive", filterActive);
      if (filterDefault) params.set("isDefault", filterDefault);
      if (filterCurrency) params.set("currency", filterCurrency);
      const res = await fetch(`/api/price-lists?${params.toString()}`);
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error ?? "Failed to load");
      setItems(body.data.items);
      setTotal(body.data.total ?? body.data.items.length);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load price lists");
    } finally {
      setLoading(false);
    }
  }, [viewTrash, page, pageSize, debouncedSearch, filterActive, filterDefault, filterCurrency, sortBy]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filterActive, filterDefault, filterCurrency, viewTrash, sortBy]);

  const onRestore = useCallback(
    async (row: PriceListRow) => {
      if (!canDelete) return;
      try {
        const res = await fetch(`/api/price-lists/${row.id}/restore`, {
          method: "POST",
          credentials: "include",
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !(j as { success?: boolean }).success) {
          throw new Error((j as { error?: string }).error || "Restore failed");
        }
        toast.success("Price list restored");
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Restore failed");
      }
    },
    [canDelete, load, toast],
  );

  const onSoftDelete = useCallback(
    async (row: PriceListRow) => {
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
        const res = await fetch(`/api/price-lists/${row.id}`, {
          method: "DELETE",
          credentials: "include",
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !(j as { success?: boolean }).success) {
          throw new Error((j as { error?: string }).error || "Delete failed");
        }
        toast.success("Price list moved to Trash");
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Delete failed");
      }
    },
    [canDelete, confirm, load, toast],
  );

  const onPermanentDelete = useCallback(
    async (row: PriceListRow) => {
      if (!isAdmin) return;
      const ok = await confirm({
        title: "Permanently delete this price list?",
        description: `"${row.name}" will be permanently removed. Linked quotes will lose this price list reference. This cannot be undone.`,
        confirmLabel: "Permanently delete",
        cancelLabel: "Cancel",
        tone: "danger",
      });
      if (!ok) return;
      try {
        const res = await fetch(`/api/price-lists/${row.id}/permanent`, {
          method: "DELETE",
          credentials: "include",
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !(j as { success?: boolean }).success) {
          throw new Error((j as { error?: string }).error || "Permanent delete failed");
        }
        toast.success("Price list permanently deleted");
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Permanent delete failed");
      }
    },
    [confirm, isAdmin, load, toast],
  );

  const tabs = useMemo<{ key: Tab; label: string }[]>(() => {
    const base: { key: Tab; label: string }[] = [{ key: "all", label: "All price lists" }];
    if (canDelete) base.push({ key: "trash", label: "Trash" });
    return base;
  }, [canDelete]);

  const showActionsCol = canDelete;
  const colCount = 6 + (viewTrash ? 1 : 0);

  return (
    <div className="space-y-3">
      {initialStats && (
        <StatsBar
          items={[
            { label: "lists", value: initialStats.total.toLocaleString("en-IN") },
            {
              label: "default",
              value: initialStats.defaultName ?? "—",
              accent: !!initialStats.defaultName,
            },
            {
              label: "products on lists",
              value: initialStats.totalItems.toLocaleString("en-IN"),
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
                tab === t.key
                  ? "bg-crm-blue text-white"
                  : "text-crm-text hover:bg-crm-panel",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {viewTrash && canDelete && (
        <TrashBanner count={total} onExit={() => setTab("all")} />
      )}

      {!viewTrash && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1 max-w-md">
              <Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-crm-muted" />
              <Input
                className="pl-9"
                placeholder="Search price lists…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select
              value={filterActive}
              onChange={(e) => setFilterActive(e.target.value)}
              aria-label="Active filter"
              className="w-auto min-w-[120px]"
            >
              <option value="">All status</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </Select>
            <Select
              value={filterDefault}
              onChange={(e) => setFilterDefault(e.target.value)}
              aria-label="Default filter"
              className="w-auto min-w-[120px]"
            >
              <option value="">Default?</option>
              <option value="true">Default only</option>
            </Select>
            <Select
              value={filterCurrency}
              onChange={(e) => setFilterCurrency(e.target.value)}
              aria-label="Currency filter"
              className="w-auto min-w-[100px]"
            >
              <option value="">Currency</option>
              {["INR", "USD", "EUR", "GBP"].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <Select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              aria-label="Sort by"
              className="w-auto min-w-[140px]"
            >
              <option value="updatedAt">Recently updated</option>
              <option value="createdAt">Recently created</option>
              <option value="name">Name</option>
            </Select>
          </div>
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} /> New price list
          </Button>
        </div>
      )}

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-crm-border bg-white">
        <TableScroll minWidth={520}>
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH hideBelow="sm">Currency</TH>
                <TH className="text-right">Products</TH>
                <TH>Status</TH>
                <TH className="text-right" hideBelow="lg">Updated</TH>
                {viewTrash && <TH hideBelow="md">Deleted</TH>}
                {showActionsCol ? (
                  <TH aria-label="Actions" className="w-24 text-center" />
                ) : (
                  <TH aria-label="Open" className="w-12" />
                )}
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
                        {viewTrash ? "No trashed price lists." : "No price lists yet"}
                      </p>
                      {!viewTrash && (
                        <p>
                          Create one to override product list prices for a customer segment
                          (Standard, Wholesale, Enterprise, …).
                        </p>
                      )}
                    </div>
                  </TD>
                </TR>
              ) : (
                items.map((pl) => (
                  <TR
                    key={pl.id}
                    className={[
                      viewTrash
                        ? "bg-amber-50/30 hover:bg-amber-50/60"
                        : "cursor-pointer transition-colors hover:bg-blue-50/40",
                    ].join(" ")}
                    onClick={(e) => {
                      if (viewTrash) return;
                      if ((e.target as HTMLElement).closest("a,button")) return;
                      window.location.href = `/price-lists/${pl.id}`;
                    }}
                  >
                    {/* Primary cell — name + optional description as subtitle.
                        This is the Salesforce / Linear pattern: pack the
                        primary record's metadata into the lead cell rather
                        than splitting it across many sparse columns. */}
                    <TD>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/price-lists/${pl.id}`}
                          className={[
                            "font-medium hover:underline",
                            viewTrash
                              ? "pointer-events-none text-crm-muted"
                              : "text-crm-text",
                          ].join(" ")}
                          onClick={(e) => e.stopPropagation()}
                          aria-disabled={viewTrash}
                          tabIndex={viewTrash ? -1 : undefined}
                        >
                          {pl.name}
                        </Link>
                        {pl.isDefault && (
                          <span className="rounded-full bg-accent-100 px-2 py-0.5 text-xs font-medium text-accent-700">
                            Default
                          </span>
                        )}
                      </div>
                      {pl.description && (
                        <p className="mt-0.5 line-clamp-1 max-w-[40rem] text-xs text-crm-muted">
                          {pl.description}
                        </p>
                      )}
                    </TD>
                    <TD hideBelow="sm">
                      <span className="rounded border border-crm-border bg-gray-50 px-1.5 py-0.5 font-mono text-xs text-crm-text">
                        {pl.currency}
                      </span>
                    </TD>
                    <TD className="text-right tabular-nums">
                      {pl.itemsCount === 0 ? (
                        <span className="text-crm-muted">0</span>
                      ) : (
                        <span className="font-medium text-crm-text">
                          {pl.itemsCount.toLocaleString("en-IN")}
                        </span>
                      )}
                    </TD>
                    <TD>
                      {pl.isActive ? (
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
                    <TD hideBelow="lg" className="text-right tabular-nums text-crm-muted">
                      {new Date(pl.updatedAt).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </TD>
                    {viewTrash && (
                      <TD hideBelow="md" className="text-xs text-crm-muted whitespace-nowrap">
                        <PriceListDeletedAtCell value={pl.deletedAt} />
                      </TD>
                    )}
                    <TD className="text-right">
                      {showActionsCol ? (
                        <PriceListRowActions
                          row={pl}
                          viewTrash={viewTrash}
                          isAdmin={isAdmin}
                          onDelete={onSoftDelete}
                          onRestore={onRestore}
                          onPermanentDelete={onPermanentDelete}
                        />
                      ) : (
                        <Link
                          href={`/price-lists/${pl.id}`}
                          className="crm-btn-ghost inline-flex h-8 w-8 items-center justify-center p-0"
                          aria-label={`Open ${pl.name}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink size={14} />
                        </Link>
                      )}
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </TableScroll>
      </div>

      {!viewTrash && total > 0 && (
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

      {creating && (
        <PriceListCreateModal
          open={creating}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

function PriceListRowActions({
  row,
  viewTrash,
  isAdmin,
  onDelete,
  onRestore,
  onPermanentDelete,
}: {
  row: PriceListRow;
  viewTrash: boolean;
  isAdmin: boolean;
  onDelete: (row: PriceListRow) => void;
  onRestore: (row: PriceListRow) => void;
  onPermanentDelete: (row: PriceListRow) => void;
}) {
  const stop = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  if (viewTrash) {
    return (
      <div className="inline-flex items-center justify-center divide-x divide-amber-200/60 overflow-hidden rounded-md ring-1 ring-amber-200/60 bg-white shadow-sm">
        <button
          type="button"
          onClick={(e) => {
            stop(e);
            onRestore(row);
          }}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-crm-blue transition hover:bg-crm-blue-soft"
          aria-label="Restore price list"
          title="Restore — return to active price lists"
        >
          <RotateCcw size={12} />
          Restore
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={(e) => {
              stop(e);
              onPermanentDelete(row);
            }}
            className="inline-flex items-center justify-center px-2 py-1 text-red-600 transition hover:bg-red-50"
            aria-label="Permanently delete price list"
            title="Permanently delete — cannot be undone"
          >
            <X size={14} />
          </button>
        )}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        stop(e);
        onDelete(row);
      }}
      className="rounded-md p-1.5 text-crm-muted opacity-60 transition hover:bg-red-50 hover:text-red-600 hover:opacity-100 focus:opacity-100"
      aria-label="Move price list to trash"
      title="Move to Trash"
    >
      <Trash2 size={14} />
    </button>
  );
}

function PriceListDeletedAtCell({ value }: { value: string | null }) {
  if (!value) return <span className="text-crm-muted">—</span>;
  const date = new Date(value);
  const diffMs = Math.max(0, Date.now() - date.getTime());
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);
  let rel: string;
  if (diffMin < 1) rel = "just now";
  else if (diffMin < 60) rel = `${diffMin}m ago`;
  else if (diffHr < 24) rel = `${diffHr}h ago`;
  else rel = `${diffDay}d ago`;
  return (
    <span title={date.toLocaleString("en-IN")}>
      {date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} · {rel}
    </span>
  );
}

/**
 * Common business currencies. Kept short on purpose — modals shouldn't
 * have 180-entry dropdowns. Add more if a tenant needs them. The same
 * list is reused on the Quote header builder.
 *
 * INR ships first because the GST engine in lib/services/quotes/totals.ts
 * is Indian-numbering-aware; the others are accepted because the spec
 * promises multi-currency support in a later phase and the schema
 * already stores `currency String @default("INR")`.
 */
const CURRENCY_OPTIONS = [
  { code: "INR", label: "INR — Indian Rupee" },
  { code: "USD", label: "USD — US Dollar" },
  { code: "EUR", label: "EUR — Euro" },
  { code: "GBP", label: "GBP — British Pound" },
  { code: "AED", label: "AED — UAE Dirham" },
  { code: "SGD", label: "SGD — Singapore Dollar" },
] as const;

function PriceListCreateModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  // The create modal is intentionally lean: Name, Currency, Description,
  // Default flag. Cramming a multi-select product picker in here would
  // make the modal huge and unusable above ~30 products. Instead, on
  // successful create we navigate to /price-lists/<id> — the detail
  // page already hosts the "Add product to price list" flow with a
  // proper product search. This is the Salesforce / D365 pattern.
  const router = useRouter();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState<string>("INR");
  const [description, setDescription] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/price-lists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          currency,
          ...(description.trim() ? { description: description.trim() } : {}),
          isDefault,
          isActive: true,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Failed to create");
      // Let the parent close the modal + refresh its stats, then jump
      // straight to the detail page where products can be added. We do
      // this in this order so the parent's list refresh has already
      // kicked off before the navigation transitions away — feels snappier
      // if the user hits Back later.
      onSaved();
      router.push(`/price-lists/${json.data.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create price list");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New price list" width="max-w-xl">
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-crm-text">
            List name <span className="text-red-500">*</span>
          </span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            placeholder="Standard / Wholesale / Enterprise / Govt 2026 …"
            aria-describedby="price-list-name-hint"
          />
          <span
            id="price-list-name-hint"
            className="mt-1 block text-xs text-crm-muted"
          >
            How your sales team will pick this tier in the Quote Builder dropdown.
            Internal only — customers don&apos;t see it.
          </span>
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-crm-text">
              Currency <span className="text-red-500">*</span>
            </span>
            <Select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              aria-label="Currency"
            >
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-crm-text">Description</span>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              placeholder="optional"
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm text-crm-text">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="accent-accent-600"
          />
          Set as default (tenant fallback when no list is chosen)
        </label>
        <p className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          You&apos;ll add products to this list on the next screen — that&apos;s where the catalog
          search lives.
        </p>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-5 flex flex-row-reverse gap-2 border-t border-crm-border pt-4">
        <Button onClick={handleSubmit} disabled={submitting || !name.trim()}>
          {submitting ? "Creating…" : "Create & add products"}
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
