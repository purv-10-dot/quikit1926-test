"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { TrashBanner, useConfirm } from "@quikit/ui";
import { LeadTable } from "@/components/leads/lead-table";
import { Table, TableScroll, THead, TBody, TR, TH } from "@/components/ui/table";
import { TableSkeletonRows } from "@/components/ui/skeleton";
import {
  fetchOwners,
  fetchPipelineConfig,
  prefetchLeadFormLookups,
} from "@/lib/cache/lead-form-lookups";
import { discardLeadFormDraft } from "@/lib/leads/lead-form-draft";

/** Fallback when workspace pipeline has not loaded — keep in sync with pipeline-config defaults. */
const FALLBACK_LEAD_STATUSES = ["Open", "Working", "Disqualified", "Converted"];
import { LeadsTabBar } from "@/components/leads/leads-tab-bar";
import { LeadsToolbar } from "@/components/leads/leads-toolbar";
import { SavedViewsBar } from "@/components/leads/saved-views-bar";
import { AdvancedFilterModal } from "@/components/filters/advanced-filter-modal";
import { AppliedFilterSummary } from "@/components/filters/applied-filter-summary";
import { ColumnPickerModal } from "@/components/leads/column-picker-modal";
import { HiddenColumnsModal } from "@/components/leads/hidden-columns-modal";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import type { ConditionRow, FilterPayload, LeadSavedView } from "@/types/lead-filter";
import { LEAD_QUICK_SEARCH_FIELD } from "@/lib/services/leads/filter-engine";
import type { LeadFieldDefinition } from "@/types/field-definition";

const COLUMNS_STORAGE_KEY = "crm:leads:columns:v1";
const FROZEN_STORAGE_KEY = "crm:leads:frozen:v1";
const DEFAULT_COLUMNS = ["name", "company", "email", "phone", "stage", "status", "score", "ownerName"];

interface LeadRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  stage: string;
  status: string;
  score: number;
  ownerName: string | null;
  isStarred: boolean;
  mobile?: string | null;
  jobTitle?: string | null;
  source?: string | null;
  dynamicFields?: Record<string, unknown> | null;
  /** Populated only in trash view — used to render the "Deleted on" column. */
  deletedAt?: string | Date | null;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 10;
const EMPTY_FILTER: FilterPayload = { matchMode: "ALL", conditions: [] };

function readPageFromUrl(sp: URLSearchParams): number {
  const raw = Number(sp.get("page"));
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
}
function readPageSizeFromUrl(sp: URLSearchParams): number {
  const raw = Number(sp.get("limit"));
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(raw) ? raw : DEFAULT_PAGE_SIZE;
}

/** Merge a value-or-empty field into the filter (mode = ALL). Removes any prior condition for that field. */
function withQuickFilter(
  filter: FilterPayload,
  field: string,
  value: string,
  operator: ConditionRow["operator"],
): FilterPayload {
  const stripped = filter.conditions.filter((c) => c.field !== field);
  if (!value) return { ...filter, matchMode: "ALL", conditions: stripped };
  return { ...filter, matchMode: "ALL", conditions: [...stripped, { field, operator, value }] };
}

