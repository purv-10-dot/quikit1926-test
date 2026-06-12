"use client";

/**
 * AccountsExplorer — interactive list shell for /accounts.
 *
 * - Search (debounced 400ms) + tile filters (All / Mine / Trash[admin])
 * - Server-paginated table (25/page) — uses { data, total, page, pageSize }
 * - Click row name → /accounts/[id]; click anywhere else (Accounts.edit) → side panel
 * - "New account" button → side panel in create mode
 * - ACL banner shown when getScope returns unrestricted=false
 */
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RotateCcw, SlidersHorizontal, Trash2, X } from "lucide-react";
import { TrashBanner, useConfirm } from "@quikit/ui";
import { useToast } from "@/hooks/use-toast";
import { Pagination } from "@/components/shared/pagination";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { AccountStatusPill } from "@/components/accounts/account-status-pill";
import { AccountAclBanner } from "@/components/accounts/account-acl-banner";
import {
  AccountFormPanel,
  type AccountFormInitial,
} from "@/components/accounts/account-form-panel";
import { PageContainer } from "@/components/ui/container";
import { PageHeader } from "@/components/shared/page-header";
import { ExportButton } from "@/components/reports/export-button";
import { Table, TableScroll, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { TableSkeletonRows } from "@/components/ui/skeleton";
import {
  AccountAdvancedFilterModal,
  AccountAppliedFilterSummary,
  buildAccountFilterRequest,
} from "@/components/accounts/account-advanced-filter";
import type { FilterPayload } from "@/types/lead-filter";
import { ACCOUNT_FILTER_FIELDS } from "@/lib/account-filter-fields";

type Tab = "all" | "mine" | "trash";

interface AccountRowDto {
  id: string;
  name: string;
  segment: string;
  segmentEnum: string | null;
  owner: string;
  ownerId: string | null;
  annualRevenue: string;
  annualRevenueAmount: number | null;
  annualRevenueCurrency: string | null;
  status: string;
  industry: string;
  industryKey: string | null;
  website: string;
  city: string;
  countryCode: string | null;
  state: string | null;
  postalCode: string | null;
  parentAccountId: string | null;
  healthScore: number | null;
  npsScore: number | null;
  contractStart: string | null;
  contractEnd: string | null;
  renewalDate: string | null;
  deletedAt: string | null;
}

interface ListResponse {
  data: AccountRowDto[];
  total: number;
  page: number;
  pageSize: number;
}

interface Props {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  isAdmin: boolean;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 10;

function readPageFromUrl(sp: URLSearchParams): number {
  const raw = Number(sp.get("page"));
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
}
function readPageSizeFromUrl(sp: URLSearchParams): number {
  const raw = Number(sp.get("limit"));
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(raw) ? raw : DEFAULT_PAGE_SIZE;
}

export function AccountsExplorer({ canCreate, canEdit, canDelete, isAdmin }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const confirm = useConfirm();
  const toast = useToast();

  const [tab, setTab] = useState<Tab>("all");
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 400);

  const [page, setPageState] = useState<number>(() =>
    readPageFromUrl(new URLSearchParams(searchParams.toString())),
  );
  const [pageSize, setPageSizeState] = useState<number>(() =>
    readPageSizeFromUrl(new URLSearchParams(searchParams.toString())),
  );

  const writeUrl = useCallback(
    (nextPage: number, nextLimit: number) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (nextPage === 1) sp.delete("page");
      else sp.set("page", String(nextPage));
      if (nextLimit === DEFAULT_PAGE_SIZE) sp.delete("limit");
      else sp.set("limit", String(nextLimit));
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const setPage = useCallback(
    (next: number) => {
      setPageState(next);
      writeUrl(next, pageSize);
    },
    [pageSize, writeUrl],
  );
  const setPageSize = useCallback(
    (next: number) => {
      setPageSizeState(next);
      setPageState(1);
      writeUrl(1, next);
    },
    [writeUrl],
  );

  // Mirror URL → state on browser back/forward.
  useEffect(() => {
    const sp = new URLSearchParams(searchParams.toString());
    const nextPage = readPageFromUrl(sp);
    const nextSize = readPageSizeFromUrl(sp);
    setPageState((cur) => (cur === nextPage ? cur : nextPage));
    setPageSizeState((cur) => (cur === nextSize ? cur : nextSize));
  }, [searchParams]);

  const [data, setData] = useState<AccountRowDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<AccountRowDto | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [filter, setFilter] = useState<FilterPayload>({
    matchMode: "ALL",
    conditions: [],
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [ownerOptions, setOwnerOptions] = useState<{ value: string; label: string }[]>([]);
  const filterActive = filter.conditions.length > 0;

  useEffect(() => {
    void fetch("/api/users/picker", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { items?: { name: string }[] } | null) => {
        if (!j?.items?.length) return;
        setOwnerOptions(j.items.map((u) => ({ value: u.name, label: u.name })));
      })
      .catch(() => {
        /* picker is best-effort */
      });
  }, []);

  const filterDynamicOptions = useMemo(() => {
    const segmentOpts =
      ACCOUNT_FILTER_FIELDS.find((f) => f.field === "segmentEnum")?.options ?? [];
    const statusOpts =
      ACCOUNT_FILTER_FIELDS.find((f) => f.field === "status")?.options ?? [];
    return {
      ownerName: ownerOptions,
      segmentEnum: segmentOpts,
      status: statusOpts,
    };
  }, [ownerOptions]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      let res: Response;
      if (filterActive) {
        // POST /api/accounts/filter handles the advanced WHERE; the regular
        // GET handler doesn't accept structured conditions, only `search`.
        // Tabs (`mine`/`trash`) are not honored by this endpoint, so the
        // result is always tenant-scoped active accounts when the filter
        // is on — see the banner inline below.
        const body = {
          ...buildAccountFilterRequest(filter),
          page,
          pageSize,
          ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
        };
        res = await fetch("/api/accounts/filter", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(pageSize),
          view: tab === "mine" ? "mine" : "all",
        });
        if (tab === "trash") params.set("trashed", "true");
        if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
        res = await fetch(`/api/accounts?${params.toString()}`, {
          credentials: "include",
        });
      }
      if (!res.ok) throw new Error((await res.json()).error || "Failed to load");
      const json = (await res.json()) as ListResponse;
      setData(json.data);
      setTotal(json.total);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Failed to load");
      setData([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, tab, filter, filterActive]);

  useEffect(() => {
    void load();
  }, [load]);

  // Reset to page 1 when search, tab, or filter changes — but skip the very
  // first render so a deep-link like `/accounts?page=3` isn't immediately reset.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, tab, filter]);

  function rowToInitial(r: AccountRowDto): AccountFormInitial {
    return {
      id: r.id,
      name: r.name,
      segment: r.segment,
      segmentEnum: r.segmentEnum,
      ownerId: r.ownerId,
      industry: r.industry,
      website: r.website,
      city: r.city,
      status: r.status,
      annualRevenue: r.annualRevenue,
      annualRevenueAmount: r.annualRevenueAmount,
      annualRevenueCurrency: r.annualRevenueCurrency,
      countryCode: r.countryCode,
      state: r.state,
      postalCode: r.postalCode,
      parentAccountId: r.parentAccountId,
      healthScore: r.healthScore,
      npsScore: r.npsScore,
      contractStart: r.contractStart,
      contractEnd: r.contractEnd,
      renewalDate: r.renewalDate,
    };
  }

  const onRestore = useCallback(
    async (row: AccountRowDto) => {
      if (!canDelete) return;
      try {
        const res = await fetch(`/api/accounts/${row.id}/restore`, {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error((j as { error?: string }).error || "Restore failed");
        }
        toast.success("Account restored");
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Restore failed");
      }
    },
    [canDelete, load, toast],
  );

  const onSoftDelete = useCallback(
    async (row: AccountRowDto) => {
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
        const res = await fetch(`/api/accounts/${row.id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error((j as { error?: string }).error || "Delete failed");
        }
        toast.success("Account moved to Trash");
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Delete failed");
      }
    },
    [canDelete, confirm, load, toast],
  );

  const onPermanentDelete = useCallback(
    async (row: AccountRowDto) => {
      if (!isAdmin) return;
      const ok = await confirm({
        title: "Permanently delete this account?",
        description: `"${row.name}" will be permanently removed. Linked leads will be unlinked. This cannot be undone.`,
        confirmLabel: "Permanently delete",
        cancelLabel: "Cancel",
        tone: "danger",
      });
      if (!ok) return;
      try {
        const res = await fetch(`/api/accounts/${row.id}/permanent`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error((j as { error?: string }).error || "Permanent delete failed");
        }
        toast.success("Account permanently deleted");
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Permanent delete failed");
      }
    },
    [confirm, isAdmin, load, toast],
  );

  const tabs = useMemo<{ key: Tab; label: string }[]>(
    () => {
      const base: { key: Tab; label: string }[] = [
        { key: "all", label: "All accounts" },
        { key: "mine", label: "My accounts" },
      ];
      if (canDelete) base.push({ key: "trash", label: "Trash" });
      return base;
    },
    [canDelete],
  );

  const viewTrash = tab === "trash";
  const showActionsCol = canDelete;
  const colCount = 6 + (showActionsCol ? 1 : 0) + (viewTrash ? 1 : 0);

  return (
    <PageContainer size="full">
      <PageHeader
        title="Accounts"
        subtitle={`Click a row to edit${canEdit ? "" : " (view only)"}.`}
        actions={
          viewTrash ? undefined : (
            <>
              <ExportButton apiPath="/api/accounts" size="md" />
              <button
                type="button"
                disabled={!canCreate}
                title={!canCreate ? "You don't have permission to create accounts" : undefined}
                className="crm-btn-primary"
                onClick={() => setCreateOpen(true)}
              >
                New account
              </button>
            </>
          )
        }
      />

      {viewTrash && (
        <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-crm-border pb-3">
          <h2 className="text-base font-semibold text-crm-text">Trash</h2>
          <span className="inline-flex items-center rounded-full bg-crm-panel px-2 py-0.5 text-[11px] font-medium text-crm-muted">
            {total} in trash
          </span>
          <p className="ml-1 hidden text-xs text-crm-muted xl:block">
            Restore items or permanently remove with{" "}
            <span className="font-medium text-red-600">Delete forever</span> (admin only).
          </p>
        </div>
      )}

      {viewTrash && canDelete && (
        <TrashBanner
          count={total}
          onExit={() => {
            setTab("all");
            setPage(1);
          }}
        />
      )}

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

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 sm:max-w-md">
          <input
            type="search"
            placeholder={viewTrash ? "Search trashed accounts…" : "Search accounts…"}
            className="crm-input"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search accounts"
          />
        </div>
        {!viewTrash && (
          <button
            type="button"
            className="crm-btn-secondary shrink-0"
            onClick={() => setShowAdvanced(true)}
          >
            <SlidersHorizontal className="h-4 w-4 text-crm-blue" />
            <span className="hidden sm:inline">Advanced Search</span>
            <span className="sm:hidden">Filter</span>
            {filterActive && (
              <span className="ml-1 rounded-full bg-accent-100 px-1.5 py-0.5 text-[10px] font-semibold text-accent-700">
                On
              </span>
            )}
          </button>
        )}
        {!viewTrash && canDelete && (
          <button
            type="button"
            className="crm-btn-secondary shrink-0"
            onClick={() => {
              setTab("trash");
              setPage(1);
            }}
            title="View trashed accounts"
          >
            <Trash2 className="h-4 w-4 text-crm-muted" />
            <span className="hidden sm:inline">Trash</span>
          </button>
        )}
      </div>

      <AccountAclBanner />

      {!viewTrash && (
        <AccountAppliedFilterSummary
          filter={filter}
          onClear={() =>
            setFilter({ matchMode: "ALL", conditions: [] })
          }
        />
      )}

      {filterActive && !viewTrash && tab !== "all" && (
        <div className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Advanced filter is active — results ignore the My accounts tab and show all matching active accounts. Clear the filter to switch tabs.
        </div>
      )}

      {loadErr && (
        <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {loadErr}
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded border border-crm-border bg-white">
        <TableScroll minWidth={720} bleed={false}>
          <Table>
            <THead>
              <TR>
                <TH className="px-3 py-2 text-left font-medium">Account name</TH>
                <TH hideBelow="md" className="px-3 py-2 text-left font-medium">
                  Segment
                </TH>
                <TH hideBelow="lg" className="px-3 py-2 text-left font-medium">
                  Owner
                </TH>
                <TH hideBelow="md" className="px-3 py-2 text-left font-medium">
                  Revenue
                </TH>
                <TH hideBelow="lg" className="px-3 py-2 text-left font-medium">
                  Industry
                </TH>
                <TH className="px-3 py-2 text-left font-medium">Status</TH>
                {viewTrash && (
                  <TH className="px-3 py-2 text-left font-medium whitespace-nowrap">Deleted</TH>
                )}
                {showActionsCol && (
                  <TH className="px-3 py-2 text-center font-medium">
                    {viewTrash ? "Actions" : <span className="sr-only">Row actions</span>}
                  </TH>
                )}
              </TR>
            </THead>
            <TBody>
              {loading ? (
                <TableSkeletonRows
                  rows={10}
                  columns={[
                    { widthClass: "w-40", className: "px-3" },
                    { widthClass: "w-24", hideBelow: "md", className: "px-3" },
                    { widthClass: "w-32", hideBelow: "lg", className: "px-3" },
                    { widthClass: "w-20", hideBelow: "md", className: "px-3" },
                    { widthClass: "w-24", hideBelow: "lg", className: "px-3" },
                    { widthClass: "w-16", className: "px-3" },
                    ...(viewTrash ? [{ widthClass: "w-24", className: "px-3" }] : []),
                    ...(showActionsCol ? [{ widthClass: "w-16", className: "px-3" }] : []),
                  ]}
                />
              ) : data.length === 0 ? (
                <TR>
                  <TD colSpan={colCount} className="px-3 py-8 text-center text-crm-muted">
                    {viewTrash ? "No trashed accounts." : "No accounts found."}
                  </TD>
                </TR>
              ) : (
                data.map((r) => (
                  <TR
                    key={r.id}
                    className={[
                      viewTrash
                        ? "bg-amber-50/30 hover:bg-amber-50/60"
                        : "cursor-pointer hover:bg-crm-peach/40",
                      !viewTrash && !canEdit ? "cursor-default opacity-90" : "",
                    ].join(" ")}
                    onClick={() => {
                      if (!viewTrash && canEdit) setEditing(r);
                    }}
                  >
                    <TD className="px-3 py-2 font-medium text-crm-text">
                      <Link
                        href={`/accounts/${r.id}`}
                        className={[
                          "hover:underline",
                          viewTrash ? "text-crm-muted pointer-events-none" : "text-crm-blue",
                        ].join(" ")}
                        onClick={(e) => e.stopPropagation()}
                        aria-disabled={viewTrash}
                        tabIndex={viewTrash ? -1 : undefined}
                      >
                        {r.name}
                      </Link>
                      {/* On `<md` we lose the segment/revenue columns — surface them inline as secondary text. */}
                      <div className="mt-0.5 text-xs text-crm-muted md:hidden">
                        {[r.segment, r.annualRevenue].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </TD>
                    <TD hideBelow="md" className="px-3 py-2">
                      {r.segment || "—"}
                    </TD>
                    <TD hideBelow="lg" className="px-3 py-2">
                      {r.owner || "—"}
                    </TD>
                    <TD hideBelow="md" className="px-3 py-2">
                      {r.annualRevenue || "—"}
                    </TD>
                    <TD hideBelow="lg" className="px-3 py-2">
                      {r.industry || "—"}
                    </TD>
                    <TD className="px-3 py-2">
                      <AccountStatusPill status={r.status} />
                    </TD>
                    {viewTrash && (
                      <TD className="px-3 py-2 text-xs text-crm-muted whitespace-nowrap">
                        <AccountDeletedAtCell value={r.deletedAt} />
                      </TD>
                    )}
                    {showActionsCol && (
                      <TD className="px-3 py-2 text-center">
                        <AccountRowActions
                          row={r}
                          viewTrash={viewTrash}
                          isAdmin={isAdmin}
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
        {!loading && total > 0 && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPage={setPage}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            onPageSizeChange={setPageSize}
            showPageNumbers
          />
        )}
      </div>

      <AccountAdvancedFilterModal
        open={showAdvanced}
        initial={filter}
        onClose={() => setShowAdvanced(false)}
        onApply={(p) => {
          setFilter(p);
          setPage(1);
        }}
        dynamicOptions={filterDynamicOptions}
      />

      <AccountFormPanel
        open={createOpen}
        mode="create"
        initial={null}
        onClose={() => setCreateOpen(false)}
        onSaved={({ id }) => {
          setCreateOpen(false);
          void load();
          router.push(`/accounts/${id}`);
        }}
      />

      <AccountFormPanel
        open={Boolean(editing)}
        mode="edit"
        initial={editing ? rowToInitial(editing) : null}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void load();
        }}
      />
    </PageContainer>
  );
}

function AccountRowActions({
  row,
  viewTrash,
  isAdmin,
  onDelete,
  onRestore,
  onPermanentDelete,
}: {
  row: AccountRowDto;
  viewTrash: boolean;
  isAdmin: boolean;
  onDelete: (row: AccountRowDto) => void;
  onRestore: (row: AccountRowDto) => void;
  onPermanentDelete: (row: AccountRowDto) => void;
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
          aria-label="Restore account"
          title="Restore — return to active accounts"
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
            aria-label="Permanently delete account"
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
      aria-label="Move account to trash"
      title="Move to Trash"
    >
      <Trash2 size={14} />
    </button>
  );
}

function AccountDeletedAtCell({ value }: { value: string | null }) {
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
  else if (diffDay < 30) rel = `${diffDay}d ago`;
  else rel = date.toLocaleDateString();
  return (
    <span title={date.toLocaleString()} className="cursor-default">
      {rel}
    </span>
  );
}
