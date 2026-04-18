"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useTeamKPIs } from "@/lib/hooks/useKPI";
import { useTeams } from "@/lib/hooks/useTeams";
import { TableSkeleton } from "@/components/ui/Skeleton";
import {
  getFiscalYear, getFiscalQuarter, fiscalYearLabel,
  getCurrentFiscalWeek, getWeekDateRange,
} from "@/lib/utils/fiscal";
import { ROLES, ROLE_HIERARCHY } from "@quikit/shared";
import type { KPIRow } from "@/lib/types/kpi";
import { TeamSection } from "./components/TeamSection";
import { KPIModal } from "../components/KPIModal";
import { AddButton } from "@quikit/ui";

const FISCAL_YEAR = getFiscalYear();
const FISCAL_QUARTER = getFiscalQuarter();
const CURRENT_YEAR = new Date().getFullYear();
const FISCAL_YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 1 + i);

export default function TeamsKPIPage() {
  const [year, setYear] = useState<number>(FISCAL_YEAR);
  const [quarter, setQuarter] = useState<"Q1" | "Q2" | "Q3" | "Q4">(FISCAL_QUARTER as "Q1" | "Q2" | "Q3" | "Q4");
  const [showYearPicker, setShowYearPicker] = useState(false);
  const yearRef = useRef<HTMLDivElement>(null);

  // Team filter — multi-select. Empty array = "All teams" (show everything).
  const [filterTeamIds, setFilterTeamIds] = useState<string[]>([]);
  const [showTeamPicker, setShowTeamPicker] = useState(false);
  const teamRef = useRef<HTMLDivElement>(null);
  const [teamSearch, setTeamSearch] = useState("");

  const [showAddKPI, setShowAddKPI] = useState(false);

  const { data: session } = useSession();
  const { data: teams = [], isLoading: teamsLoading } = useTeams();
  const { data: kpiData, isLoading: kpisLoading, refetch } = useTeamKPIs({ year, quarter });
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

  const fiscalWeek = getCurrentFiscalWeek(year, quarter);
  const isLoading = teamsLoading || kpisLoading;

  // Close pickers on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (yearRef.current && !yearRef.current.contains(e.target as Node)) setShowYearPicker(false);
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
          <span className="text-xs bg-accent-50 text-accent-600 border border-accent-100 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
            {quarter} · Week {fiscalWeek} · {getWeekDateRange(year, quarter, fiscalWeek)}
          </span>
        </div>

        <div className="flex items-center gap-2">
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

          {/* Year / Quarter picker */}
          <div className="relative" ref={yearRef}>
            <button
              onClick={() => setShowYearPicker(o => !o)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs border rounded-md hover:bg-gray-50 transition-colors ${
                showYearPicker ? "border-accent-300 bg-accent-50 text-accent-600" : "border-gray-200 text-gray-600"
              }`}
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
                      <button
                        key={y}
                        onClick={() => setYear(y)}
                        className={`text-xs px-3 py-1.5 rounded-lg text-left transition-colors ${
                          year === y ? "bg-gray-900 text-white" : "hover:bg-gray-50 text-gray-700"
                        }`}
                      >
                        {fiscalYearLabel(y)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Quarter</p>
                  <div className="grid grid-cols-4 gap-1">
                    {(["Q1", "Q2", "Q3", "Q4"] as const).map(q => (
                      <button
                        key={q}
                        onClick={() => { setQuarter(q); setShowYearPicker(false); }}
                        className={`text-xs px-2 py-1.5 rounded-lg transition-colors ${
                          quarter === q ? "bg-gray-900 text-white" : "hover:bg-gray-50 text-gray-700 border border-gray-200"
                        }`}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* + Add KPI — single page-level button */}
          {canAddTeamKPI && (
            <AddButton onClick={() => setShowAddKPI(true)}>Add KPI</AddButton>
          )}
        </div>
      </div>

      {/* Body — one TeamSection per team */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
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
            />
          ))
        )}
      </div>

      {/* Add KPI modal — scope="team", no pre-selected teamId so user picks the team inside the modal */}
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
