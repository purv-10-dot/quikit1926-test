"use client";

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, ExternalLink, RotateCcw, Trash2, X } from "lucide-react";
import { TrashBanner, useConfirm } from "@quikit/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Pagination } from "@/components/shared/pagination";
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
 * Aggregate stats for the Quotes list — computed server-side in
 * `app/(dashboard)/quotes/page.tsx::computeQuoteStats` and passed in as
 * `initialStats`. Always reflects ALL quotes in the tenant (not filtered
 * by the client-side status filter), matching the Opportunities pipeline
 * header behaviour.
 */
export interface QuotesStats {
  total: number;
  byStatus: Record<"Draft" | "Active" | "Won" | "Lost" | "Revised", number>;
  activeGrandTotal: number;
  wonGrandTotal: number;
}

function formatINRCompact(n: number): string {
  // Compact Indian-numbering shorthand: ₹78.5L, ₹2.5Cr, etc. Matches the
  // Opportunities pipeline header (formatINR in opportunity-kanban.tsx).
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2).replace(/\.?0+$/u, "")}Cr`;
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1).replace(/\.?0+$/u, "")}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1).replace(/\.?0+$/u, "")}K`;
  return `₹${n.toLocaleString("en-IN")}`;
}

interface QuoteRow {
  id: string;
  quoteNumber: string;
  versionNumber: number;
  status: "Draft" | "Active" | "Won" | "Lost" | "Revised";
  accountId: string;
  accountName?: string | null;
  subtotal: number;
  grandTotal: number;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  ownerName: string | null;
  sentAt: string | null;
  createdAt: string;
  deletedAt: string | null;
}

const STATUS_FILTER = ["", "Draft", "Active", "Won", "Lost", "Revised"] as const;
type StatusFilter = (typeof STATUS_FILTER)[number];

const STATUS_STYLE: Record<QuoteRow["status"], string> = {
  Draft: "bg-gray-100 text-gray-700",
  Active: "bg-blue-100 text-blue-700",
  Won: "bg-green-100 text-green-700",
  Lost: "bg-red-100 text-red-700",
  Revised: "bg-amber-100 text-amber-700",
};

