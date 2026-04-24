"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useKPIs, useDeleteKPI } from "@/lib/hooks/useKPI";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { useUsers } from "@/lib/hooks/useUsers";
import { KPIListParams } from "@/lib/schemas/kpiSchema";
import {
  getFiscalYear, getFiscalQuarter, fiscalYearLabel,
  getCurrentFiscalWeek, getWeekDateRange,
} from "@/lib/utils/fiscal";
import { KPITable } from "./components/KPITable";
import { KPIModal } from "./components/KPIModal";
import { ALL_STATIC_COLS, COL_LABELS } from "./hooks/useTableColumns";
import { ALL_WEEKS } from "@/lib/utils/fiscal";
import { FilterPicker, userToFilterOption, EmptyState, type ExportSelection } from "@quikit/ui";
import { useFilterContext } from "@/lib/context/FilterContext";
import { AddButton } from "@quikit/ui";
import { useTablePrefs } from "@/lib/hooks/useTablePreferences";
import { ModuleMoreActions, TrashBanner } from "@/components/table/ModuleMoreActions";
import { runExport } from "@/lib/export/xlsx";
import { getKPIs } from "@/lib/services/kpiService";
import { Target } from "lucide-react";

const FISCAL_YEAR = getFiscalYear();
const FISCAL_QUARTER = getFiscalQuarter();

