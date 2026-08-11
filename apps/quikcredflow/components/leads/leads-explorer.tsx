"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { TrashBanner, useConfirm } from "@quikit/ui";
import { LeadTable } from "@/components/leads/lead-table";
import { usePermissions } from "@/hooks/use-permissions";
import { Table, TableScroll, THead, TBody, TR, TH } from "@/components/ui/table";
import { TableSkeletonRows } from "@/components/ui/skeleton";
import {
  fetchOwners,
  fetchPipelineConfig,
  invalidatePipelineConfigCache,
  prefetchLeadFormLookups,
} from "@/lib/cache/lead-form-lookups";
import { discardLeadFormDraft } from "@/lib/leads/lead-form-draft";

/** Fallback when workspace pipeline has not loaded — keep in sync with pipeline-config defaults. */
const FALLBACK_LEAD_STATUSES = ["Open", "Working", "Disqualified", "Converted"];
import { LeadsTabBar } from "@/components/leads/leads-tab-bar";
import { LeadsToolbar } from "@/components/leads/leads-toolbar";
import { SavedViewsBar } from "@/components/leads/saved-views-bar";
import { AdvancedFilterModal } from "@/components/filters/advanced-filter-modal";
import { BulkUpdateModal } from "@/components/leads/bulk-update-modal";
import { AppliedFilterSummary } from "@/components/filters/applied-filter-summary";
import { ColumnPickerModal } from "@/components/leads/column-picker-modal";
import { HiddenColumnsModal } from "@/components/leads/hidden-columns-modal";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import type { ConditionRow, FilterPayload, LeadSavedView } from "@/types/lead-filter";
import { LEAD_QUICK_SEARCH_FIELD } from "@/lib/services/leads/filter-constants";
import type { LeadFieldDefinition } from "@/types/field-definition";

const COLUMNS_STORAGE_KEY = "crm:leads:columns:v1";
const FROZEN_STORAGE_KEY = "crm:leads:frozen:v1";
const FILTER_STORAGE_KEY = "crm:leads:filter:v1";
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

/**
 * Merge a value-or-empty quick-filter field into the filter. Removes any prior
 * condition for that field, then adds the new one when a value is present.
 *
 * IMPORTANT: this PRESERVES the filter's existing matchMode (the ALL/ANY the
 * user chose in the advanced modal). It previously hardcoded matchMode:"ALL"
 * on every return, which silently reverted the user's ANY (OR) selection to ALL
 * on every compose — so the request always shipped matchMode:"ALL" and OR
 * filters behaved like AND. The quick filters (search/stage/mineOnly) are
 * additive narrowing conditions; they must not overwrite the user's match mode.
 */
function withQuickFilter(
  filter: FilterPayload,
  field: string,
  value: string,
  operator: ConditionRow["operator"],
): FilterPayload {
  const stripped = filter.conditions.filter((c) => c.field !== field);
  if (!value) return { ...filter, conditions: stripped };
  return { ...filter, conditions: [...stripped, { field, operator, value }] };
}

