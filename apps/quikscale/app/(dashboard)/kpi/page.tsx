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
import { HiddenColsMenu } from "./components/HiddenColsMenu";
import { KPIModal } from "./components/KPIModal";
import { ALL_STATIC_COLS } from "./hooks/useTableColumns";
import { ALL_WEEKS } from "@/lib/utils/fiscal";
import { FilterPicker, userToFilterOption } from "@/components/FilterPicker";
import { useFilterContext } from "@/lib/context/FilterContext";

const FISCAL_YEAR = getFiscalYear();
const FISCAL_QUARTER = getFiscalQuarter();

export default function IndividualKPIPage() {
  const { data: session } = useSession();
  const [showAddModal, setShowAddModal] = useState(false);

  // Filters
  const [filters, setFilters] = useState<Partial<KPIListParams>>({
    page: 1,
    pageSize: 50,
    year: FISCAL_YEAR,
    quarter: FISCAL_QUARTER,
    sortBy: "createdAt",
    sortOrder: "desc",
  });

  // Filter panel state
  const [showFilter, setShowFilter] = useState(false);
  const { filterTeam, setFilterTeam, filterOwner, setFilterOwner } = useFilterContext();
  const [filterStatus, setFilterStatus] = useState("");
  const filterRef = useRef<HTMLDivElement>(null);
  const ownerInitialized = useRef(false);

  // Teams list
  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    fetch("/api/org/teams").then(r => r.json()).then(d => {
      if (d.success) setTeams(d.data.map((t: { id: string; name: string }) => ({ id: t.id, name: t.name })));
    });
  }, []);

  // Users for owner dropdown — filtered by team when one is selected
  const { data: users = [] } = useUsers(filterTeam || undefined);

  // Year picker
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [availableYears, setAvailableYears] = useState<number[]>([FISCAL_YEAR]);
  const yearRef = useRef<HTMLDivElement>(null);

  // Set default owner filter to current user once session loads (only if no filter already set)
  useEffect(() => {
    if (session?.user?.id && !ownerInitialized.current && !filterOwner) {
      setFilterOwner(session.user.id);
      ownerInitialized.current = true;
    }
  }, [session?.user?.id]);

  // Team member IDs for client-side filtering when team selected but no specific owner
  const teamUserIds = useMemo(() => new Set(users.map(u => u.id)), [users]);

  // Apply filter changes — when a team is selected with no specific owner,
  // fetch all (pageSize:1000) and filter client-side by teamUserIds
  useEffect(() => {
    setFilters(f => ({
      ...f,
      status: (filterStatus as any) || undefined,
      owner: filterOwner || undefined,
      pageSize: filterTeam && !filterOwner ? 1000 : 50,
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
      .catch(() => {});
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
  const allKpis = data?.data ?? [];
  // When team selected + no specific owner, filter client-side to team members only
  const kpis = (filterTeam && !filterOwner)
    ? allKpis.filter(k => teamUserIds.has(k.owner))
    : allKpis;
  const total = kpis.length;

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

  // Hidden columns
  const allTableCols = [...ALL_STATIC_COLS, ...ALL_WEEKS.map(w => `week${w}`)];
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());
  const [showColTrigger, setShowColTrigger] = useState<{ col: string; seq: number } | undefined>();

  const handleHiddenColsChange = useCallback((cols: Set<string>) => setHiddenCols(new Set(cols)), []);
  function handleShowCol(col: string) { setShowColTrigger(t => ({ col, seq: (t?.seq ?? 0) + 1 })); }

  const currentYear = filters.year ?? FISCAL_YEAR;
  const currentQuarter = filters.quarter ?? FISCAL_QUARTER;
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
          <span className="text-xs bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
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

          {/* Hidden columns */}
          {hiddenCols.size > 0 && (
            <HiddenColsMenu hiddenCols={hiddenCols} allCols={allTableCols} onShow={handleShowCol} />
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
              className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 w-44"
            />
          </div>

          {/* Filter button */}
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setShowFilter(o => !o)}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs border rounded-md hover:bg-gray-50 transition-colors ${showFilter || activeFilterCount > 0 ? "border-blue-300 bg-blue-50 text-blue-600" : "border-gray-200 text-gray-600"}`}
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
                    className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white">
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
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs border rounded-md hover:bg-gray-50 transition-colors ${showYearPicker ? "border-blue-300 bg-blue-50 text-blue-600" : "border-gray-200 text-gray-600"}`}
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
                        onClick={() => { setFilters(f => ({ ...f, year: y, page: 1 })); }}
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
                        onClick={() => { setFilters(f => ({ ...f, quarter: q, page: 1 })); setShowYearPicker(false); }}
                        className={`text-xs px-2 py-1.5 rounded-lg transition-colors ${currentQuarter === q ? "bg-gray-900 text-white" : "hover:bg-gray-50 text-gray-700 border border-gray-200"}`}>
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Add New */}
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-md hover:bg-gray-700 transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add New
          </button>
        </div>
      </div>

      {/* Table Area */}
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <TableSkeleton rows={10} cols={8} />
        ) : error ? (
          <div className="flex items-center justify-center h-full text-sm text-red-500">Failed to load KPIs</div>
        ) : kpis.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
            <svg className="h-10 w-10 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p className="text-sm">No KPIs yet for this period</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-md hover:bg-gray-700 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add First KPI
            </button>
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