export function QuotesListClient({
  initialStats,
  canDelete = false,
  isAdmin = false,
}: {
  initialStats?: QuotesStats;
  canDelete?: boolean;
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>("all");
  const viewTrash = tab === "trash";
  const [items, setItems] = useState<QuoteRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [status, setStatus] = useState<StatusFilter>("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (viewTrash) {
        params.set("trashed", "true");
      } else if (status) {
        params.set("status", status);
      }
      if (search.trim()) params.set("q", search.trim());
      const res = await fetch(`/api/quotes?${params.toString()}`);
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error ?? "Failed to load");
      setItems(body.data.items);
      setTotal(body.data.total);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load quotes");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, status, search, viewTrash]);

  const onRestore = useCallback(
    async (row: QuoteRow) => {
      if (!canDelete) return;
      try {
        const res = await fetch(`/api/quotes/${row.id}/restore`, {
          method: "POST",
          credentials: "include",
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !(j as { success?: boolean }).success) {
          throw new Error((j as { error?: string }).error || "Restore failed");
        }
        toast.success("Quote restored");
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Restore failed");
      }
    },
    [canDelete, load, toast],
  );

  const onSoftDelete = useCallback(
    async (row: QuoteRow) => {
      if (!canDelete) return;
      const ok = await confirm({
        title: "Move to Trash?",
        description: `"${row.quoteNumber}" will be moved to Trash. You can restore it later.`,
        confirmLabel: "Move to Trash",
        cancelLabel: "Cancel",
        tone: "warning",
      });
      if (!ok) return;
      try {
        const res = await fetch(`/api/quotes/${row.id}`, {
          method: "DELETE",
          credentials: "include",
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !(j as { success?: boolean }).success) {
          throw new Error((j as { error?: string }).error || "Delete failed");
        }
        toast.success("Quote moved to Trash");
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Delete failed");
      }
    },
    [canDelete, confirm, load, toast],
  );

  const onPermanentDelete = useCallback(
    async (row: QuoteRow) => {
      if (!isAdmin) return;
      const ok = await confirm({
        title: "Permanently delete this quote?",
        description: `"${row.quoteNumber}" will be permanently removed. This cannot be undone.`,
        confirmLabel: "Permanently delete",
        cancelLabel: "Cancel",
        tone: "danger",
      });
      if (!ok) return;
      try {
        const res = await fetch(`/api/quotes/${row.id}/permanent`, {
          method: "DELETE",
          credentials: "include",
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !(j as { success?: boolean }).success) {
          throw new Error((j as { error?: string }).error || "Permanent delete failed");
        }
        toast.success("Quote permanently deleted");
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Permanent delete failed");
      }
    },
    [confirm, isAdmin, load, toast],
  );

  const tabs = useMemo<{ key: Tab; label: string }[]>(() => {
    const base: { key: Tab; label: string }[] = [{ key: "all", label: "All quotes" }];
    if (canDelete) base.push({ key: "trash", label: "Trash" });
    return base;
  }, [canDelete]);

  const showActionsCol = canDelete;
  const colCount = 8 + (viewTrash ? 1 : 0);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-3">
      {initialStats && (
        <StatsBar
          items={[
            { label: "total", value: initialStats.total.toLocaleString("en-IN") },
            { label: "drafts", value: initialStats.byStatus.Draft.toLocaleString("en-IN") },
            {
              label: "active",
              value: initialStats.byStatus.Active.toLocaleString("en-IN"),
              hint:
                initialStats.activeGrandTotal > 0
                  ? `· ${formatINRCompact(initialStats.activeGrandTotal)}`
                  : undefined,
              accent: initialStats.byStatus.Active > 0,
            },
            {
              label: "won",
              value: initialStats.byStatus.Won.toLocaleString("en-IN"),
              hint:
                initialStats.wonGrandTotal > 0
                  ? `· ${formatINRCompact(initialStats.wonGrandTotal)}`
                  : undefined,
            },
            { label: "lost", value: initialStats.byStatus.Lost.toLocaleString("en-IN") },
          ]}
        />
      )}

      {canDelete && tabs.length > 1 && (
        <div className="inline-flex max-w-full overflow-x-auto rounded border border-crm-border bg-white p-0.5 text-sm">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setTab(t.key);
                setPage(1);
              }}
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

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder={viewTrash ? "Search trashed quotes…" : "Search by quote number…"}
          className="max-w-xs"
          aria-label="Search quotes"
        />
        {!viewTrash && (
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as StatusFilter);
              setPage(1);
            }}
            aria-label="Filter by status"
            className="max-w-[12rem]"
          >
            <option value="">All statuses</option>
            {(["Draft", "Active", "Won", "Lost", "Revised"] as const).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        )}
        {!viewTrash && (
          <div className="ml-auto">
            <Button onClick={() => setCreating(true)}>
              <Plus size={16} /> New quote
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-crm-border bg-white">
        <TableScroll minWidth={800}>
          <Table>
            <THead>
              <TR>
                <TH>Quote #</TH>
                <TH hideBelow="sm">Account</TH>
                <TH hideBelow="md">Created</TH>
                <TH>Status</TH>
                <TH hideBelow="lg">Sent</TH>
                <TH hideBelow="lg">Owner</TH>
                <TH className="text-right">Grand total (₹)</TH>
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
                        {viewTrash ? "No trashed quotes." : "No quotes yet"}
                      </p>
                      {!viewTrash && (
                        <p>
                          Click <span className="font-medium">New quote</span> to draft one, or open
                          an Opportunity and create a quote pre-linked to the deal.
                        </p>
                      )}
                    </div>
                  </TD>
                </TR>
              ) : (
                items.map((q) => (
                  <TR
                    key={q.id}
                    className={
                      viewTrash
                        ? "bg-amber-50/30 hover:bg-amber-50/60"
                        : "hover:bg-blue-50/30"
                    }
                  >
                    <TD className="font-medium text-crm-text">
                      <Link
                        href={`/quotes/${q.id}`}
                        className={[
                          "hover:underline",
                          viewTrash
                            ? "pointer-events-none text-crm-muted"
                            : "text-crm-text",
                        ].join(" ")}
                        onClick={(e) => e.stopPropagation()}
                        aria-disabled={viewTrash}
                        tabIndex={viewTrash ? -1 : undefined}
                      >
                        {q.quoteNumber}
                      </Link>
                      {q.versionNumber > 1 && (
                        <span className="ml-2 text-xs text-crm-muted">v{q.versionNumber}</span>
                      )}
                    </TD>
                    <TD hideBelow="sm" className="text-crm-text">
                      {q.accountName ?? <span className="text-crm-muted">—</span>}
                    </TD>
                    <TD hideBelow="md" className="text-crm-muted">
                      {new Date(q.createdAt).toLocaleDateString()}
                    </TD>
                    <TD>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[q.status]}`}
                      >
                        {q.status}
                      </span>
                    </TD>
                    <TD hideBelow="lg" className="text-crm-muted">
                      {q.sentAt ? new Date(q.sentAt).toLocaleDateString() : "—"}
                    </TD>
                    <TD hideBelow="lg">{q.ownerName ?? "—"}</TD>
                    <TD className="text-right tabular-nums">
                      {q.grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </TD>
                    {viewTrash && (
                      <TD hideBelow="md" className="text-xs text-crm-muted whitespace-nowrap">
                        <QuoteDeletedAtCell value={q.deletedAt} />
                      </TD>
                    )}
                    <TD className="text-right">
                      {showActionsCol ? (
                        <QuoteRowActions
                          row={q}
                          viewTrash={viewTrash}
                          isAdmin={isAdmin}
                          onDelete={onSoftDelete}
                          onRestore={onRestore}
                          onPermanentDelete={onPermanentDelete}
                        />
                      ) : (
                        <Link
                          href={`/quotes/${q.id}`}
                          className="crm-btn-ghost inline-flex h-8 w-8 items-center justify-center p-0"
                          aria-label={`Open ${q.quoteNumber}`}
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
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPage={setPage}
          pageSizeOptions={[10, 25, 50, 100]}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setPage(1);
          }}
        />
      </div>

      {creating && (
        <NewQuoteModal
          open={creating}
          onClose={() => setCreating(false)}
          onCreated={(id) => router.push(`/quotes/${id}`)}
        />
      )}
    </div>
  );
}

function QuoteRowActions({
  row,
  viewTrash,
  isAdmin,
  onDelete,
  onRestore,
  onPermanentDelete,
}: {
  row: QuoteRow;
  viewTrash: boolean;
  isAdmin: boolean;
  onDelete: (row: QuoteRow) => void;
  onRestore: (row: QuoteRow) => void;
  onPermanentDelete: (row: QuoteRow) => void;
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
          aria-label="Restore quote"
          title="Restore — return to active quotes"
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
            aria-label="Permanently delete quote"
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
      aria-label="Move quote to trash"
      title="Move to Trash"
    >
      <Trash2 size={14} />
    </button>
  );
}

function QuoteDeletedAtCell({ value }: { value: string | null }) {
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

function NewQuoteModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string }>>([]);
  const [accountId, setAccountId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Note: /api/accounts is a *legacy-shaped* endpoint — it returns
    // `{ data: [...accounts], total, page, pageSize, totalPages }` directly,
    // NOT the modern `{ success, data: { items } }` envelope the new Quotes
    // endpoints use. We normalise both shapes so this keeps working even if
    // the accounts route is later migrated to the modern envelope.
    void fetch("/api/accounts?page=1&pageSize=100")
      .then((r) => r.json())
      .then((body) => {
        const items: Array<{ id: string; name: string }> = Array.isArray(body?.data?.items)
          ? body.data.items
          : Array.isArray(body?.data)
            ? body.data
            : [];
        setAccounts(items);
      })
      .catch(() => undefined);
  }, [open]);

  async function handleSubmit() {
    if (!accountId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Failed to create quote");
      onCreated(json.data.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create quote");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New quote">
      <p className="-mt-1 mb-4 text-sm text-crm-muted">
        Start a draft quote for a customer account. You can add line items on the next screen.
      </p>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-crm-text">
          Account <span className="text-red-500">*</span>
        </span>
        <select
          className="crm-input pr-8"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
        >
          <option value="">— Select an account —</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-5 flex flex-row-reverse gap-2 border-t border-crm-border pt-4">
        <Button onClick={handleSubmit} disabled={submitting || !accountId}>
          {submitting ? "Creating…" : "Create draft"}
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
