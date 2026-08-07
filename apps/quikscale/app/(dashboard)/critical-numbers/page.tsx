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

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Gauge, Plus, Trash2 } from "lucide-react";
import { AddButton, EmptyState, FilterPicker, Segmented, useConfirm } from "@quikit/ui";
import { useUsers } from "@/lib/hooks/useUsers";
import { useTeams } from "@/lib/hooks/useTeams";
import { useResourcePermissions } from "@/lib/hooks/useResourcePermissions";
import { notify } from "@/lib/utils/notify";
import { getMultiplier } from "@/lib/utils/currency";
import {
  CRITICAL_NUMBER_FREQUENCIES,
  type CriticalNumberFrequency,
} from "@/lib/schemas/criticalNumberSchema";
import { TableSkeleton } from "@/components/ui/Skeleton";
import {
  useCriticalNumbers,
  useCreateCriticalNumber,
  useDeleteCriticalNumber,
  useCriticalNumberOptions,
  useCreateSubCategory,
  useCreateCategoryFromCriticalNumber,
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

const FREQUENCY_LABELS: Record<CriticalNumberFrequency, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
};

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
  // Table filters. "" means "no filter" in every case, matching FilterPicker's
  // own empty-value convention (it renders `allLabel` for that).
  const [filterTeam, setFilterTeam] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterSubCategory, setFilterSubCategory] = useState("");
  const [filterFrequency, setFilterFrequency] = useState("");

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

  // Table filters, applied against `items` (which carries the ids/enums the
  // dropdowns select on) and then intersected with `previewRecords` by id —
  // rather than adding every id to `PreviewCriticalNumber` or duplicating the
  // mapper above. The charts and Recent Updates deliberately stay org-wide;
  // only the table responds to these.
  //
  // Split in two so each scope's count can reflect the OTHER filters: the
  // dropdown matches are computed once, then scope is applied on top.
  const dropdownMatchedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const i of items) {
      if (filterTeam && i.teamId !== filterTeam) continue;
      if (filterCategory && i.categoryId !== filterCategory) continue;
      if (filterSubCategory && i.subCategoryId !== filterSubCategory) continue;
      if (filterFrequency && i.frequency !== filterFrequency) continue;
      ids.add(i.id);
    }
    return ids;
  }, [items, filterTeam, filterCategory, filterSubCategory, filterFrequency]);

  const myIdsWithinDropdowns = useMemo(
    () => new Set(items.filter((i) => i.ownerId === currentUserId && dropdownMatchedIds.has(i.id)).map((i) => i.id)),
    [items, currentUserId, dropdownMatchedIds],
  );

  const tableRecords = useMemo(() => {
    const allowed = tableScope === "mine" ? myIdsWithinDropdowns : dropdownMatchedIds;
    return previewRecords.filter((r) => allowed.has(r.id));
  }, [tableScope, previewRecords, dropdownMatchedIds, myIdsWithinDropdowns]);

  // Sub-categories are scoped to their parent category — same rule the create
  // form applies (`visibleSubs`). Nothing to narrow by until one is chosen.
  const filterableSubCategories = useMemo(
    () => (options?.subCategories ?? []).filter((s) => s.categoryId === filterCategory),
    [options?.subCategories, filterCategory],
  );

  const anyFilterActive = !!(filterTeam || filterCategory || filterSubCategory || filterFrequency);
  function clearFilters() {
    setFilterTeam("");
    setFilterCategory("");
    setFilterSubCategory("");
    setFilterFrequency("");
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
    return entered * getMultiplier(form.currency, form.targetScale);
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
        {canCreate && <AddButton onClick={openPanel}>Add Critical Number</AddButton>}
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

          {/* Scope toggle + filters, one row. Counts on the toggle reflect the
              dropdown filters, so each label previews what clicking it shows. */}
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
              <div className="w-44">
                <FilterPicker
                  value={filterTeam}
                  onChange={setFilterTeam}
                  options={teams.map((t) => ({ value: t.id, label: t.name }))}
                  allLabel="All Departments"
                />
              </div>
              <div className="w-44">
                <FilterPicker
                  value={filterCategory}
                  // Changing category invalidates any sub-category beneath it —
                  // same rule the create form enforces.
                  onChange={(v) => {
                    setFilterCategory(v);
                    setFilterSubCategory("");
                  }}
                  options={(options?.categories ?? []).map((c) => ({ value: c.id, label: c.name }))}
                  allLabel="All Categories"
                />
              </div>
              <div className="w-44">
                <FilterPicker
                  value={filterSubCategory}
                  onChange={setFilterSubCategory}
                  options={filterableSubCategories.map((s) => ({ value: s.id, label: s.name }))}
                  // Sub-categories only exist under a category, so this stays a
                  // deliberate no-op until one is picked.
                  allLabel={filterCategory ? "All Sub Categories" : "Sub Category (pick a category)"}
                />
              </div>
              <div className="w-36">
                <FilterPicker
                  value={filterFrequency}
                  onChange={setFilterFrequency}
                  options={CRITICAL_NUMBER_FREQUENCIES.map((f) => ({
                    value: f,
                    label: FREQUENCY_LABELS[f],
                  }))}
                  allLabel="All Frequencies"
                />
              </div>
              {anyFilterActive && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <CriticalNumbersTable
            records={tableRecords}
            onRowClick={(r) => setDetailId(r.id)}
            emptyMessage={
              anyFilterActive
                ? "No Critical Numbers match these filters."
                : tableScope === "mine"
                  ? "You don't own any Critical Numbers yet."
                  : undefined
            }
          />

          <RecentUpdatesCard records={previewRecords} />
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
        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-5">
          {items.map((row) => (
            <div key={row.id} className="relative group">
              <CriticalNumberCard
                record={{
                  ...row,
                  teamName: row.team?.name,
                  ownerName: row.owner
                    ? `${row.owner.firstName} ${row.owner.lastName}`.trim()
                    : undefined,
                  categoryName: row.category?.name ?? null,
                  subCategoryName: row.subCategory?.name ?? null,
                }}
                onAddUpdate={() => setUpdatingId(row.id)}
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
          ))}
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
              users={pickerUsers}
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
