"use client";

/**
 * Critical Numbers — Execution module.
 *
 * Two pieces, both real, both driven by the same `useCriticalNumbers()`
 * fetch: an analytics section (category-by-tier chart, performance summary,
 * table, Recent Updates) built from `previewRecords` below, followed by the
 * card grid + create panel + append-only update modal. No trash/restore,
 * bulk actions, export or audit history, by design.
 *
 * Tier resolution runs client-side (`resolveTargetTier`, which delegates to
 * KPI's `getColorByPercentage`) so the gauge reflects the record without an
 * extra round-trip.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { ChevronDown, Gauge, History, Trash2, X } from "lucide-react";
import { AddButton, EmptyState, FilterPicker, Segmented, useConfirm } from "@quikit/ui";
import { useUsers } from "@/lib/hooks/useUsers";
import { useTeams } from "@/lib/hooks/useTeams";
import { useResourcePermissions } from "@/lib/hooks/useResourcePermissions";
import { useDebouncedTableSearch } from "@/lib/store";
import { notify } from "@/lib/utils/notify";
import { getMultiplier } from "@/lib/utils/currency";
import {
  resolveTargetTier,
  CRITICAL_TIER_LABELS,
  type CriticalTier,
} from "@/lib/utils/criticalNumberTiers";
import {
  CRITICAL_NUMBER_FREQUENCIES,
  type CriticalNumberFrequency,
} from "@/lib/schemas/criticalNumberSchema";
import { roundToDecimals } from "@/lib/utils/decimalPrecision";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { HorizontalScroller } from "@/components/ui/HorizontalScroller";
import {
  useCriticalNumbers,
  useCreateCriticalNumber,
  useDeleteCriticalNumber,
  useCriticalNumberOptions,
  useCreateSubCategory,
  useCreateCategoryFromCriticalNumber,
  useCriticalNumberTeamMembers,
  type CriticalNumberRow,
} from "@/lib/hooks/useCriticalNumbers";
import {
  CriticalNumberForm,
  EMPTY_FORM,
  type CriticalNumberFormValues,
} from "./components/CriticalNumberForm";
import { CriticalNumberCard } from "./components/CriticalNumberCard";
import { AddUpdateModal } from "./components/AddUpdateModal";
import { CriticalNumberDetailModal } from "./components/CriticalNumberDetailModal";
// Category chart, summary donut, table, and Recent Updates — now wired to
// real data (see `previewRecords` below). These components themselves were
// built against mock data in components/preview/mockData.ts; that file (and
// the mock-only detail popup) stay in place for reference/future use, just
// unrendered here now.
import type { PreviewCriticalNumber } from "./components/preview/types";
import { CategoryTierChart } from "./components/preview/CategoryTierChart";
import { PerformanceSummaryCard } from "./components/preview/PerformanceSummaryCard";
import { CriticalNumbersTable } from "./components/preview/CriticalNumbersTable";
import { RecentUpdatesCard } from "./components/preview/RecentUpdatesCard";
import { buildFilterSummaryLabel } from "@/lib/utils/filterSummary";
import { FilterSummaryButton } from "@/components/filters/FilterSummaryButton";

const FREQUENCY_LABELS: Record<CriticalNumberFrequency, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
};

/** Descending health order, matching the gauge/table legend. `CRITICAL_TIER_LABELS`
 *  is a Record (unordered), so the filter's row order is pinned here. */
const TIER_ORDER: CriticalTier[] = ["great", "good", "concerned", "bad"];

