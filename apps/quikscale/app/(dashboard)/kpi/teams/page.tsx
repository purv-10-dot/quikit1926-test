"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useTeamKPIs, useDeleteKPI } from "@/lib/hooks/useKPI";
import { useTeams } from "@/lib/hooks/useTeams";
import { useFilterContext } from "@/lib/context/FilterContext";
import { TableSkeleton } from "@/components/ui/Skeleton";
import {
  getFiscalYear, getFiscalQuarter, fiscalYearLabel,
} from "@/lib/utils/fiscal";
import { useCurrentWeek, useWeekDateRange } from "@/lib/hooks/useCurrentWeek";
import { ROLES, ROLE_HIERARCHY } from "@quikit/shared";
import type { KPIRow } from "@/lib/types/kpi";
import { TeamSection } from "./components/TeamSection";
import { KPIModal } from "../components/KPIModal";
import { ALL_STATIC_COLS, COL_LABELS } from "../hooks/useTableColumns";
import { ALL_WEEKS } from "@/lib/utils/fiscal";
import { AddButton, FiscalPeriodPicker, type FiscalQuarter, type ExportSelection } from "@quikit/ui";
import { useFiscalYears } from "@/lib/hooks/useFiscalYears";
import { useTablePrefs } from "@/lib/hooks/useTablePreferences";
import { ModuleMoreActions, TrashBanner } from "@/components/table/ModuleMoreActions";
import { runExport } from "@/lib/export/xlsx";
import { getKPIs } from "@/lib/services/kpiService";

