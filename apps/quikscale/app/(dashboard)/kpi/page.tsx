"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useKPIs, useDeleteKPI, useBulkRestoreKPI } from "@/lib/hooks/useKPI";
import { notify } from "@/lib/utils/notify";
import { useTableSort, useDebouncedTableSearch } from "@/lib/store";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { useInfiniteUsers } from "@/lib/hooks/useInfiniteUsers";
import { KPIListParams } from "@/lib/schemas/kpiSchema";
import {
  getFiscalYear, getFiscalQuarter, fiscalYearLabel,
} from "@/lib/utils/fiscal";
import { useCurrentWeek, useWeekDateRange, useQuarterWeekCount } from "@/lib/hooks/useCurrentWeek";
import { useNumberFormat } from "@/lib/hooks/useFeatureFlags";
import { KPITable } from "./components/KPITable";
import { KPIModal } from "./components/KPIModal";
import { ALL_STATIC_COLS, COL_LABELS } from "./hooks/useTableColumns";
import { weeksArray } from "@/lib/utils/fiscal";
import { FilterPicker, userToFilterOption, EmptyState, FiscalPeriodPicker, type FiscalQuarter, type ExportSelection } from "@quikit/ui";
import { useFiscalYears } from "@/lib/hooks/useFiscalYears";
import { useFilterContext } from "@/lib/context/FilterContext";
import { AddButton } from "@quikit/ui";
import { useResourcePermissions } from "@/lib/hooks/useResourcePermissions";
import { useTablePrefs } from "@/lib/hooks/useTablePreferences";
import { ModuleMoreActions, TrashBanner } from "@/components/table/ModuleMoreActions";
import { runExport } from "@/lib/export/xlsx";
import { getKPIs } from "@/lib/services/kpiService";
import { UnreadCountsProvider } from "@/components/audit/UnreadCountsProvider";
import { Target } from "lucide-react";

const FISCAL_YEAR = getFiscalYear();
const FISCAL_QUARTER = getFiscalQuarter();

