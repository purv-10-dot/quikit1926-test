"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { usePriorities, useDeletePriority } from "@/lib/hooks/usePriority";
import { useUsers } from "@/lib/hooks/useUsers";
import { TableSkeleton } from "@/components/ui/Skeleton";
import {
  getFiscalYear, getFiscalQuarter, fiscalYearLabel,
  getCurrentFiscalWeek, getWeekDateRange,
} from "@/lib/utils/fiscal";
import { PriorityTable } from "./components/PriorityTable";
import { PriorityModal } from "./components/PriorityModal";
import { FilterPicker, userToFilterOption } from "@/components/FilterPicker";
import { useFilterContext } from "@/lib/context/FilterContext";

const FISCAL_YEAR = getFiscalYear();
const FISCAL_QUARTER = getFiscalQuarter();
const CURRENT_YEAR = new Date().getFullYear();
const FISCAL_YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 1 + i);

export default function PriorityPage() {
  const [year, setYear] = useState(FISCAL_YEAR);
  const [quarter, setQuarter] = useState<string>(FISCAL_QUARTER);
  const [showAddModal, setShowAddModal] = useState(false);

  // Search + filter
  const [search, setSearch] = useState("");
  const { filterTeam, setFilterTeam, filterOwner, setFilterOwner } = useFilterContext();
  const [filterStatus, setFilterStatus] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // Teams list
  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    fetch("/api/org/teams").then(r => r.json()).then(d => {
      if (d.success) setTeams(d.data.map((t: { id: string; name: string }) => ({ id: t.id, name: t.name })));
    });
  }, []);

  // Year/quarter picker
  const [showYearPicker, setShowYearPicker] = useState(false);
  const yearRef = useRef<HTMLDivElement>(null);

  // Selection for bulk delete
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const handleSelectionChange = useCallback((ids: Set<string>) => setSelectedIds(new Set(ids)), []);

  const { data: users = [] } = useUsers(filterTeam || undefined);
  const teamUserIds = useMemo(() => new Set(users.map(u => u.id)), [users]);
  const { data: priorities = [], isLoading, error, refetch } = usePriorities(year, quarter);
  const deletePriority = useDeletePriority();

  // Close dropdowns on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilter(false);
      if (yearRef.current && !yearRef.current.contains(e.target as Node)) setShowYearPicker(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function handleBulkDelete() {
    if (!selectedIds.size) return;
    await Promise.all([...selectedIds].map(id => deletePriority.mutateAsync(id)));
    setSelectedIds(new Set());
    refetch();
  }

  // Filter priorities client-side
  const filtered = priorities.filter(p => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterOwner) { if (p.owner !== filterOwner) return false; }
    else if (filterTeam) { if (!teamUserIds.has(p.owner)) return false; }
    if (filterStatus && p.overallStatus !== filterStatus) return false;
    return true;
  });

  const fiscalWeek = getCurrentFiscalWeek(year, quarter);
  const activeFilterCount = (filterTeam ? 1 : 0) + (filterStatus ? 1 : 0) + (filterOwner ? 1 : 0);

  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-gray-800 whitespace-nowrap">Priority</h1>
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
            {filtered.length} {filtered.length === 1 ? "item" : "items"}
          </span>
          <span className="text-xs bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
            {quarter} · Week {fiscalWeek} · {getWeekDateRange(year, quarter, fiscalWeek)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Bulk delete */}
          {selectedIds.size > 0 && (
            <button
              onClick={handleBulkDelete}
              disabled={deletePriority.isPending}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-red-50 border border-red-200 text-red-600 rounded-md hover:bg-red-100 disabled:opacity-50 transition-colors"
            >
              {deletePriority.isPending ? (
                <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              )}
              Delete {selectedIds.size} selected
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
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 w-44"
            />
          </div>

          {/* Filter */}
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
                  <select
                    value={filterStatus}
                    onChange={e => setFilterStatus(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                  >
                    <option value="">All statuses</option>
                    <option value="on-track">On Track</option>
                    <option value="behind-schedule">Behind Schedule</option>
                    <option value="not-yet-started">Not Yet Started</option>
                    <option value="completed">Completed</option>
                    <option value="not-applicable">Not Applicable</option>
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
              {fiscalYearLabel(year)} · {quarter}
              <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showYearPicker && (
              <div className="absolute top-full right-0 mt-1.5 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-4 space-y-4">
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Fiscal Year</p>
                  <div className="grid grid-cols-1 gap-1">
                    {FISCAL_YEARS.map(y => (
                      <button key={y} onClick={() => setYear(y)}
                        className={`text-xs px-3 py-1.5 rounded-lg text-left transition-colors ${year === y ? "bg-gray-900 text-white" : "hover:bg-gray-50 text-gray-700"}`}>
                        {fiscalYearLabel(y)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Quarter</p>
                  <div className="grid grid-cols-4 gap-1">
                    {(["Q1", "Q2", "Q3", "Q4"] as const).map(q => (
                      <button key={q} onClick={() => { setQuarter(q); setShowYearPicker(false); }}
                        className={`text-xs px-2 py-1.5 rounded-lg transition-colors ${quarter === q ? "bg-gray-900 text-white" : "hover:bg-gray-50 text-gray-700 border border-gray-200"}`}>
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
          <TableSkeleton rows={10} cols={7} />
        ) : error ? (
          <div className="flex items-center justify-center h-full text-sm text-red-500">
            Failed to load priorities
          </div>
        ) : priorities.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
            <svg className="h-10 w-10 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-sm">No priorities for {fiscalYearLabel(year)} · {quarter}</p>
            <button onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-md hover:bg-gray-700 transition-colors">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add First Priority
            </button>
          </div>
        ) : (
          <PriorityTable
            priorities={filtered}
            onRefresh={refetch}
            year={year}
            quarter={quarter}
            defaultYear={year}
            defaultQuarter={quarter}
            onSelectionChange={handleSelectionChange}
          />
        )}
      </div>

      {/* Add New Modal */}
      {showAddModal && (
        <PriorityModal
          defaultYear={year}
          defaultQuarter={quarter}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => { setShowAddModal(false); refetch(); }}
        />
      )}
    </div>
  );
}