/** "" → null, otherwise a finite number (or null if unparseable). */
function num(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default function CriticalNumbersPage() {
  const { canCreate, canDelete } = useResourcePermissions("CriticalNumber");
  const { data: items = [], isLoading, error } = useCriticalNumbers();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id as string | undefined;
  const { data: teams = [] } = useTeams();
  const { data: users = [] } = useUsers();
  const { data: options } = useCriticalNumberOptions();
  const createMutation = useCreateCriticalNumber();
  const createSubCategory = useCreateSubCategory();
  const createCategory = useCreateCategoryFromCriticalNumber();
  const deleteMutation = useDeleteCriticalNumber();
  const confirm = useConfirm();

  const [panelOpen, setPanelOpen] = useState(false);
  const [form, setForm] = useState<CriticalNumberFormValues>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof CriticalNumberFormValues, string>>>({});
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  /** Row clicked in the table → read-only detail modal. Held by id so the
   *  modal always reflects the latest fetched record, not a stale snapshot. */
  const [detailId, setDetailId] = useState<string | null>(null);
  /** Table scope toggle. "all" by default — same wording/behaviour as the
   *  Goals list's own Mine/All filter, matched on `ownerId`. */
  const [tableScope, setTableScope] = useState<"all" | "mine">("all");
  /** Recent Updates activity feed, opened from the header button. */
  const [recentOpen, setRecentOpen] = useState(false);
  /**
   * Collapsed department sections, by name. `null` means "user hasn't touched
   * this yet" — the default (every department closed except the first) is then
   * DERIVED from the current groups rather than seeded into state, so it still
   * applies when `items` arrives asynchronously after first render.
   */
  const [collapsedOverride, setCollapsedOverride] = useState<Set<string> | null>(null);
  // Search is debounced + persisted via the shared tables slice (lib/store),
  // same as WWW/KPI/Priority. `searchInput` is the controlled input value;
  // `search` is the debounced value the match logic below reads.
  const [searchInput, setSearchInput, search] = useDebouncedTableSearch("criticalNumbers");
  // Table filters, all multi-select. An EMPTY array means "no filter" (matching
  // FilterPicker's own convention, which renders `allLabel` for that) — not
  // "match nothing", so the pickers deliberately omit `allMeansEvery`.
  const [filterTeams, setFilterTeams] = useState<string[]>([]);
  const [filterCategories, setFilterCategories] = useState<string[]>([]);
  const [filterSubCategories, setFilterSubCategories] = useState<string[]>([]);
  const [filterFrequencies, setFilterFrequencies] = useState<string[]>([]);
  const [filterTiers, setFilterTiers] = useState<string[]>([]);
  // Filter dropdown, same button+panel pattern as the WWW page.
  const [showFilter, setShowFilter] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // Close the filter dropdown on outside click — mirrors WWW's own effect.
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilter(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // Adapter for the category chart / summary donut / table / Recent Updates
  // — same mapping pattern the real `CriticalNumberCard` usage below already
  // uses (`category?.name ?? ...`, etc.), just shaped to `PreviewCriticalNumber`
  // instead of that card's own prop type. `createdByName` (resolved server-side
  // from the raw `createdBy` id) becomes `history[].createdBy` here — these
  // components display names, not ids, matching the mock data's own field.
  const previewRecords: PreviewCriticalNumber[] = useMemo(
    () =>
      items.map((row) => ({
        id: row.id,
        title: row.title,
        categoryName: row.category?.name ?? "Uncategorised",
        subCategoryName: row.subCategory?.name ?? null,
        teamName: row.team?.name ?? "No department",
        frequency: row.frequency,
        measurementUnit: row.measurementUnit,
        unit: row.unit,
        currency: row.currency,
        targetScale: row.targetScale,
        targetValue: row.targetValue,
        currentValue: row.currentValue,
        history: row.updates.map((u) => ({
          date: u.date,
          value: u.value,
          comment: u.comment,
          createdBy: u.createdByName ?? undefined,
        })),
      })),
    [items],
  );

  // Search + table filters, applied against `items` (which carries the ids,
  // enums, owner and raw values the controls select on — `PreviewCriticalNumber`
  // has no owner or ids) and then intersected with `previewRecords` by id,
  // rather than widening that shape or duplicating the mapper above. The charts
  // and Recent Updates deliberately stay org-wide; only the table responds.
  //
  // Split in two so each scope's count can reflect the OTHER constraints: the
  // search/filter matches are computed once, then scope is applied on top.
  const searchLc = search.trim().toLowerCase();

  const dropdownMatchedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const i of items) {
      // Every filter group ANDs with the others; within a group, the selected
      // values OR together (an empty group is "no constraint", not "none").
      if (filterTeams.length && !filterTeams.includes(i.teamId)) continue;
      if (filterCategories.length && !filterCategories.includes(i.categoryId)) continue;
      // A record with no sub-category can never satisfy a sub-category filter.
      if (filterSubCategories.length && !(i.subCategoryId && filterSubCategories.includes(i.subCategoryId)))
        continue;
      if (filterFrequencies.length && !filterFrequencies.includes(i.frequency)) continue;
      if (filterTiers.length) {
        // Same resolver the gauge/table/chart use, so a row's Status column and
        // this filter can never disagree. Records with no value or no target
        // resolve to `null` and are excluded whenever a tier is being filtered.
        const { tier } = resolveTargetTier({
          currentValue: i.currentValue,
          targetValue: i.targetValue,
        });
        if (!tier || !filterTiers.includes(tier)) continue;
      }
      if (searchLc) {
        // Title, Category, Owner — plus Sub Category, because the table renders
        // it inside the same "Category / Sub Category" cell, and a term visible
        // on screen returning no rows reads as a bug.
        const ownerName = i.owner ? `${i.owner.firstName} ${i.owner.lastName}`.trim() : "";
        const haystack = [
          i.title,
          i.category?.name ?? "",
          i.subCategory?.name ?? "",
          ownerName,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(searchLc)) continue;
      }
      ids.add(i.id);
    }
    return ids;
  }, [
    items,
    filterTeams,
    filterCategories,
    filterSubCategories,
    filterFrequencies,
    filterTiers,
    searchLc,
  ]);

  const myIdsWithinDropdowns = useMemo(
    () => new Set(items.filter((i) => i.ownerId === currentUserId && dropdownMatchedIds.has(i.id)).map((i) => i.id)),
    [items, currentUserId, dropdownMatchedIds],
  );

  const tableRecords = useMemo(() => {
    const allowed = tableScope === "mine" ? myIdsWithinDropdowns : dropdownMatchedIds;
    return previewRecords.filter((r) => allowed.has(r.id));
  }, [tableScope, previewRecords, dropdownMatchedIds, myIdsWithinDropdowns]);

  // Sub-categories narrow to the selected categories, same parent/child rule the
  // create form applies (`visibleSubs`). With NO category selected the full list
  // stays available, so the filter is usable on its own rather than being a dead
  // control until a category is picked.
  const filterableSubCategories = useMemo(() => {
    const subs = options?.subCategories ?? [];
    return filterCategories.length
      ? subs.filter((s) => filterCategories.includes(s.categoryId))
      : subs;
  }, [options?.subCategories, filterCategories]);

  /** Narrowing the categories can orphan already-picked sub-categories; drop
   *  those rather than silently ANDing an unreachable pair down to zero rows. */
  function applyCategoryFilter(next: string[]) {
    setFilterCategories(next);
    if (!next.length) return;
    const allowed = new Set(
      (options?.subCategories ?? []).filter((s) => next.includes(s.categoryId)).map((s) => s.id),
    );
    setFilterSubCategories((prev) => prev.filter((id) => allowed.has(id)));
  }

  const filterGroups = [
    filterTeams,
    filterCategories,
    filterSubCategories,
    filterFrequencies,
    filterTiers,
  ];
  /** Count of ACTIVE filter groups — drives the "N filters" button label, the
   *  same convention the WWW page uses. Search is shown separately. */
  const activeFilterCount = filterGroups.filter((g) => g.length > 0).length;
  const activeFilterLabel = useMemo(() => buildFilterSummaryLabel([
    { label: "Department", values: filterTeams.map(id => teams.find(t => t.id === id)?.name).filter((n): n is string => Boolean(n)) },
    { label: "Category", values: filterCategories.map(id => options?.categories?.find(c => c.id === id)?.name).filter((n): n is string => Boolean(n)) },
    { label: "Sub Category", values: filterSubCategories.map(id => options?.subCategories?.find(s => s.id === id)?.name).filter((n): n is string => Boolean(n)) },
    { label: "Status", values: filterTiers.map(t => CRITICAL_TIER_LABELS[t as CriticalTier]).filter((n): n is string => Boolean(n)) },
    { label: "Frequency", values: filterFrequencies.map(f => FREQUENCY_LABELS[f as CriticalNumberFrequency]).filter((n): n is string => Boolean(n)) },
  ]), [filterTeams, teams, filterCategories, options?.categories, filterSubCategories, options?.subCategories, filterTiers, filterFrequencies]);
  /** Search counts here: it decides whether an empty table means "no matches"
   *  vs. "nothing created yet". */
  const anyFilterActive = activeFilterCount > 0 || searchLc !== "";
  function clearFilters() {
    setFilterTeams([]);
    setFilterCategories([]);
    setFilterSubCategories([]);
    setFilterFrequencies([]);
    setFilterTiers([]);
  }

  const pickerUsers = useMemo(
    () =>
      users.map((u) => ({
        id: u.id,
        firstName: u.firstName ?? "",
        lastName: u.lastName ?? "",
        email: u.email ?? "",
      })),
    [users],
  );

  /**
   * Owner candidates for the Department currently chosen in the create form.
   *
   * Separate from `pickerUsers` above, which stays the full org list because the
   * detail modal uses it to RESOLVE an existing owner's name — narrowing that
   * one would blank the owner on any record whose team membership has since
   * changed.
   */
  const { data: teamMembers = [], isSuccess: teamMembersLoaded } =
    useCriticalNumberTeamMembers(form.teamId || undefined);

  const ownerPickerUsers = useMemo(
    () =>
      teamMembers.map((u) => ({
        id: u.id,
        firstName: u.firstName ?? "",
        lastName: u.lastName ?? "",
        email: u.email ?? "",
      })),
    [teamMembers],
  );

  /**
   * Drop an owner who isn't eligible for the newly chosen Department, rather
   * than leaving a stale name in the field for the API to reject with
   * "Owner must be a member of the selected team".
   *
   * Gated on `isSuccess` specifically — not on `!isLoading` — so a failed or
   * still-in-flight fetch can't be mistaken for "the list is empty, clear it".
   */
  useEffect(() => {
    if (!teamMembersLoaded || !form.ownerId) return;
    if (teamMembers.some((u) => u.id === form.ownerId)) return;
    setForm((f) => ({ ...f, ownerId: "" }));
  }, [teamMembersLoaded, teamMembers, form.ownerId]);

  function patch(p: Partial<CriticalNumberFormValues>) {
    setForm((f) => ({ ...f, ...p }));
    setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(p)) delete next[k as keyof CriticalNumberFormValues];
      return next;
    });
  }

  function openPanel() {
    setForm(EMPTY_FORM);
    setErrors({});
    setPanelOpen(true);
  }

  /**
   * The form's Target Value is entered in the chosen scale unit for Currency
   * metrics (e.g. 10 + "Lakh"); everything downstream — the API, the gauge,
   * the analytics section — stores and reads the RAW number. Mirrors KPI's
   * own `actualNum` in KPIModal.tsx.
   */
  function scaledTargetValue(): number {
    const entered = num(form.targetValue) as number;
    if (form.measurementUnit !== "Currency" || !form.currency || !form.targetScale) return entered;
    // Rounded because the multiply introduces binary-float noise that the
    // schema's 2-decimal rule would otherwise reject: "0.07" + Lakh yields
    // 7000.000000000001. Scaling can only reduce the decimal count, so this is
    // lossless for the ≤2-decimal input the field now allows.
    return roundToDecimals(entered * getMultiplier(form.currency, form.targetScale));
  }

  /** Client-side mirror of the server rules — the API re-validates regardless. */
  function validate(): boolean {
    const e: Partial<Record<keyof CriticalNumberFormValues, string>> = {};
    if (!form.title.trim()) e.title = "Title is required";
    if (!form.ownerId) e.ownerId = "Owner is required";
    if (!form.teamId) e.teamId = "Department is required";
    if (!form.categoryId) e.categoryId = "Category is required";
    if (!form.measurementUnit) e.measurementUnit = "Measurement unit is required";
    // The type alone isn't a complete answer without knowing WHICH currency —
    // same conditional-required rule the API enforces via its Zod refine.
    if (form.measurementUnit === "Currency" && !form.currency) e.currency = "Currency is required";
    if (!form.frequency) e.frequency = "Frequency is required";
    // Required, not merely positive: zero is a legitimate target for a metric
    // being driven down, and the bands handle it the same way KPI does.
    if (num(form.targetValue) === null) e.targetValue = "Target value is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit() {
    if (!validate()) return;
    try {
      await createMutation.mutateAsync({
        title: form.title.trim(),
        teamId: form.teamId,
        ownerId: form.ownerId,
        categoryId: form.categoryId,
        subCategoryId: form.subCategoryId || null,
        measurementUnit: form.measurementUnit as Exclude<
          CriticalNumberFormValues["measurementUnit"],
          ""
        >,
        // The API force-nulls these for the "wrong" measurement type anyway;
        // sending null keeps the request honest about what it means.
        unit: form.measurementUnit === "Number" ? form.unit || null : null,
        currency: form.measurementUnit === "Currency" ? form.currency || null : null,
        targetScale: form.measurementUnit === "Currency" ? form.targetScale || null : null,
        frequency: form.frequency as Exclude<CriticalNumberFormValues["frequency"], "">,
        // The form's Target Value is in the chosen SCALE UNIT (10 + "Lakh"),
        // same as KPI's own target field — multiply up to the raw number the
        // API stores, mirroring KPIModal's `actualNum`. Without this, "10
        // Lakh" was stored as a literal 10, which then displayed as "₹0 Lakh"
        // once the card scaled that 10 back down for display.
        targetValue: scaledTargetValue(),
      });
      notify.success("Critical Number created");
      setPanelOpen(false);
    } catch (err) {
      // Cap (409), owner-not-member (400) and category/sub-category mismatches
      // all surface here with the server's own wording — those rules can only
      // be enforced server-side.
      notify.error(err, {
        context: "Critical Number",
        fallback: "Couldn't create that Critical Number.",
      });
    }
  }

  /**
   * Inline "+ New Category". The form hides the affordance until a Measurement
   * Unit is chosen, so this guard just narrows away the "" case — every real
   * unit is a valid CategoryMaster `dataType`.
   */
  async function addCategory(name: string) {
    if (form.measurementUnit === "") return;
    try {
      const created = await createCategory.mutateAsync({ name, measurementUnit: form.measurementUnit });
      patch({ categoryId: created.id, subCategoryId: "" });
      notify.success("Category added");
    } catch (err) {
      notify.error(err, { context: "Category", fallback: "Couldn't add that category." });
    }
  }

  /** Inline "+ New Sub Category". Selects the new row so the user isn't left
      staring at an unchanged dropdown. */
  async function addSubCategory(name: string) {
    if (!form.categoryId) return;
    try {
      const created = await createSubCategory.mutateAsync({
        categoryId: form.categoryId,
        name,
      });
      patch({ subCategoryId: created.id });
      notify.success("Sub category added");
    } catch (err) {
      notify.error(err, {
        context: "Sub category",
        fallback: "Couldn't add that sub category.",
      });
    }
  }

  async function remove(row: CriticalNumberRow) {
    const ok = await confirm({
      title: `Delete "${row.title}"?`,
      description: "Its update history will be deleted too. This cannot be undone.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteMutation.mutateAsync(row.id);
      notify.success("Critical Number deleted");
    } catch (err) {
      notify.error(err, { context: "Critical Number", fallback: "Couldn't delete that." });
    }
  }

  /**
   * Worst-first ordering for the grouped view. A dashboard's job is "what needs
   * attention", and the flat grid's createdAt-desc answers "what did we add
   * last" — which is why a new record lands on top and pushes everything down.
   * Records with no resolvable tier (no data / no target) sort last: they aren't
   * off track, they're unmeasured.
   */
  const TIER_RANK: Record<string, number> = { bad: 0, concerned: 1, good: 2, great: 3 };
  function attentionRank(row: CriticalNumberRow): number {
    return TIER_RANK[resolveTargetTier(row).tier ?? ""] ?? 4;
  }

  const cardGroups = useMemo(() => {
    const byDept = new Map<string, CriticalNumberRow[]>();
    for (const row of items) {
      const key = row.team?.name ?? "No department";
      const bucket = byDept.get(key);
      if (bucket) bucket.push(row);
      else byDept.set(key, [row]);
    }
    return [...byDept.entries()]
      .map(([name, rows]) => ({
        name,
        rows: [...rows].sort((a, b) => attentionRank(a) - attentionRank(b)),
        // "On track" = met or beat target. Near/Below both read as needing
        // attention, which is what the header count is for.
        onTrack: rows.filter((r) => {
          const t = resolveTargetTier(r).tier;
          return t === "good" || t === "great";
        }).length,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  /** Only the first department is open until the user says otherwise. */
  const collapsedGroups =
    collapsedOverride ?? new Set(cardGroups.slice(1).map((g) => g.name));

  function toggleGroup(name: string) {
    const next = new Set(collapsedGroups);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setCollapsedOverride(next);
  }

  /** One card + its hover delete affordance. Shared by the flat and grouped
   *  layouts so the two can't drift apart. */
  function renderCard(row: CriticalNumberRow) {
    return (
      <div key={row.id} className="relative group">
        <CriticalNumberCard
          record={{
            ...row,
            teamName: row.team?.name,
            ownerName: row.owner ? `${row.owner.firstName} ${row.owner.lastName}`.trim() : undefined,
            categoryName: row.category?.name ?? null,
            subCategoryName: row.subCategory?.name ?? null,
          }}
          onAddUpdate={() => setUpdatingId(row.id)}
          onOpenDetail={() => setDetailId(row.id)}
        />
        {canDelete && (
          <button
            type="button"
            onClick={() => remove(row)}
            title="Delete"
            aria-label={`Delete ${row.title}`}
            className="absolute top-3 right-3 p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  const updatingRow = items.find((i) => i.id === updatingId) ?? null;
  const detailRow = items.find((i) => i.id === detailId) ?? null;

  return (
    <div className="px-4 sm:px-6 py-5 space-y-5">
      {/* Header + "Add Critical Number" always come first — the primary
          action shouldn't sit below a whole analytics section once one
          exists. */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Critical Numbers</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            The handful of metrics that decide the quarter. Up to five per team.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Quick access to the activity feed. It used to sit as a full-width
              card at the bottom of the page, which pushed the card grid further
              down for something read occasionally rather than continuously.
              Hidden with zero records — the popup would only say "no updates". */}
          {items.length > 0 && (
            <button
              type="button"
              onClick={() => setRecentOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-gray-800 transition-colors"
            >
              <History className="h-3.5 w-3.5" />
              Recent Updates
            </button>
          )}
          {canCreate && <AddButton onClick={openPanel}>Add Critical Number</AddButton>}
        </div>
      </div>

      {/* Category chart, summary donut, table, and Recent Updates — real
          data via `previewRecords` above (built from `useCriticalNumbers()`,
          same as the real card grid below). Hidden entirely with zero real
          Critical Numbers (also true while `items` is still loading, since
          `useCriticalNumbers()` defaults it to `[]`) — the "No Critical
          Numbers yet" empty state below is the only thing shown then. */}
      {items.length > 0 && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 h-full">
              <CategoryTierChart records={previewRecords} />
            </div>
            <div className="h-full">
              <PerformanceSummaryCard records={previewRecords} />
            </div>
          </div>

          {/* Scope toggle + search + filters, one row. Counts on the toggle
              reflect the search and every filter, so each label previews
              exactly what clicking it shows. */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Segmented
              value={tableScope}
              onChange={setTableScope}
              options={[
                { value: "all", label: `All Critical Numbers (${dropdownMatchedIds.size})` },
                { value: "mine", label: `My Critical Numbers (${myIdsWithinDropdowns.size})` },
              ]}
              className="w-auto shrink-0"
            />

            <div className="flex items-center gap-2 flex-wrap">
              {/* Search — same control and debounce the WWW page uses. Matches
                  Title / Category / Sub Category / Owner (see `dropdownMatchedIds`). */}
              <div className="relative">
                <svg
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <input
                  type="text"
                  placeholder="Search..."
                  aria-label="Search Critical Numbers"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-accent-400 w-44"
                />
              </div>

              {/* Filter button + panel. Five multi-selects would overrun the row
                  inline once their chips render, so they live in the same
                  dropdown the WWW page uses, with the same "N filters" label. */}
              <div className="relative" ref={filterRef}>
                <FilterSummaryButton
                  label={activeFilterLabel}
                  active={activeFilterCount > 0}
                  open={showFilter}
                  onClick={() => setShowFilter((o) => !o)}
                  maxWidthClass="max-w-[260px]"
                />

                {/* No `overflow-*` on the panel, deliberately (same as WWW's):
                    each FilterPicker's dropdown is absolutely positioned, and a
                    scroll container would clip it. Panel height stays bounded
                    because the chip rows scroll internally. */}
                {showFilter && (
                  <div className="absolute top-full right-0 mt-1.5 w-72 bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-4 space-y-4">
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                        Department
                      </p>
                      <FilterPicker
                        multiple
                        values={filterTeams}
                        onChangeMultiple={setFilterTeams}
                        options={teams.map((t) => ({ value: t.id, label: t.name }))}
                        allLabel="All Departments"
                      />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                        Category
                      </p>
                      <FilterPicker
                        multiple
                        values={filterCategories}
                        onChangeMultiple={applyCategoryFilter}
                        options={(options?.categories ?? []).map((c) => ({
                          value: c.id,
                          label: c.name,
                        }))}
                        allLabel="All Categories"
                      />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                        Sub Category
                      </p>
                      <FilterPicker
                        multiple
                        values={filterSubCategories}
                        onChangeMultiple={setFilterSubCategories}
                        options={filterableSubCategories.map((s) => ({
                          value: s.id,
                          label: s.name,
                        }))}
                        allLabel="All Sub Categories"
                      />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                        Status
                      </p>
                      <FilterPicker
                        multiple
                        values={filterTiers}
                        onChangeMultiple={setFilterTiers}
                        options={TIER_ORDER.map((t) => ({
                          value: t,
                          label: CRITICAL_TIER_LABELS[t],
                        }))}
                        allLabel="All Statuses"
                      />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                        Frequency
                      </p>
                      <FilterPicker
                        multiple
                        values={filterFrequencies}
                        onChangeMultiple={setFilterFrequencies}
                        options={CRITICAL_NUMBER_FREQUENCIES.map((f) => ({
                          value: f,
                          label: FREQUENCY_LABELS[f],
                        }))}
                        allLabel="All Frequencies"
                      />
                    </div>
                    {activeFilterCount > 0 && (
                      <button
                        type="button"
                        onClick={clearFilters}
                        className="w-full text-xs text-gray-500 hover:text-gray-800 py-1 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <CriticalNumbersTable
            records={tableRecords}
            onRowClick={(r) => setDetailId(r.id)}
            emptyMessage={
              anyFilterActive
                ? searchLc && activeFilterCount === 0
                  ? `No Critical Numbers match "${search.trim()}".`
                  : "No Critical Numbers match these filters."
                : tableScope === "mine"
                  ? "You don't own any Critical Numbers yet."
                  : undefined
            }
          />
        </>
      )}

      {isLoading ? (
        <TableSkeleton />
      ) : error ? (
        <EmptyState
          icon={Gauge}
          title="Couldn't load Critical Numbers"
          message={(error as Error).message}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Gauge}
          title="No Critical Numbers yet"
          message="Track the few numbers that matter most this quarter, scored against their targets on the same colour scale as KPIs."
          {...(canCreate
            ? { action: { label: "Add Critical Number", onClick: openPanel } }
            : {})}
        />
      ) : (
        <div className="space-y-4">
          {/* Names the section, so the cards below aren't mistaken for more of
              the table above and the department headers have context. */}
          <div className="pt-1">
            <h2 className="text-base font-semibold text-gray-900">Department Breakdown</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Every Critical Number grouped by the department that owns it, most urgent first.
            </p>
          </div>

          <div className="space-y-5">
              {cardGroups.map((group) => {
                const collapsed = collapsedGroups.has(group.name);
                const needsAttention = group.rows.length - group.onTrack;
                return (
                  <section key={group.name}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.name)}
                      aria-expanded={!collapsed}
                      className="w-full flex items-center gap-2 py-2 border-b border-gray-200 text-left group/hdr"
                    >
                      <ChevronDown
                        className={`h-4 w-4 text-gray-400 transition-transform ${collapsed ? "-rotate-90" : ""}`}
                      />
                      <span className="text-sm font-semibold text-gray-900">{group.name}</span>
                      <span className="text-xs text-gray-400 tabular-nums">
                        {group.rows.length}
                      </span>
                      <span className="ml-auto text-xs text-gray-500 tabular-nums">
                        {needsAttention > 0 ? (
                          <span className="text-gray-700">
                            {needsAttention} need{needsAttention === 1 ? "s" : ""} attention
                          </span>
                        ) : (
                          "All on track"
                        )}
                      </span>
                    </button>
                    {!collapsed && (
                      // One horizontal row per department rather than a
                      // wrapping grid: a department with 9 numbers used to grow
                      // three rows tall and push every later department off
                      // screen. Four are visible at a time; the rest are a drag
                      // (or swipe) away on the scroller's own progress bar.
                      // `w-full` on the flex row is load-bearing — it pins the
                      // row to the viewport width so the children's percentage
                      // widths resolve against what's VISIBLE, then overflow it.
                      <HorizontalScroller className="mt-4" innerClassName="pb-1">
                        <div className="flex gap-4 w-full">
                          {group.rows.map((row) => (
                            <div
                              key={row.id}
                              className="flex-none w-[85%] sm:w-[calc((100%-1rem)/2)] lg:w-[calc((100%-2rem)/3)] xl:w-[calc((100%-3rem)/4)]"
                            >
                              {renderCard(row)}
                            </div>
                          ))}
                        </div>
                      </HorizontalScroller>
                    )}
                  </section>
                );
              })}
          </div>
        </div>
      )}

      {/* Recent Updates popup — same overlay construction as the create panel
          below. `RecentUpdatesCard` brings its own card chrome and scrolls its
          list internally, so it's dropped in as-is with a taller `height` than
          the in-page default it used to get. */}
      {recentOpen && (
        <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setRecentOpen(false)}
          />
          <div className="relative w-full max-w-2xl my-8">
            <button
              type="button"
              onClick={() => setRecentOpen(false)}
              aria-label="Close recent updates"
              className="absolute -top-2 -right-2 z-10 h-7 w-7 flex items-center justify-center rounded-full bg-white border border-gray-200 text-gray-500 shadow-sm hover:text-gray-800 hover:bg-gray-50 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <RecentUpdatesCard records={previewRecords} height={560} />
          </div>
        </div>
      )}

      {/* Create panel */}
      {panelOpen && (
        <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 overflow-y-auto">
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setPanelOpen(false)} />
          <div className="relative w-full max-w-2xl my-8">
            <CriticalNumberForm
              values={form}
              onChange={patch}
              errors={errors}
              // Owner list is scoped to the chosen Department; the detail modal
              // below still gets the full org list for name resolution.
              users={ownerPickerUsers}
              teams={teams.map((t) => ({ id: t.id, name: t.name }))}
              categories={options?.categories ?? []}
              subCategories={options?.subCategories ?? []}
              units={(options?.units ?? []).map((u) => u.name)}
              onCreateCategory={addCategory}
              creatingCategory={createCategory.isPending}
              onCreateSubCategory={addSubCategory}
              creatingSubCategory={createSubCategory.isPending}
              onCancel={() => setPanelOpen(false)}
              onSubmit={submit}
              submitting={createMutation.isPending}
            />
          </div>
        </div>
      )}

      {updatingRow && (
        <AddUpdateModal
          criticalNumberId={updatingRow.id}
          title={updatingRow.title}
          // Lets the Value field match the record's own terms — ₹ + a
          // Thousand/Lakh/Crore selector for Currency, %/x/unit otherwise.
          measurementUnit={updatingRow.measurementUnit}
          currency={updatingRow.currency}
          targetScale={updatingRow.targetScale}
          unit={updatingRow.unit}
          onClose={() => setUpdatingId(null)}
        />
      )}

      {/* Row-click detail modal. Suppressed while `AddUpdateModal` is open —
          that modal is launched FROM here, and stacking both would leave the
          detail view sitting behind its own child. */}
      {detailRow && !updatingRow && (
        <CriticalNumberDetailModal
          record={detailRow}
          users={pickerUsers}
          teams={teams.map((t) => ({ id: t.id, name: t.name }))}
          categories={options?.categories ?? []}
          subCategories={options?.subCategories ?? []}
          onClose={() => setDetailId(null)}
          onAddUpdate={() => setUpdatingId(detailRow.id)}
        />
      )}
    </div>
  );
}