export default function IndividualKPIPage() {
  const { data: session } = useSession();
  const [showAddModal, setShowAddModal] = useState(false);
  const { canCreate, canUpdate, canDelete } = useResourcePermissions("KPI");
  // Indian (lakh/crore) vs standard number format — org-level toggle, view-only.
  const numberFormat = useNumberFormat();

  // Year + quarter via shared FilterContext so they persist across module nav.
  // filterTeam lives LOCALLY (per-page scope). filterOwner is seeded from
  // context on mount AND written back on change/clear, so the owner filter
  // stays in sync across Dashboard / Priority / WWW.
  const ctx = useFilterContext();
  const { year: ctxYear, setYear: ctxSetYear, quarter: ctxQuarter, setQuarter: ctxSetQuarter } = ctx;
  const [filterTeam, setFilterTeam] = useState<string>(ctx.filterTeam);
  const [filterOwner, setFilterOwner] = useState<string>(ctx.filterOwner);

  // View Trash toggle — when true, list fetches ONLY soft-deleted rows (?includeDeleted=true)
  const [viewTrash, setViewTrash] = useState(false);

  // Sort + search live in Redux so they persist across client-side navigation
  // (and reload, via localStorage). Shared hooks keep every list page on the
  // same contract — see lib/store/index.ts.
  const { sortBy: reduxSortBy, sortOrder: reduxSortOrder, setSort } = useTableSort("kpi");
  const [searchInput, setSearchInput, reduxSearch] = useDebouncedTableSearch("kpi");

  // Filters — merges context-driven year/quarter with page-local params like page + sort.
  // sortBy: Redux holds a generic `string`; KPIListParams narrows it to a Zod
  // enum. Cast here at the boundary — the value is validated server-side by
  // the same enum, so an out-of-range string would 400 instead of leaking.
  const [filters, setFilters] = useState<Partial<KPIListParams> & { includeDeleted?: boolean }>({
    page: 1,
    pageSize: 10,
    year: ctxYear,
    quarter: ctxQuarter,
    kpiLevel: "individual", // Isolation: keep team KPIs out of the Individual KPI page
    sortBy: reduxSortBy as KPIListParams["sortBy"],
    sortOrder: reduxSortOrder,
    search: reduxSearch || undefined,
  });

  // Sync Redux sort/search → filters so useKPIs refetches with new params.
  useEffect(() => {
    setFilters((f) => ({
      ...f,
      sortBy: reduxSortBy as KPIListParams["sortBy"],
      sortOrder: reduxSortOrder,
      search: reduxSearch || undefined,
      page: 1,
    }));
  }, [reduxSortBy, reduxSortOrder, reduxSearch]);
  // Sync trash toggle into filters so useKPIs refetches with includeDeleted flag.
  useEffect(() => {
    setFilters((f) => ({ ...f, includeDeleted: viewTrash, page: 1 }));
  }, [viewTrash]);
  // Sync filters when context year/quarter changes (from another page).
  useEffect(() => {
    setFilters((f) => ({ ...f, year: ctxYear, quarter: ctxQuarter, page: 1 }));
  }, [ctxYear, ctxQuarter]);

  // Filter panel state
  const [showFilter, setShowFilter] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // Teams list
  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    fetch("/api/org/teams")
      .then(r => r.json())
      .then(d => {
        if (d.success) setTeams(d.data.map((t: { id: string; name: string }) => ({ id: t.id, name: t.name })));
      })
      .catch((err) => console.error("[kpi] Failed to load teams:", err));
  }, []);

  // Users for owner dropdown — DB-level infinite (25/page) + server search,
  // filtered by team when one is selected. No full-list load.
  const [ownerSearch, setOwnerSearch] = useState("");
  const {
    users,
    isLoading: ownersLoading,
    hasNextPage: ownersHasMore,
    isFetchingNextPage: ownersLoadingMore,
    fetchNextPage: fetchMoreOwners,
  } = useInfiniteUsers(filterTeam || undefined, ownerSearch);

  // Year picker — DB-scoped from QuarterSetting via shared hook
  const { years: fyYears, configured: fyConfigured } = useFiscalYears();
  const availableYears = fyYears.length ? fyYears : [FISCAL_YEAR];

  // Default owner filter intentionally left empty on load — users asked to see
  // all KPIs first and pick an owner filter manually when they want to narrow.

  // Apply filter changes — pass teamId to backend for server-side filtering
  useEffect(() => {
    setFilters(f => ({
      ...f,
      status: undefined,
      owner: filterOwner || undefined,
      teamId: filterTeam && !filterOwner ? filterTeam : undefined,
      page: 1,
    }));
  }, [filterOwner, filterTeam]);

  // Close filter dropdown on outside click (year picker owns its own outside-click handling)
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilter(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const { data, isLoading, error, refetch } = useKPIs(filters);
  const kpis = data?.data ?? [];
  const total = data?.total ?? kpis.length;

  // When an owner filter is restored from context (or the owner sits beyond the
  // loaded 25-user page), the id won't be in the FilterPicker's `options`, so
  // the trigger would fall back to "All owners". Resolve the owner's name from
  // the loaded KPI rows (the list is owner-scoped when filtered) and feed it as
  // the picker's `selectedOption` so the applied owner's name is shown.
  const selectedOwnerOption = useMemo(() => {
    if (!filterOwner || users.some((u) => u.id === filterOwner)) return undefined;
    const ou = kpis.find((k) => k.owner === filterOwner)?.owner_user;
    return ou
      ? userToFilterOption({ id: filterOwner, firstName: ou.firstName, lastName: ou.lastName, email: "" })
      : undefined;
  }, [filterOwner, users, kpis]);

  // Bulk delete
  const deleteKPI = useDeleteKPI();
  const bulkRestoreKPI = useBulkRestoreKPI();
  const [selectedKPIIds, setSelectedKPIIds] = useState<Set<string>>(new Set());
  const [clearSelectionTrigger, setClearSelectionTrigger] = useState(0);

  const handleSelectionChange = useCallback((ids: Set<string>) => setSelectedKPIIds(new Set(ids)), []);

  async function handleBulkDelete() {
    if (!selectedKPIIds.size) return;
    const count = selectedKPIIds.size;
    try {
      await Promise.all([...selectedKPIIds].map(id => deleteKPI.mutateAsync(id)));
      notify.success(`Deleted ${count} KPI${count === 1 ? "" : "s"}`);
      setClearSelectionTrigger(n => n + 1);
      refetch();
    } catch (err) {
      notify.error(err, { context: "KPI", fallback: "Couldn't delete the selected KPIs. Please try again." });
    }
  }

  async function handleBulkRestore() {
    if (!selectedKPIIds.size) return;
    const count = selectedKPIIds.size;
    try {
      await bulkRestoreKPI.mutateAsync([...selectedKPIIds]);
      notify.success(`Restored ${count} KPI${count === 1 ? "" : "s"}`);
      setClearSelectionTrigger(n => n + 1);
      refetch();
    } catch (err) {
      notify.error(err, { context: "KPI", fallback: "Couldn't restore the selected KPIs. Please try again." });
    }
  }

  // Hidden columns — now driven through Manage Columns modal via TablePrefs
  const weekCount = useQuarterWeekCount(filters.year ?? FISCAL_YEAR, filters.quarter ?? FISCAL_QUARTER);
  const allTableCols = [...ALL_STATIC_COLS, ...weeksArray(weekCount).map(w => `week${w}`)];
  const tablePrefs = useTablePrefs("kpi");
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set(tablePrefs.hiddenCols));
  const [showColTrigger, setShowColTrigger] = useState<{ col: string; seq: number } | undefined>();

  // Keep local Set in sync when the TablePreference cache updates
  useEffect(() => { setHiddenCols(new Set(tablePrefs.hiddenCols)); }, [tablePrefs.hiddenCols]);

  const handleHiddenColsChange = useCallback((cols: Set<string>) => setHiddenCols(new Set(cols)), []);
  function handleShowCol(col: string) { setShowColTrigger(t => ({ col, seq: (t?.seq ?? 0) + 1 })); }

  const currentYear = filters.year ?? FISCAL_YEAR;
  const currentQuarter = filters.quarter ?? FISCAL_QUARTER;

  // Columns metadata for Manage + Export modals.
  // Includes the 13 week columns so "Hide all" actually hides every data
  // column. Framework row controls (`_checkbox`, `_log`, `_id`) are
  // deliberately excluded — they're UI affordances rendered unconditionally
  // by KPITable, not user-togglable data.
  const moduleColumns = [
    ...ALL_STATIC_COLS.map((key) => ({ key, label: COL_LABELS[key] ?? key })),
    ...weeksArray(weekCount).map((w) => ({ key: `week${w}`, label: `Week ${w}` })),
  ];
  const visibleColKeys = moduleColumns.filter((c) => !hiddenCols.has(c.key)).map((c) => c.key);

  // Export handler — pulls rows per scope, formats via runExport
  const handleExport = useCallback(async (sel: ExportSelection) => {
    const columns = moduleColumns
      .filter((c) => sel.columnKeys.includes(c.key))
      .map((c) => ({
        key: c.key,
        label: c.label,
        value: (k: any) => {
          switch (c.key) {
            case "kpiName": return k.name ?? "";
            case "kpiOwner":
            case "owner": return k.owner_user ? `${k.owner_user.firstName} ${k.owner_user.lastName}` : "";
            case "team": return k.team?.name ?? "";
            case "teamHead": return k.team?.head ? `${k.team.head.firstName} ${k.team.head.lastName}` : "";
            case "measurementUnit": return k.measurementUnit ?? "";
            case "targetValue": return k.target ?? "";
            case "quarterlyGoal": return k.quarterlyGoal ?? "";
            case "qtdGoal": return k.qtdGoal ?? "";
            case "qtdAchieved": return k.qtdAchieved ?? 0;
            case "weeklyGoal": return k.qtdGoal ?? "";
            case "progress": return typeof k.progressPercent === "number" ? `${k.progressPercent.toFixed(1)}%` : "";
            case "description": return k.description ?? "";
            default: return "";
          }
        },
      }));
    await runExport<any>({
      selection: sel,
      columns,
      pageRows: kpis,
      fetchFiltered: async () => {
        const { data } = await getKPIs({ ...filters, page: 1, pageSize: 100 });
        return data;
      },
      fetchAll: async () => {
        const { data } = await getKPIs({ kpiLevel: "individual", page: 1, pageSize: 100, year: currentYear, quarter: currentQuarter });
        return data;
      },
      filename: `IndividualKPI-FY${currentYear}-${currentQuarter}${viewTrash ? "-Trash" : ""}`,
      sheetName: "Individual KPIs",
    });
  }, [moduleColumns, kpis, filters, viewTrash]); // eslint-disable-line react-hooks/exhaustive-deps

  // DB-driven current week + date range (respects QuarterSetting.startDate).
  // Both return null while loading → pill hides until ready.
  const fiscalWeek = useCurrentWeek(currentYear, currentQuarter);
  const fiscalWeekRange = useWeekDateRange(currentYear, currentQuarter, fiscalWeek);
  const activeFilterCount = (filterTeam ? 1 : 0) + (filterOwner ? 1 : 0);

  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-gray-800 whitespace-nowrap">Individual KPI</h1>
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
            {total} items
          </span>
          {fiscalWeek !== null && (
            <span className="text-xs bg-accent-50 text-accent-600 border border-accent-100 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
              {currentQuarter} · Week {fiscalWeek}{fiscalWeekRange ? ` · ${fiscalWeekRange}` : ""}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Bulk delete — active list only */}
          {canDelete && selectedKPIIds.size > 0 && !viewTrash && (
            <button
              onClick={handleBulkDelete}
              disabled={deleteKPI.isPending}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-red-50 border border-red-200 text-red-600 rounded-md hover:bg-red-100 disabled:opacity-50 transition-colors"
            >
              {deleteKPI.isPending ? (
                <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              )}
              Delete {selectedKPIIds.size} selected
            </button>
          )}

          {/* Bulk restore — trash view only */}
          {canDelete && selectedKPIIds.size > 0 && viewTrash && (
            <button
              onClick={handleBulkRestore}
              disabled={bulkRestoreKPI.isPending}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-green-50 border border-green-200 text-green-700 rounded-md hover:bg-green-100 disabled:opacity-50 transition-colors"
            >
              {bulkRestoreKPI.isPending ? (
                <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6-6m-6 6l6 6" />
                </svg>
              )}
              Restore {selectedKPIIds.size} selected
            </button>
          )}

          {/* Inline trash pill — shows only when trash toggle is on */}
          {viewTrash && (
            <button
              type="button"
              onClick={() => setViewTrash(false)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-amber-50 border border-amber-200 text-amber-900 rounded-md hover:bg-amber-100 transition-colors"
              title="Exit trash view"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Viewing deleted ({total})
              <svg className="h-3 w-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}

          {/* Search */}
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-accent-400 w-44"
            />
          </div>

          {/* Filter button */}
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setShowFilter(o => !o)}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs border rounded-md hover:bg-gray-50 transition-colors ${showFilter || activeFilterCount > 0 ? "border-accent-300 bg-accent-50 text-accent-600" : "border-gray-200 text-gray-600"}`}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
              </svg>
              {activeFilterCount > 0 ? `${activeFilterCount} filter${activeFilterCount > 1 ? "s" : ""}` : "Filter"}
            </button>

            {showFilter && (
              <div className="absolute top-full right-0 mt-1.5 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-4 space-y-4">
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Team</p>
                  <FilterPicker
                    value={filterTeam}
                    onChange={setFilterTeam}
                    options={teams.map(t => ({ value: t.id, label: t.name }))}
                    allLabel="All teams"
                  />
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Owner</p>
                  <FilterPicker
                    value={filterOwner}
                    onChange={(v) => { setFilterOwner(v); ctx.setFilterOwner(v); }}
                    options={users.map(userToFilterOption)}
                    selectedOption={selectedOwnerOption}
                    onSearchChange={setOwnerSearch}
                    onLoadMore={fetchMoreOwners}
                    hasMore={ownersHasMore}
                    loadingMore={ownersLoadingMore}
                    loading={ownersLoading}
                    allLabel="All owners"
                  />
                </div>
                {(filterTeam || filterOwner) && (
                  <button
                    onClick={() => { setFilterTeam(""); setFilterOwner(""); ctx.setFilterOwner(""); }}
                    className="w-full text-xs text-gray-500 hover:text-gray-800 py-1 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Year / Quarter picker — shared FiscalPeriodPicker, DB-scoped */}
          <FiscalPeriodPicker
            years={availableYears}
            configured={fyConfigured}
            year={currentYear}
            quarter={currentQuarter as FiscalQuarter}
            formatYear={fiscalYearLabel}
            onChange={({ year, quarter }) => {
              if (year !== currentYear) ctxSetYear(year);
              if (quarter !== currentQuarter) ctxSetQuarter(quarter);
              setFilters(f => ({ ...f, year, quarter, page: 1 }));
            }}
          />

          {/* "More" pill — sits left of AddButton */}
          <ModuleMoreActions
            columns={moduleColumns}
            hiddenCols={[...hiddenCols]}
            onHiddenColsChange={(next) => tablePrefs.setHiddenCols(next)}
            isTrashActive={viewTrash}
            onToggleTrash={setViewTrash}
            rowCounts={{ page: kpis.length, filtered: total, all: total }}
            onExport={handleExport}
            defaultExportColumnKeys={visibleColKeys}
          />

          {canCreate && <AddButton onClick={() => setShowAddModal(true)}>Add KPI</AddButton>}
        </div>
      </div>

      {/* Table Area — `min-h-0` lets the flex-1 child actually shrink to
          viewport height so the inner scroll container has a bounded height
          and vertical wheel scroll works. */}
      <div className="flex-1 overflow-hidden min-h-0">
        {isLoading ? (
          <TableSkeleton rows={10} cols={8} />
        ) : error ? (
          <div className="flex items-center justify-center h-full text-sm text-red-500">Failed to load KPIs</div>
        ) : kpis.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <EmptyState
              icon={Target}
              title="Track your first KPI"
              message="KPIs are measurable goals your team tracks weekly. They keep everyone aligned on what matters and surface trends before they become problems."
              action={canCreate ? { label: "Add your first KPI", onClick: () => setShowAddModal(true) } : undefined}
            />
          </div>
        ) : (
          <UnreadCountsProvider entityType="KPI" ids={kpis.map((k: { id: string }) => k.id)}>
          <KPITable
            kpis={kpis}
            total={total}
            page={filters.page ?? 1}
            pageSize={filters.pageSize ?? 10}
            year={currentYear}
            quarter={currentQuarter}
            onPageChange={(p) => setFilters(f => ({ ...f, page: p }))}
            onPageSizeChange={(size) => setFilters(f => ({ ...f, pageSize: size, page: 1 }))}
            onSort={(col, dir) => setSort({ sortBy: col, sortOrder: dir })}
            sortBy={reduxSortBy}
            sortOrder={reduxSortOrder}
            onRefresh={refetch}
            onSelectionChange={handleSelectionChange}
            clearSelectionTrigger={clearSelectionTrigger}
            onHiddenColsChange={handleHiddenColsChange}
            showColTrigger={showColTrigger}
            hideColumns={["quarterlyGoal", "qtdGoal", "qtdAchieved", "weeklyGoal", "teamHead", "kpiOwner"]}
            canDelete={canDelete}
            canUpdate={canUpdate}
            numberFormat={numberFormat}
          />
          </UnreadCountsProvider>
        )}
      </div>

      {/* Add New Modal */}
      {showAddModal && (
        <KPIModal
          mode="create"
          defaultYear={currentYear}
          defaultQuarter={currentQuarter}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => { setShowAddModal(false); refetch(); }}
        />
      )}
    </div>
  );
}
