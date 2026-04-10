"use client";

import { useMemo, useState } from "react";
import type { KPIRow } from "@/lib/types/kpi";
import type { Team } from "@/lib/hooks/useTeams";
import { useCanManageTeamKPI } from "@/lib/hooks/useCanManageTeamKPI";
import { progressColor, fmtCompact } from "@/lib/utils/kpiHelpers";
import { KPITable } from "../../components/KPITable";
import { KPIModal } from "../../components/KPIModal";

interface Props {
  team: Team;
  kpis: KPIRow[];
  year: number;
  quarter: string;
  onRefresh: () => void;
  defaultExpanded?: boolean;
}

export function TeamSection({ team, kpis, year, quarter, onRefresh, defaultExpanded }: Props) {
  const [expanded, setExpanded] = useState<boolean>(defaultExpanded ?? kpis.length > 0);
  const [showAdd, setShowAdd] = useState(false);
  const [editKPI, setEditKPI] = useState<KPIRow | null>(null);

  const canManage = useCanManageTeamKPI(team.id);

  // Client-side summary — count, average progress, and goal totals
  const summary = useMemo(() => {
    const count = kpis.length;
    if (count === 0) return { count: 0, avgProgress: 0, totalGoal: 0, totalAchieved: 0 };
    const avgProgress = Math.round(
      kpis.reduce((sum, k) => sum + (k.progressPercent || 0), 0) / count
    );
    const totalGoal = kpis.reduce((sum, k) => sum + (k.qtdGoal ?? 0), 0);
    const totalAchieved = kpis.reduce((sum, k) => sum + (k.qtdAchieved ?? 0), 0);
    return { count, avgProgress, totalGoal, totalAchieved };
  }, [kpis]);

  const progColors = progressColor(summary.avgProgress);
  const accent = team.color || "#0066cc";

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Header (always visible)
          Layout:
            [left-cluster: chevron · dot · name · badge]   [progress cluster (fixed width)]   ──auto──   [Add KPI button pinned right]
          The left cluster uses flex-1 min-w-0 so the team name truncates cleanly.
          Add KPI uses ml-auto to pin to the rightmost edge with all leftover space to its left.
      */}
      <div
        className="flex items-center gap-4 px-5 py-3 border-b border-gray-100 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors select-none"
        onClick={() => setExpanded(e => !e)}
      >
        {/* LEFT CLUSTER — chevron + dot + name + KPI count badge */}
        <div className="flex items-center gap-3 min-w-0 flex-shrink-0">
          <svg
            className={`h-3.5 w-3.5 text-gray-400 flex-shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: accent }} />
          <h3 className="text-sm font-semibold text-gray-800 truncate max-w-[240px]">
            {team.name}
          </h3>
          <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
            {summary.count} {summary.count === 1 ? "KPI" : "KPIs"}
          </span>
        </div>

        {/* PROGRESS CLUSTER — fixed width, only when there are KPIs */}
        {summary.count > 0 && (
          <div className="flex items-center gap-3 flex-shrink-0 w-[420px] max-w-[42%]">
            <span className={`text-xs font-semibold w-11 text-right flex-shrink-0 ${progColors.text}`}>
              {summary.avgProgress}%
            </span>
            <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-1.5 rounded-full transition-all ${progColors.bar}`}
                style={{ width: `${Math.min(summary.avgProgress, 100)}%` }}
              />
            </div>
            <span className="text-[10px] text-gray-400 whitespace-nowrap font-medium">
              {fmtCompact(summary.totalAchieved)} / {fmtCompact(summary.totalGoal)}
            </span>
          </div>
        )}

        {/* Add KPI button — pinned to the rightmost via ml-auto */}
        {canManage && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowAdd(true);
            }}
            className="ml-auto flex items-center gap-1 px-3 py-1.5 bg-gray-900 text-white text-[11px] font-medium rounded-md hover:bg-gray-700 transition-colors flex-shrink-0"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            Add KPI
          </button>
        )}
      </div>

      {/* Body */}
      {expanded && (
        <div>
          {kpis.length === 0 ? (
            <div className="px-6 py-8 text-center text-xs text-gray-400">
              No team KPIs yet for this quarter.
              {canManage && (
                <>
                  {" "}
                  <button
                    onClick={() => setShowAdd(true)}
                    className="text-blue-500 hover:underline font-medium"
                  >
                    Add the first one
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="overflow-hidden">
              <KPITable
                kpis={kpis}
                total={kpis.length}
                page={1}
                pageSize={kpis.length || 1}
                year={year}
                quarter={quarter}
                onPageChange={() => {}}
                onSort={() => {}}
                onRefresh={onRefresh}
                hideColumns={["owner"]}
                readOnly={!canManage}
              />
            </div>
          )}
        </div>
      )}

      {/* Add / Edit modals */}
      {showAdd && (
        <KPIModal
          mode="create"
          scope="team"
          teamId={team.id}
          defaultYear={year}
          defaultQuarter={quarter}
          onClose={() => setShowAdd(false)}
          onSuccess={() => {
            setShowAdd(false);
            onRefresh();
          }}
        />
      )}
      {editKPI && (
        <KPIModal
          mode="edit"
          scope="team"
          kpi={editKPI}
          onClose={() => setEditKPI(null)}
          onSuccess={() => {
            setEditKPI(null);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}