export default function IndividualKPIPage() {
  const { data: session } = useSession();
  const [showAddModal, setShowAddModal] = useState(false);

  // Year + quarter via shared FilterContext so they persist across module nav.
  const { year: ctxYear, setYear: ctxSetYear, quarter: ctxQuarter, setQuarter: ctxSetQuarter, filterTeam, setFilterTeam, filterOwner, setFilterOwner } = useFilterContext();

  // View Trash toggle — when true, list fetches ONLY soft-deleted rows (?includeDeleted=true)
  const [viewTrash, setViewTrash] = useState(false);

  // Filters — merges context-driven year/quarter with page-local params like page + sort.
  const [filters, setFilters] = useState<Partial<KPIListParams> & { includeDeleted?: boolean }>({
    page: 1,
    pageSize: 50,
    year: ctxYear,
    quarter: ctxQuarter,
    kpiLevel: "individual", // Isolation: keep team KPIs out of the Individual KPI page
    sortBy: "createdAt",
    sortOrder: "desc",
  });
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
  const [filterStatus, setFilterStatus] = useState("");
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

  // Users for owner dropdown — filtered by team when one is selected
  const { data: users = [] } = useUsers(filterTeam || undefined);

  // Year picker
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [availableYears, setAvailableYears] = useState<number[]>([FISCAL_YEAR]);
  const yearRef = useRef<HTMLDivElement>(null);

  // Default owner filter intentionally left empty on load — users asked to see
  // all KPIs first and pick an owner filter manually when they want to narrow.

  // Apply filter changes — pass teamId to backend for server-side filtering
  useEffect(() => {
    setFilters(f => ({
      ...f,
      status: (filterStatus as any) || undefined,
      owner: filterOwner || undefined,
      teamId: filterTeam && !filterOwner ? filterTeam : undefined,
      pageSize: 50,
      page: 1,
    }));
  }, [filterStatus, filterOwner, filterTeam]);

  // Fetch available years
  useEffect(() => {
    fetch("/api/kpi/years")
      .then(r => r.json())
      .then(d => {
        if (d.success && d.data.length) {
          const merged = Array.from(new Set([...d.data, FISCAL_YEAR])).sort((a: number, b: number) => b - a);
          setAvailableYears(merged);
        }
      })
      .catch((err) => console.error("[kpi] Failed to load available years:", err));
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilter(false);
      if (yearRef.current && !yearRef.current.contains(e.target as Node)) setShowYearPicker(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const { data, isLoading, error, refetch } = useKPIs(filters);
  const kpis = data?.data ?? [];
  const total = data?.total ?? kpis.length;

  // Bulk delete
  const deleteKPI = useDeleteKPI();
  const [selectedKPIIds, setSelectedKPIIds] = useState<Set<string>>(new Set());
  const [clearSelectionTrigger, setClearSelectionTrigger] = useState(0);

  const handleSelectionChange = useCallback((ids: Set<string>) => setSelectedKPIIds(new Set(ids)), []);

  async function handleBulkDelete() {
    if (!selectedKPIIds.size) return;
    await Promise.all([...selectedKPIIds].map(id => deleteKPI.mutateAsync(id)));
    setClearSelectionTrigger(n => n + 1);
    refetch();
  }

  // Hidden columns — now driven through Manage Columns modal via TablePrefs
  const allTableCols = [...ALL_STATIC_COLS, ...ALL_WEEKS.map(w => `week${w}`)];
  const tablePrefs = useTablePrefs("kpi");
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set(tablePrefs.hiddenCols));
  const [showColTrigger, setShowColTrigger] = useState<{ col: string; seq: number } | undefined>();

  // Keep local Set in sync when the TablePreference cache updates
  useEffect(() => { setHiddenCols(new Set(tablePrefs.hiddenCols)); }, [tablePrefs.hiddenCols]);

  const handleHiddenColsChange = useCallback((cols: Set<string>) => setHiddenCols(new Set(cols)), []);
  function handleShowCol(col: string) { setShowColTrigger(t => ({ col, seq: (t?.seq ?? 0) + 1 })); }

  const currentYear = filters.year ?? FISCAL_YEAR;
  const currentQuarter = filters.quarter ?? FISCAL_QUARTER;

  // Columns metadata for Manage + Export modals — static cols only (weeks handled separately)
  const moduleColumns = ALL_STATIC_COLS.map((key) => ({ key, label: COL_LABELS[key] ?? key }));
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

  const fiscalWeek = getCurrentFiscalWeek(currentYear, currentQuarter);
  const activeFilterCount = (filterTeam ? 1 : 0) + (filterStatus ? 1 : 0) + (filterOwner ? 1 : 0);

  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-gray-800 whitespace-nowrap">Individual KPI</h1>
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
            {total} items
          </span>
          <span className="text-xs bg-accent-50 text-accent-600 border border-accent-100 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
            {currentQuarter} · Week {fiscalWeek} · {getWeekDateRange(currentYear, currentQuarter, fiscalWeek)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Bulk delete */}
          {selectedKPIIds.size > 0 && (
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
              onChange={(e) => setFilters(f => ({ ...f, search: e.target.value || undefined, page: 1 }))}
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
                    onChange={setFilterOwner}
                    options={users.map(userToFilterOption)}
                    allLabel="All owners"
                  />
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Status</p>
                  <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white">
                    <option value="">All statuses</option>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
                {(filterTeam || filterStatus || filterOwner) && (
                  <button
                    onClick={() => { setFilterTeam(""); setFilterStatus(""); setFilterOwner(""); }}
                    className="w-full text-xs text-gray-500 hover:text-gray-800 py-1 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Year / Quarter picker */}
          <div className="relative" ref={yearRef}>
            <button
              onClick={() => setShowYearPicker(o => !o)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs border rounded-md hover:bg-gray-50 transition-colors ${showYearPicker ? "border-accent-300 bg-accent-50 text-accent-600" : "border-gray-200 text-gray-600"}`}
            >
              <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {fiscalYearLabel(currentYear)} · {currentQuarter}
              <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showYearPicker && (
              <div className="absolute top-full right-0 mt-1.5 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-4 space-y-4">
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Fiscal Year</p>
                  <div className="grid grid-cols-1 gap-1">
                    {availableYears.map(y => (
                      <button key={y}
                        onClick={() => { ctxSetYear(y); setFilters(f => ({ ...f, year: y, page: 1 })); }}
                        className={`text-xs px-3 py-1.5 rounded-lg text-left transition-colors ${currentYear === y ? "bg-gray-900 text-white" : "hover:bg-gray-50 text-gray-700"}`}>
                        {fiscalYearLabel(y)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Quarter</p>
                  <div className="grid grid-cols-4 gap-1">
                    {(["Q1", "Q2", "Q3", "Q4"] as const).map(q => (
                      <button key={q}
                        onClick={() => { ctxSetQuarter(q); setFilters(f => ({ ...f, quarter: q, page: 1 })); setShowYearPicker(false); }}
                        className={`text-xs px-2 py-1.5 rounded-lg transition-colors ${currentQuarter === q ? "bg-gray-900 text-white" : "hover:bg-gray-50 text-gray-700 border border-gray-200"}`}>
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

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

          <AddButton onClick={() => setShowAddModal(true)}>Add KPI</AddButton>
        </div>
      </div>

      {/* Table Area */}
      <div className="flex-1 overflow-hidden">
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
              action={{ label: "Add your first KPI", onClick: () => setShowAddModal(true) }}
            />
          </div>
        ) : (
          <KPITable
            kpis={kpis}
            total={total}
            page={filters.page ?? 1}
            pageSize={filters.pageSize ?? 50}
            year={currentYear}
            quarter={currentQuarter}
            onPageChange={(p) => setFilters(f => ({ ...f, page: p }))}
            onSort={(col, dir) => setFilters(f => ({ ...f, sortBy: col as any, sortOrder: dir, page: 1 }))}
            onRefresh={refetch}
            onSelectionChange={handleSelectionChange}
            clearSelectionTrigger={clearSelectionTrigger}
            onHiddenColsChange={handleHiddenColsChange}
            showColTrigger={showColTrigger}
            hideColumns={["quarterlyGoal", "qtdGoal", "qtdAchieved", "weeklyGoal", "teamHead", "kpiOwner"]}
          />
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