const FISCAL_YEAR = getFiscalYear();
const FISCAL_QUARTER = getFiscalQuarter();
export default function TeamsKPIPage() {
  // Year + quarter live in FilterContext so they persist across module nav.
  // `filterTeam` is also read so the Dashboard's Team-tab team selection
  // pre-seeds this page's multi-select filter on first mount.
  const { year, setYear, quarter, setQuarter, filterTeam } = useFilterContext();
  const { years: fyYears, configured: fyConfigured } = useFiscalYears();
  const availableYears = fyYears.length ? fyYears : [FISCAL_YEAR];

  // Team filter — multi-select. Empty array = "All teams" (show everything).
  // Initialised from FilterContext.filterTeam (single id) so Dashboard hand-off
  // works; subsequent picks are managed locally on this page.
  const [filterTeamIds, setFilterTeamIds] = useState<string[]>(() => filterTeam ? [filterTeam] : []);
  const [showTeamPicker, setShowTeamPicker] = useState(false);
  const teamRef = useRef<HTMLDivElement>(null);
  const [teamSearch, setTeamSearch] = useState("");

  const [showAddKPI, setShowAddKPI] = useState(false);

  // Page-level hidden-columns pill — aggregated across every TeamSection.
  // Each section reports its hidden set keyed by teamId; we union them for the
  // pill display, and broadcast "showCol" triggers to every section so clicking
  // an entry unhides that column in every team's table at once.
  const [hiddenColsByTeam, setHiddenColsByTeam] = useState<Record<string, Set<string>>>({});
  const [showColTrigger, setShowColTrigger] = useState<{ col: string; seq: number } | undefined>();
  const allTableCols = useMemo(
    () => [...ALL_STATIC_COLS, ...ALL_WEEKS.map(w => `week${w}`)],
    []
  );
  const unionHiddenCols = useMemo(() => {
    const s = new Set<string>();
    for (const set of Object.values(hiddenColsByTeam)) set.forEach(c => s.add(c));
    return s;
  }, [hiddenColsByTeam]);
  // Stable callback + no-op bail when the Set hasn't actually changed. Without
  // the bail, KPITable's useEffect — `[hiddenCols, onHiddenColsChange]` — fires
  // on every render because inline wrapper fns are new refs each time, leading
  // to an infinite re-render loop per TeamSection that pegs the main thread
  // and blocks sidebar navigation.
  const handleSectionHiddenColsChange = useCallback((teamId: string, cols: Set<string>) => {
    setHiddenColsByTeam(prev => {
      const existing = prev[teamId];
      if (existing && existing.size === cols.size && [...cols].every(c => existing.has(c))) {
        return prev; // identical membership → bail out, no re-render
      }
      return { ...prev, [teamId]: cols };
    });
  }, []);
  const handleShowCol = useCallback((col: string) => {
    setShowColTrigger(t => ({ col, seq: (t?.seq ?? 0) + 1 }));
  }, []);

  // Page-level bulk delete — aggregates selection across every TeamSection.
  // Matches the Individual KPI page pattern: button shows on left of toolbar
  // when any KPIs are selected; clicking deletes them all and resets selection.
  const deleteKPI = useDeleteKPI();
  const [selectedByTeam, setSelectedByTeam] = useState<Record<string, Set<string>>>({});
  const [clearSelectionTrigger, setClearSelectionTrigger] = useState(0);
  const unionSelectedIds = useMemo(() => {
    const s = new Set<string>();
    for (const set of Object.values(selectedByTeam)) set.forEach(id => s.add(id));
    return s;
  }, [selectedByTeam]);
  // Same stability fix as handleSectionHiddenColsChange — prevents infinite
  // re-render loop caused by KPITable's useEffect dep on onSelectionChange.
  const handleSectionSelectionChange = useCallback((teamId: string, ids: Set<string>) => {
    setSelectedByTeam(prev => {
      const existing = prev[teamId];
      if (existing && existing.size === ids.size && [...ids].every(id => existing.has(id))) {
        return prev;
      }
      return { ...prev, [teamId]: ids };
    });
  }, []);
  async function handleBulkDelete() {
    if (!unionSelectedIds.size) return;
    await Promise.all([...unionSelectedIds].map(id => deleteKPI.mutateAsync(id)));
    setSelectedByTeam({});
    setClearSelectionTrigger(n => n + 1);
    refetch();
  }

  // View Trash toggle — when true list fetches ONLY soft-deleted team KPIs
  const [viewTrash, setViewTrash] = useState(false);

  const { data: session } = useSession();
  const { data: teams = [], isLoading: teamsLoading } = useTeams();
  const { data: kpiData, isLoading: kpisLoading, refetch } = useTeamKPIs({
    year,
    quarter,
    ...({ includeDeleted: viewTrash } as any),
  });
  const kpis = useMemo(() => (kpiData?.data ?? []) as KPIRow[], [kpiData?.data]);

  // Can the user add team KPIs? (admin-level role, super admin, or head of any team)
  const canAddTeamKPI = useMemo(() => {
    if (!session?.user?.id) return false;
    const role = (session.user as { membershipRole?: string }).membershipRole;
    const ADMIN_MIN = ROLE_HIERARCHY[ROLES.ADMIN];
    if (role && (ROLE_HIERARCHY[role] ?? 0) >= ADMIN_MIN) return true;
    if ((session.user as { isSuperAdmin?: boolean }).isSuperAdmin) return true;
    // Head of at least one team
    return teams.some(t => t.headId === session.user?.id);
  }, [session, teams]);

  // Group KPIs by teamId client-side for rendering
  const kpisByTeam = useMemo(() => {
    const map: Record<string, KPIRow[]> = {};
    for (const k of kpis) {
      if (!k.teamId) continue;
      if (!map[k.teamId]) map[k.teamId] = [];
      map[k.teamId].push(k);
    }
    return map;
  }, [kpis]);

  // Sort: teams with KPIs first (by name), then teams without KPIs (by name).
  // Multi-select team filter: empty array means show all; otherwise only selected teams.
  const sortedTeams = useMemo(() => {
    const filterSet = new Set(filterTeamIds);
    const filtered = filterSet.size > 0 ? teams.filter(t => filterSet.has(t.id)) : teams;
    return [...filtered].sort((a, b) => {
      const aHas = (kpisByTeam[a.id]?.length ?? 0) > 0;
      const bHas = (kpisByTeam[b.id]?.length ?? 0) > 0;
      if (aHas !== bHas) return aHas ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [teams, kpisByTeam, filterTeamIds]);

  const selectedFilterTeams = teams.filter(t => filterTeamIds.includes(t.id));

  // DB-driven current week + date range (respects QuarterSetting.startDate).
  const fiscalWeek = useCurrentWeek(year, quarter);
  const fiscalWeekRange = useWeekDateRange(year, quarter, fiscalWeek);
  const isLoading = teamsLoading || kpisLoading;

  // Close pickers on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (teamRef.current && !teamRef.current.contains(e.target as Node)) {
        setShowTeamPicker(false);
        setTeamSearch("");
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-gray-800 whitespace-nowrap">Team KPI</h1>
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
            {kpis.length} {kpis.length === 1 ? "item" : "items"}
          </span>
          {fiscalWeek !== null && (
            <span className="text-xs bg-accent-50 text-accent-600 border border-accent-100 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
              {quarter} · Week {fiscalWeek}{fiscalWeekRange ? ` · ${fiscalWeekRange}` : ""}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Bulk delete — page-level, union of every team section's selected KPIs */}
          {unionSelectedIds.size > 0 && (
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
              Delete {unionSelectedIds.size} selected
            </button>
          )}

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
              Viewing deleted ({kpis.length})
              <svg className="h-3 w-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}

          {/* Team filter — compact button + searchable multi-select dropdown. Matches the year picker style. */}
          <div className="relative" ref={teamRef}>
            <button
              onClick={() => { setShowTeamPicker(o => !o); setTeamSearch(""); }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs border rounded-md hover:bg-gray-50 transition-colors ${
                showTeamPicker || filterTeamIds.length > 0 ? "border-accent-300 bg-accent-50 text-accent-600" : "border-gray-200 text-gray-600"
              }`}
            >
              {/* Users/team icon */}
              <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              {selectedFilterTeams.length === 1 && (
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: selectedFilterTeams[0].color || "#0066cc" }} />
              )}
              <span className="max-w-[180px] truncate">
                {selectedFilterTeams.length === 0
                  ? "All teams"
                  : selectedFilterTeams.length === 1
                    ? selectedFilterTeams[0].name
                    : `${selectedFilterTeams.length} teams selected`}
              </span>
              <svg className="h-3 w-3 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showTeamPicker && (
              <div className="absolute top-full right-0 mt-1.5 w-72 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
                {/* Search + Clear */}
                <div className="p-2 border-b border-gray-100 flex gap-2">
                  <input
                    autoFocus
                    value={teamSearch}
                    onChange={e => setTeamSearch(e.target.value)}
                    placeholder="Search teams…"
                    className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent-400"
                  />
                  {filterTeamIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterTeamIds([])}
                      className="text-[10px] text-gray-500 hover:text-red-500 px-2 rounded hover:bg-red-50 transition-colors whitespace-nowrap"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="max-h-64 overflow-y-auto py-1">
                  {/* "Select all" toggle — select all visible teams */}
                  {(() => {
                    const visible = teams.filter(t => !teamSearch.trim() || t.name.toLowerCase().includes(teamSearch.toLowerCase()));
                    if (visible.length === 0) return null;
                    const allSelected = visible.length > 0 && visible.every(t => filterTeamIds.includes(t.id));
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          if (allSelected) {
                            setFilterTeamIds(ids => ids.filter(id => !visible.some(t => t.id === id)));
                          } else {
                            setFilterTeamIds(ids => Array.from(new Set([...ids, ...visible.map(t => t.id)])));
                          }
                        }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-gray-50 transition-colors border-b border-gray-100 ${
                          allSelected ? "bg-accent-50 text-accent-700 font-semibold" : "text-gray-700"
                        }`}
                      >
                        <span className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 ${
                          allSelected ? "bg-accent-600 border-accent-600" : "border-gray-300 bg-white"
                        }`}>
                          {allSelected && (
                            <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </span>
                        {allSelected ? "Deselect all" : "Select all"}
                      </button>
                    );
                  })()}

                  {/* Team options (checkbox multi-select) */}
                  {teams
                    .filter(t => !teamSearch.trim() || t.name.toLowerCase().includes(teamSearch.toLowerCase()))
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(t => {
                      const selected = filterTeamIds.includes(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setFilterTeamIds(ids =>
                              ids.includes(t.id)
                                ? ids.filter(id => id !== t.id)
                                : [...ids, t.id]
                            );
                          }}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-gray-50 transition-colors ${
                            selected ? "bg-accent-50 text-accent-700" : "text-gray-700"
                          }`}
                        >
                          <span className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 ${
                            selected ? "bg-accent-600 border-accent-600" : "border-gray-300 bg-white"
                          }`}>
                            {selected && (
                              <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </span>
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color || "#0066cc" }} />
                          <span className="truncate flex-1 text-left">{t.name}</span>
                        </button>
                      );
                    })}
                  {teams.filter(t => !teamSearch.trim() || t.name.toLowerCase().includes(teamSearch.toLowerCase())).length === 0 && (
                    <p className="px-3 py-3 text-xs text-gray-400 text-center">No teams match.</p>
                  )}
                </div>
                {/* Footer: selection count */}
                {filterTeamIds.length > 0 && (
                  <div className="border-t border-gray-100 px-3 py-1.5 text-[10px] text-gray-500 bg-gray-50">
                    {filterTeamIds.length} of {teams.length} teams selected
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Year / Quarter picker — shared FiscalPeriodPicker, DB-scoped */}
          <FiscalPeriodPicker
            years={availableYears}
            configured={fyConfigured}
            year={year}
            quarter={quarter as FiscalQuarter}
            formatYear={fiscalYearLabel}
            onChange={({ year: y, quarter: q }) => { setYear(y); setQuarter(q); }}
          />

          <TeamKPIMoreActions
            viewTrash={viewTrash}
            setViewTrash={setViewTrash}
            kpis={kpis}
            year={year}
            quarter={quarter}
          />

          {/* + Add KPI — single page-level button */}
          {canAddTeamKPI && (
            <AddButton onClick={() => setShowAddKPI(true)}>Add KPI</AddButton>
          )}
        </div>
      </div>


      {/* Body — one TeamSection per team */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 min-h-0">
        {isLoading ? (
          <TableSkeleton rows={4} cols={4} />
        ) : sortedTeams.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
            <svg className="h-10 w-10 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p className="text-sm">No teams found. Create a team in Org Setup first.</p>
          </div>
        ) : (
          sortedTeams.map(team => (
            <TeamSection
              key={team.id}
              team={team}
              kpis={kpisByTeam[team.id] ?? []}
              year={year}
              quarter={quarter}
              onRefresh={refetch}
              onHiddenColsChange={handleSectionHiddenColsChange}
              showColTrigger={showColTrigger}
              onSelectionChange={handleSectionSelectionChange}
              clearSelectionTrigger={clearSelectionTrigger}
            />
          ))
        )}
      </div>

      {/* Add KPI modal — scope="team", no pre-selected teamId so user picks the team inside the modal */}
      {/* (JSX continues below) */}
      {showAddKPI && (
        <KPIModal
          mode="create"
          scope="team"
          defaultYear={year}
          defaultQuarter={quarter}
          onClose={() => setShowAddKPI(false)}
          onSuccess={() => {
            setShowAddKPI(false);
            refetch();
          }}
        />
      )}
    </div>
  );
}

/** Page-scoped More menu for Team KPIs — shares TablePrefs "kpi" key with Individual KPI. */
function TeamKPIMoreActions({
  viewTrash,
  setViewTrash,
  kpis,
  year,
  quarter,
}: {
  viewTrash: boolean;
  setViewTrash: (v: boolean) => void;
  kpis: KPIRow[];
  year: number;
  quarter: string;
}) {
  const tablePrefs = useTablePrefs("kpi");
  const moduleColumns = ALL_STATIC_COLS.map((key) => ({ key, label: COL_LABELS[key] ?? key }));
  const visibleColKeys = moduleColumns
    .filter((c) => !tablePrefs.hiddenCols.includes(c.key))
    .map((c) => c.key);

  const handleExport = async (sel: ExportSelection) => {
    const columns = moduleColumns
      .filter((c) => sel.columnKeys.includes(c.key))
      .map((c) => ({
        key: c.key,
        label: c.label,
        value: (k: any) => {
          switch (c.key) {
            case "kpiName": return k.name ?? "";
            case "owner":
            case "kpiOwner": return k.owner_user ? `${k.owner_user.firstName} ${k.owner_user.lastName}` : "";
            case "team": return k.team?.name ?? "";
            case "teamHead": return k.team?.head ? `${k.team.head.firstName} ${k.team.head.lastName}` : "";
            case "measurementUnit": return k.measurementUnit ?? "";
            case "targetValue": return k.target ?? "";
            case "quarterlyGoal": return k.quarterlyGoal ?? "";
            case "qtdGoal": return k.qtdGoal ?? "";
            case "qtdAchieved": return k.qtdAchieved ?? 0;
            case "progress": return typeof k.progressPercent === "number" ? `${k.progressPercent.toFixed(1)}%` : "";
            case "description": return k.description ?? "";
            default: return "";
          }
        },
      }));
    await runExport<KPIRow>({
      selection: sel,
      columns,
      pageRows: kpis,
      fetchFiltered: async () => {
        const { data } = await getKPIs({ kpiLevel: "team", year, quarter, page: 1, pageSize: 100, ...({ includeDeleted: viewTrash } as any) });
        return data as unknown as KPIRow[];
      },
      fetchAll: async () => {
        const { data } = await getKPIs({ kpiLevel: "team", page: 1, pageSize: 100 });
        return data as unknown as KPIRow[];
      },
      filename: `TeamKPI-FY${year}-${quarter}${viewTrash ? "-Trash" : ""}`,
      sheetName: "Team KPIs",
    });
  };

  return (
    <ModuleMoreActions
      columns={moduleColumns}
      hiddenCols={tablePrefs.hiddenCols}
      onHiddenColsChange={(next) => tablePrefs.setHiddenCols(next)}
      isTrashActive={viewTrash}
      onToggleTrash={setViewTrash}
      rowCounts={{ page: kpis.length, filtered: kpis.length, all: kpis.length }}
      onExport={handleExport}
      defaultExportColumnKeys={visibleColKeys}
    />
  );
}