export function LeadsExplorer() {
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();
  const isAdmin = user?.role === "Administrator";
  const { can } = usePermissions();
  // Reflect the backend gate (assertModule "leads"/"delete") in the UI so users
  // without the grant don't see a Move-to-Trash button that would 403 on click.
  const canDeleteLeads = can("leads", "delete");

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
  // Bulk selection: ids the user has checkbox-selected, plus the Bulk Update
  // modal open state. Selection is cleared on filter/page/view change so a
  // stale id set can't leak across contexts (the ids wouldn't be visible).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);
  // Trash mode — when true, list shows only soft-deleted leads and row actions
  // swap to Restore + Permanent-delete (admin only).
  const [viewTrash, setViewTrash] = useState(false);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [stage, setStage] = useState("");
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
  // True once we've restored a persisted filter (or the user has applied/cleared
  // one) — tells loadViews NOT to auto-apply the default view over the user's
  // sticky choice (including an explicitly-cleared empty filter).
  const restoredFilterRef = useRef(false);

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
    // Restore the persisted advanced filter — it stays applied across navigation,
    // refresh, and sessions until the user Clears it, applies a new one, or picks
    // a saved view (persistFilterState writes on each of those). Setting
    // restoredFilterRef stops loadViews from auto-applying the default view over
    // a restored choice (including an explicitly-cleared empty filter).
    try {
      const rawFilter = window.localStorage.getItem(FILTER_STORAGE_KEY);
      if (rawFilter) {
        const parsed = JSON.parse(rawFilter) as { filter?: FilterPayload; activeViewId?: string | null };
        if (parsed?.filter && Array.isArray(parsed.filter.conditions)) {
          restoredFilterRef.current = true;
          setFilter(parsed.filter);
          setActiveViewId(parsed.activeViewId ?? null);
        }
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

  // Persist the active advanced filter + saved-view so it stays applied across
  // navigation / refresh / sessions. Written on every deliberate change: Apply,
  // Clear (pickView(null)), pick a saved view, and Save-as-view.
  function persistFilterState(f: FilterPayload, viewId: string | null) {
    try {
      window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({ filter: f, activeViewId: viewId }));
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
      if (activeViewId === null && filter.conditions.length === 0 && !restoredFilterRef.current) {
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
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load leads");
      } finally {
        setLoading(false);
      }
    },
    [toast],
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

  // Load lookups that Settings can change (pipeline stages/statuses, owners,
  // field defs). Extracted into a callback so it can re-run on navigation —
  // NOT just on mount. Busts the pipeline cache first so a stage/status edit in
  // Settings is reflected without a hard refresh. Mirrors lead-form.tsx's
  // reloadLookups pattern (the form already had this guard; the explorer didn't,
  // which is why changing pipeline config in Settings then returning to the
  // leads list showed stale stage/status options until a manual hard reload).
  const reloadLookups = useCallback(() => {
    // Load all field defs (standard + custom) so dynamic columns render and the picker can offer them
    fetch("/api/settings/fields", { credentials: "include" })
      .then((r) => r.json())
      .then((j) => setFieldDefs(Array.isArray(j?.items) ? j.items : []))
      .catch(() => {
        /* table falls back to default columns */
      });
    // Workspace pipeline + CRM users — same sources as the Add-lead form.
    invalidatePipelineConfigCache();
    void fetchPipelineConfig().then((cfg) => {
      if (cfg?.stages?.length) setStageOptions(cfg.stages);
      if (cfg?.statuses?.length) setStatusOptions(cfg.statuses);
    });
    void fetchOwners().then((owners) => {
      if (owners.length === 0) return;
      // Value = ownerId (matches Lead.ownerId); label = "Name (email)" so
      // same-named owners are distinguishable in the picker.
      setOwnerOptions(
        owners.map((o) => ({
          value: o.id,
          label: o.email ? `${o.name} (${o.email})` : o.name,
        })),
      );
    });
  }, []);

  useEffect(() => {
    loadViews();
    loadCounts();
    // Warm the Add-lead drawer's lookup cache (owners, sources, custom fields,
    // pipeline) so the form opens without "Loading…" placeholders. These are
    // small JSON payloads, fired once per page session.
    prefetchLeadFormLookups();
    reloadLookups();
  }, [loadViews, loadCounts, reloadLookups]);

  // Re-run lookups when the route changes (e.g. back from /settings/stages) or
  // when the page is restored from the bfcache/router cache without remounting.
  // Without this, App Router keeps the leads page mounted on client-side nav
  // back from Settings, so the mount-only effect above never re-fires and the
  // stage/status/owner options stay stale until a hard reload.
  useEffect(() => {
    // On RETURN to the list, re-run BOTH the lookups AND the leads list. The
    // list refetch is the fix for stale filtered results: any edit made while
    // away (on a lead's detail page, or in another tab) must cause the filter to
    // re-evaluate so leads that no longer match drop off (e.g. 100 -> 99). We
    // deliberately don't inspect which field changed — we just re-query, so it
    // works for every filter type (date/select/multiselect/text) and every edit.
    const onReturn = () => {
      reloadLookups();
      refetchListRef.current();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") onReturn();
    };
    window.addEventListener("pageshow", onReturn);
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("pageshow", onReturn);
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname, reloadLookups]);

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
      ownerId: ownerOptions,
      stage: toOpts(stages),
      status: toOpts(statuses),
    };
  }, [ownerOptions, stageOptions, statusOptions]);

  // Compose advanced filter + quick filters.
  //
  // Owner filtering is now owned entirely by the Advanced filter (keyed on
  // ownerId — see lead-filter-fields.ts). The toolbar no longer has an owner
  // dropdown; only the "Mine only" toggle remains, and it filters by ownerId =
  // the current user's id (robust — the old code matched a "First Last" string
  // against the display-only ownerName column, which silently missed on any
  // name mismatch). "Mine only" and the Advanced owner picker both target
  // ownerId; when "Mine only" is on it takes precedence (withQuickFilter strips
  // any prior ownerId condition first).
  const composed: FilterPayload = useMemo(() => {
    let f = filter;
    f = withQuickFilter(f, LEAD_QUICK_SEARCH_FIELD, debouncedSearch, "contains");
    // Only apply the quick "Any stage" dropdown when it is actually set. Calling
    // withQuickFilter with an EMPTY value strips every existing `stage` condition
    // (its strip-then-maybe-add contract) — which would silently delete a user's
    // ADVANCED "Stage equals X" condition, since the quick dropdown and the
    // advanced filter both target the same `stage` column. That was the bug:
    // advanced stage filters returned the WHOLE list because the empty quick
    // dropdown wiped them every compose. Status/custom fields have no quick-filter
    // twin, so they were unaffected. Guarding on a non-empty value preserves the
    // advanced stage condition; when the quick dropdown IS set it still takes
    // precedence (strips + replaces), matching how a quick filter should behave.
    if (stage) f = withQuickFilter(f, "stage", stage, "eq");
    if (mineOnly && user?.id) {
      f = withQuickFilter(f, "ownerId", user.id, "eq");
    }
    return f;
  }, [filter, debouncedSearch, stage, mineOnly, user]);

  // Always-current refetch of the visible list, held in a ref so the
  // return-to-page handlers (bound once) always re-run the LIVE filter/page/sort
  // instead of a stale closure snapshot.
  const refetchListRef = useRef<() => void>(() => {});
  refetchListRef.current = () => loadLeads(composed, page, pageSize, sort.by, sort.dir, viewTrash);

  // === Bulk selection handlers ===
  const toggleRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const togglePage = useCallback((ids: string[], allSelected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // Clear selection whenever the effective filter, page, or view changes — the
  // selected ids belong to a specific listing context; carrying them across a
  // filter/page change would let a bulk action target rows the user can no
  // longer see. (composed already folds in filter + quick filters + mineOnly.)
  useEffect(() => {
    setSelectedIds(new Set());
  }, [composed, page, pageSize, viewTrash]);

  useEffect(() => {
    if (!hydrated) return; // wait until persisted sort/cols have been restored to avoid a wasted default-sort fetch
    loadLeads(composed, page, pageSize, sort.by, sort.dir, viewTrash);
  }, [hydrated, composed, page, pageSize, sort.by, sort.dir, viewTrash, loadLeads]);

  // === Actions ===
  function pickView(view: LeadSavedView | null) {
    const nextFilter = view ? view.filter : EMPTY_FILTER;
    const nextViewId = view?.id ?? null;
    setActiveViewId(nextViewId);
    setFilter(nextFilter);
    // Picking a view — and Clear, which calls pickView(null) — becomes the new
    // sticky state. restoredFilterRef stops a later loadViews from overriding it.
    restoredFilterRef.current = true;
    persistFilterState(nextFilter, nextViewId);
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
      restoredFilterRef.current = true;
      persistFilterState(payload, json.id);
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

        {!viewTrash && selectedIds.size > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-crm-blue/30 bg-crm-blue-soft px-3 py-2 text-sm">
            <span className="font-medium text-crm-blue-dark">
              {selectedIds.size} selected
            </span>
            <button
              type="button"
              onClick={() => setShowBulkUpdate(true)}
              className="rounded-md bg-crm-blue px-3 py-1 text-xs font-semibold text-white transition hover:bg-crm-blue-dark"
            >
              Bulk Update
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="text-xs text-crm-muted hover:text-crm-text"
            >
              Clear selection
            </button>
            {total > items.length && (
              <span className="text-xs text-crm-muted">
                Tip: use “Select all {total} matching” inside Bulk Update to update every
                lead in this filter, across all pages.
              </span>
            )}
          </div>
        )}

        {!viewTrash && (
          <AppliedFilterSummary
            filter={filter}
            extraFields={filterExtraFields}
            dynamicOptions={filterDynamicOptions}
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
            onLeadDelete={canDeleteLeads ? softDeleteLead : undefined}
            onLeadRestore={restoreLead}
            onLeadPermanentDelete={permanentDeleteLead}
            onToggleFreeze={handleToggleFreeze}
            onHide={handleHideColumn}
            selectedIds={selectedIds}
            onToggleRow={toggleRow}
            onTogglePage={togglePage}
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
          restoredFilterRef.current = true;
          persistFilterState(p, null);
          setPage(1);
        }}
        onSave={saveView}
        dynamicOptions={filterDynamicOptions}
        extraFields={filterExtraFields}
      />

      <BulkUpdateModal
        open={showBulkUpdate}
        onClose={() => setShowBulkUpdate(false)}
        filter={composed}
        selectedIds={Array.from(selectedIds)}
        totalMatching={total}
        onDone={() => {
          clearSelection();
          refetchListRef.current();
          loadCounts();
        }}
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