export function LeadsExplorer() {
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();
  const isAdmin = user?.role === "Administrator";

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // URL is the source of truth for page + pageSize so deep-links and the
  // browser back button stay in sync. Local state mirrors the URL and we
  // push updates via router.replace (no scroll jump, no full reload).
  const [filter, setFilter] = useState<FilterPayload>(EMPTY_FILTER);
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

  const [items, setItems] = useState<LeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Trash mode — when true, list shows only soft-deleted leads and row actions
  // swap to Restore + Permanent-delete (admin only).
  const [viewTrash, setViewTrash] = useState(false);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [stage, setStage] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [mineOnly, setMineOnly] = useState(false);

  const [views, setViews] = useState<LeadSavedView[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [ownerOptions, setOwnerOptions] = useState<{ value: string; label: string }[]>([]);

  // Field definitions + column visibility (persisted in localStorage).
  // Note: localStorage is read in a post-mount useEffect rather than via lazy
  // useState initializer — the latter is unsafe under SSR/hydration (server
  // renders defaults, then React keeps the SSR state on the client and the
  // stored values silently lose). See useEffect below.
  const [fieldDefs, setFieldDefs] = useState<LeadFieldDefinition[]>([]);
  const [stageOptions, setStageOptions] = useState<string[]>([]);
  const [statusOptions, setStatusOptions] = useState<string[]>([]);
  const [visibleCols, setVisibleCols] = useState<string[]>(DEFAULT_COLUMNS);
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const [hiddenColsOpen, setHiddenColsOpen] = useState(false);

  const [frozenCols, setFrozenCols] = useState<string[]>([]);
  const [sort, setSort] = useState<{ by: string; dir: "asc" | "desc" }>({ by: "createdAt", dir: "desc" });
  const [hydrated, setHydrated] = useState(false);

  // Sync local state from URL on back/forward navigation. Writes are pushed
  // through `writeUrl`, so when the URL changes via the browser we just mirror
  // it back into state — without this, hitting back would update the URL but
  // leave the table on the wrong page.
  useEffect(() => {
    const sp = new URLSearchParams(searchParams.toString());
    const nextPage = readPageFromUrl(sp);
    const nextSize = readPageSizeFromUrl(sp);
    setPageState((cur) => (cur === nextPage ? cur : nextPage));
    setPageSizeState((cur) => (cur === nextSize ? cur : nextSize));
  }, [searchParams]);

  // Hydrate persisted UI state from localStorage after mount.
  useEffect(() => {
    try {
      const rawCols = window.localStorage.getItem(COLUMNS_STORAGE_KEY);
      if (rawCols) {
        const parsed = JSON.parse(rawCols);
        if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) setVisibleCols(parsed);
      }
    } catch { /* ignore */ }
    try {
      const rawFrozen = window.localStorage.getItem(FROZEN_STORAGE_KEY);
      if (rawFrozen) {
        const parsed = JSON.parse(rawFrozen);
        if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) setFrozenCols(parsed);
      }
    } catch { /* ignore */ }
    // Sort is intentionally NOT restored from localStorage — it should reset to
    // default on every refresh, per product behavior.
    setHydrated(true);
  }, []);

  function persistVisibleCols(next: string[]) {
    setVisibleCols(next);
    try {
      window.localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore quota / private mode */
    }
  }
  function persistFrozenCols(next: string[]) {
    setFrozenCols(next);
    try {
      window.localStorage.setItem(FROZEN_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  function persistSort(by: string, dir: "asc" | "desc") {
    // In-memory only — sort resets on refresh by design.
    setSort({ by, dir });
  }

  function handleHideColumn(key: string) {
    persistVisibleCols(visibleCols.filter((k) => k !== key));
    // Also drop it from frozen so we don't keep stale state
    if (frozenCols.includes(key)) persistFrozenCols(frozenCols.filter((k) => k !== key));
  }
  function handleShowColumn(key: string) {
    if (!visibleCols.includes(key)) persistVisibleCols([...visibleCols, key]);
  }
  function handleToggleFreeze(key: string) {
    persistFrozenCols(
      frozenCols.includes(key) ? frozenCols.filter((k) => k !== key) : [...frozenCols, key],
    );
  }

  // === Loaders ===
  const loadViews = useCallback(async () => {
    try {
      const res = await fetch("/api/leads/saved-views", { credentials: "include" });
      if (!res.ok) return;
      const json = (await res.json()) as { items: LeadSavedView[] };
      setViews(json.items);
      if (activeViewId === null && filter.conditions.length === 0) {
        const def = json.items.find((v) => v.isDefault);
        if (def) {
          setActiveViewId(def.id);
          setFilter(def.filter);
        }
      }
    } catch {
      /* silent */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/leads/saved-views/counts", { credentials: "include" });
      if (!res.ok) return;
      const json = (await res.json()) as { counts: Record<string, number> };
      setCounts(json.counts);
    } catch {
      /* silent */
    }
  }, []);

  /**
   * Owner dropdown values are derived from the leads currently in scope —
   * cheap and avoids needing /api/users (which isn't exposed yet).
   * TODO(post-mvp): swap to GET /api/users when that endpoint lands.
   */
  const refreshOwnerOptions = useCallback((rows: LeadRow[]) => {
    const seen = new Map<string, string>();
    for (const r of rows) {
      if (r.ownerName && !seen.has(r.ownerName)) seen.set(r.ownerName, r.ownerName);
    }
    setOwnerOptions((prev) => {
      const merged = new Map(prev.map((o) => [o.value, o.label]));
      for (const [v, l] of seen) merged.set(v, l);
      return [...merged.entries()].map(([value, label]) => ({ value, label }));
    });
  }, []);

  const loadLeads = useCallback(
    async (
      f: FilterPayload,
      p: number,
      ps: number,
      sortBy: string,
      sortDir: "asc" | "desc",
      trash: boolean,
    ) => {
      setLoading(true);
      try {
        const url = trash ? "/api/leads/filter?onlyDeleted=true" : "/api/leads/filter";
        const res = await fetch(url, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filter: f, page: p, pageSize: ps, sortBy, sortDir }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Filter failed");
        setItems(json.items);
        setTotal(json.total);
        refreshOwnerOptions(json.items);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load leads");
      } finally {
        setLoading(false);
      }
    },
    [toast, refreshOwnerOptions],
  );

  // Soft delete (active mode → Move to Trash).
  const softDeleteLead = useCallback(
    async (lead: LeadRow) => {
      const ok = await confirm({
        title: "Move to Trash?",
        description: `"${lead.name}" will be moved to Trash. You can restore it later.`,
        confirmLabel: "Move to Trash",
        cancelLabel: "Cancel",
        tone: "warning",
      });
      if (!ok) return;
      try {
        const res = await fetch(`/api/leads/${lead.id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || "Delete failed");
        }
        toast.success("Lead moved to Trash");
        loadLeads(composed, page, pageSize, sort.by, sort.dir, viewTrash);
        loadCounts();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Delete failed");
      }
    },
    // composed/page/sort/viewTrash deps captured via closures; loadLeads is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [confirm, toast],
  );

  // Restore (trash mode → Restore).
  const restoreLead = useCallback(
    async (lead: LeadRow) => {
      try {
        const res = await fetch(`/api/leads/${lead.id}/restore`, {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || "Restore failed");
        }
        toast.success("Lead restored");
        loadLeads(composed, page, pageSize, sort.by, sort.dir, viewTrash);
        loadCounts();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Restore failed");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toast],
  );

  // Permanent delete (trash mode + admin only).
  const permanentDeleteLead = useCallback(
    async (lead: LeadRow) => {
      const ok = await confirm({
        title: "Permanently delete this lead?",
        description: `"${lead.name}" will be permanently removed. This cannot be undone.`,
        confirmLabel: "Permanently delete",
        cancelLabel: "Cancel",
        tone: "danger",
      });
      if (!ok) return;
      try {
        const res = await fetch(`/api/leads/${lead.id}/permanent`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || "Permanent delete failed");
        }
        toast.success("Lead permanently deleted");
        loadLeads(composed, page, pageSize, sort.by, sort.dir, viewTrash);
        loadCounts();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Permanent delete failed");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [confirm, toast],
  );

  useEffect(() => {
    loadViews();
    loadCounts();
    // Warm the Add-lead drawer's lookup cache (owners, sources, custom fields,
    // pipeline) so the form opens without "Loading…" placeholders. These are
    // small JSON payloads, fired once per page session.
    prefetchLeadFormLookups();
    // Load all field defs (standard + custom) so dynamic columns can render and the picker can offer them
    fetch("/api/settings/fields", { credentials: "include" })
      .then((r) => r.json())
      .then((j) => setFieldDefs(Array.isArray(j?.items) ? j.items : []))
      .catch(() => {
        /* table falls back to default columns */
      });
    // Workspace pipeline + CRM users — same sources as the Add-lead form.
    void fetchPipelineConfig().then((cfg) => {
      if (cfg?.stages?.length) setStageOptions(cfg.stages);
      if (cfg?.statuses?.length) setStatusOptions(cfg.statuses);
    });
    void fetchOwners().then((owners) => {
      if (owners.length === 0) return;
      setOwnerOptions((prev) => {
        const merged = new Map(prev.map((o) => [o.value, o.label]));
        for (const o of owners) merged.set(o.name, o.name);
        return [...merged.entries()].map(([value, label]) => ({ value, label }));
      });
    });
  }, [loadViews, loadCounts]);

  const filterExtraFields = useMemo(
    () =>
      fieldDefs
        .filter((d) => !d.isStandard)
        .map((d) => ({
          field: d.key,
          label: d.label,
          type:
            d.fieldType === "Number"
              ? ("number" as const)
              : d.fieldType === "Date"
              ? ("date" as const)
              : d.fieldType === "Boolean"
              ? ("boolean" as const)
              : d.fieldType === "Select" || d.fieldType === "MultiSelect"
              ? ("select" as const)
              : ("text" as const),
          options: d.options?.map((o) => ({ value: o, label: o })),
        })),
    [fieldDefs],
  );

  const filterDynamicOptions = useMemo(() => {
    const toOpts = (values: string[]) => values.map((v) => ({ value: v, label: v }));
    const stages =
      stageOptions.length > 0
        ? stageOptions
        : ["New", "Contacted", "Qualified", "Proposal", "Negotiation", "Closed"];
    const statuses = statusOptions.length > 0 ? statusOptions : FALLBACK_LEAD_STATUSES;
    return {
      ownerName: ownerOptions,
      stage: toOpts(stages),
      status: toOpts(statuses),
    };
  }, [ownerOptions, stageOptions, statusOptions]);

  // Compose advanced filter + quick filters
  const composed: FilterPayload = useMemo(() => {
    let f = filter;
    f = withQuickFilter(f, LEAD_QUICK_SEARCH_FIELD, debouncedSearch, "contains");
    f = withQuickFilter(f, "stage", stage, "eq");
    if (mineOnly && user?.id) {
      f = withQuickFilter(f, "ownerId", user.id, "eq");
    } else {
      f = withQuickFilter(f, "ownerName", ownerId, "eq");
    }
    return f;
  }, [filter, debouncedSearch, stage, ownerId, mineOnly, user]);

  useEffect(() => {
    if (!hydrated) return; // wait until persisted sort/cols have been restored to avoid a wasted default-sort fetch
    loadLeads(composed, page, pageSize, sort.by, sort.dir, viewTrash);
  }, [hydrated, composed, page, pageSize, sort.by, sort.dir, viewTrash, loadLeads]);

  // === Actions ===
  function pickView(view: LeadSavedView | null) {
    setActiveViewId(view?.id ?? null);
    setFilter(view ? view.filter : EMPTY_FILTER);
    setPage(1);
  }

  async function deleteView(id: string) {
    try {
      const res = await fetch(`/api/leads/saved-views/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Delete failed");
      if (activeViewId === id) pickView(null);
      toast.success("View deleted");
      loadViews();
      loadCounts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function saveView(payload: FilterPayload, name: string, isDefault: boolean) {
    try {
      const res = await fetch("/api/leads/saved-views", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, filter: payload, isDefault }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      toast.success(`Saved view "${name}"`);
      setActiveViewId(json.id);
      setFilter(payload);
      setPage(1);
      loadViews();
      loadCounts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  }

  return (
    <>
      <LeadsTabBar />

      <div className="crm-card p-2.5 sm:p-3 lg:p-4">
        {viewTrash && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-crm-border pb-3">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="text-base font-semibold text-crm-text">Trash</h1>
              <span className="inline-flex items-center rounded-full bg-crm-panel px-2 py-0.5 text-[11px] font-medium text-crm-muted">
                {total} in trash
              </span>
              <p className="ml-1 hidden text-xs text-crm-muted xl:block">
                Restore items or permanently remove with{" "}
                <span className="font-medium text-red-600">Delete forever</span>.
              </p>
            </div>
          </div>
        )}

        {viewTrash && (
          <div className="mb-3">
            <TrashBanner
              count={total}
              onExit={() => {
                setViewTrash(false);
                setPage(1);
              }}
            />
          </div>
        )}

        {/* Toolbar — top of card. Owns search, filters, column controls, and
         * the right-aligned primary actions (Trash + Add lead). */}
        <LeadsToolbar
          search={search}
          onSearchChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          stage={stage}
          onStageChange={(v) => {
            setStage(v);
            setPage(1);
          }}
          stageOptions={stageOptions}
          ownerId={ownerId}
          ownerOptions={ownerOptions}
          onOwnerChange={(v) => {
            setOwnerId(v);
            setPage(1);
          }}
          mineOnly={mineOnly}
          onMineOnlyChange={(v) => {
            setMineOnly(v);
            setPage(1);
          }}
          onOpenAdvanced={() => setShowAdvanced(true)}
          onOpenColumnPicker={() => setColPickerOpen(true)}
          onOpenHiddenColumns={() => setHiddenColsOpen(true)}
          hiddenCount={fieldDefs.filter((f) => !visibleCols.includes(f.key)).length}
          onAddLead={
            !viewTrash
              ? () => {
                  discardLeadFormDraft("create");
                  router.push("/leads/create");
                }
              : undefined
          }
          onOpenTrash={
            !viewTrash
              ? () => {
                  setViewTrash(true);
                  setPage(1);
                }
              : undefined
          }
          // In trash mode, only the search input is meaningful — collapse the
          // rest of the toolbar so users aren't confused by stage/owner/advanced
          // filters that don't conceptually apply to deleted records.
          compact={viewTrash}
        />

        {/* Saved views — second band. Hidden in trash mode (saved views apply
         * to active leads, not deleted ones). */}
        {!viewTrash && (
          <SavedViewsBar
            views={views}
            counts={counts}
            totalCount={total}
            activeId={activeViewId}
            onPick={pickView}
            onDelete={deleteView}
            onNewView={() => setShowAdvanced(true)}
          />
        )}

        {!viewTrash && (
          <AppliedFilterSummary
            filter={filter}
            extraFields={filterExtraFields}
            onClear={() => pickView(null)}
          />
        )}

        {loading && items.length === 0 ? (
          <div className="overflow-hidden rounded-lg border border-crm-border bg-white">
            <TableScroll minWidth={760} bleed={false}>
              <Table>
                <THead>
                  <TR>
                    {visibleCols.map((key) => (
                      <TH key={key} className="px-3 py-2 text-left">
                        <span className="inline-block h-2.5 w-16 animate-pulse rounded bg-crm-panel" />
                      </TH>
                    ))}
                  </TR>
                </THead>
                <TBody>
                  <TableSkeletonRows
                    columns={visibleCols.map(() => ({ widthClass: "w-24" }))}
                    rows={10}
                  />
                </TBody>
              </Table>
            </TableScroll>
          </div>
        ) : (
          <LeadTable
            items={items}
            total={total}
            page={page}
            pageSize={pageSize}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            onPageSizeChange={setPageSize}
            fieldDefs={fieldDefs}
            visibleKeys={visibleCols}
            sortBy={sort.by}
            sortDir={sort.dir}
            frozenKeys={frozenCols}
            onPageChange={setPage}
            onChanged={() => loadLeads(composed, page, pageSize, sort.by, sort.dir, viewTrash)}
            onSort={(key, dir) => {
              persistSort(key, dir);
              setPage(1);
            }}
            viewTrash={viewTrash}
            isAdmin={isAdmin}
            onLeadDelete={softDeleteLead}
            onLeadRestore={restoreLead}
            onLeadPermanentDelete={permanentDeleteLead}
            onToggleFreeze={handleToggleFreeze}
            onHide={handleHideColumn}
          />
        )}
      </div>

      <AdvancedFilterModal
        open={showAdvanced}
        initial={filter}
        onClose={() => setShowAdvanced(false)}
        onApply={(p) => {
          setFilter(p);
          setActiveViewId(null);
          setPage(1);
        }}
        onSave={saveView}
        dynamicOptions={filterDynamicOptions}
        extraFields={filterExtraFields}
      />

      <ColumnPickerModal
        open={colPickerOpen}
        onClose={() => setColPickerOpen(false)}
        available={fieldDefs}
        visibleKeys={visibleCols}
        onApply={persistVisibleCols}
      />

      <HiddenColumnsModal
        open={hiddenColsOpen}
        onClose={() => setHiddenColsOpen(false)}
        available={fieldDefs}
        visibleKeys={visibleCols}
        onShow={handleShowColumn}
      />
    </>
  );
}
