"use client";

import { UserCircle2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TeamDashboard } from "@/lib/dashboard/types";

export function TeamPerformanceBlock({
  team,
  rangeLabel,
}: {
  team: TeamDashboard;
  rangeLabel: string;
}) {
  const dispData = team.topDispositions.map((x) => ({
    name: x.name || "—",
    calls: x.count,
  }));

  return (
    <div className="crm-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-crm-text">Team performance</h2>
          <p className="mt-0.5 text-xs text-crm-muted">
            Direct-reports metrics for the selected range. Owner is matched by user id first; rows
            without an id fall back to a denormalized name match.
          </p>
        </div>
        <UserCircle2 className="h-8 w-8 text-crm-blue/80" strokeWidth={1.5} aria-hidden />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded border border-crm-border bg-crm-panel/60 px-3 py-2">
          <p className="text-xs text-crm-muted">Team size</p>
          <p className="text-lg font-semibold text-crm-text">{team.teamMemberCount}</p>
          <p className="text-[11px] text-crm-muted">Active reports</p>
        </div>
        <div className="rounded border border-crm-border bg-crm-panel/60 px-3 py-2">
          <p className="text-xs text-crm-muted">Team calls ({rangeLabel})</p>
          <p className="text-lg font-semibold text-crm-text">{team.callsLast7Days}</p>
          <p className="text-[11px] text-crm-muted">Call logs by team members</p>
        </div>
        <div className="rounded border border-crm-border bg-crm-panel/60 px-3 py-2">
          <p className="text-xs text-crm-muted">Team activities ({rangeLabel})</p>
          <p className="text-lg font-semibold text-crm-text">{team.activitiesLast7Days}</p>
          <p className="text-[11px] text-crm-muted">Logged by team members</p>
        </div>
      </div>

      {dispData.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-xs font-medium text-crm-text">Call dispositions (team, {rangeLabel})</h3>
          <div className="mt-2 h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={dispData}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) =>
                    String(v).length > 18 ? `${String(v).slice(0, 16)}…` : String(v)
                  }
                />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }}
                  formatter={(v) => [Number(v ?? 0), "Calls"]}
                />
                <Bar dataKey="calls" fill="#0d9488" radius={[0, 4, 4, 0]} name="Calls" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-crm-muted">
          No team call dispositions in the selected range yet. Dispositions appear after click-to-call
          logs are saved.
        </p>
      )}
    </div>
  );
}
