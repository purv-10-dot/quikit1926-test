"use client";

/**
 * FR-4.5 — Activity breakdown widget (the Phase-4 dashboard surface).
 *
 * Surfaces two breakdowns the scalar KPI cards (role-kpi-grid) can't hold, so
 * this is a SEPARATE widget — both are table/list-shaped, not single-number:
 *
 *   1. BY TYPE — activitiesByType ({ type, count }[]) from GET /api/dashboard/metrics.
 *      Consumed via useQuery on the SAME key role-kpi-grid uses
 *      (["dashboard","role-metrics"]) with the SAME fetcher, so react-query
 *      DEDUPES the request — this widget is its own query-consumer of the shared
 *      key, it does NOT assume role-kpi-grid already populated the cache (the
 *      widget can render without/before the grid).
 *   2. PER-REP FIELD AGGREGATES — GET /api/dashboard/field-aggregates?activityTypeId=<id>
 *      (FR-4.4). All fields render as columns in a horizontally-scrollable table
 *      (reps = rows; Number → numberSum + team-total footer; Select/Text → value×count).
 *
 * The activity-type PICKER is sourced from GET /api/activities/types (same
 * endpoint the log-activity modal uses) and DEFAULTS to the first active type so
 * the per-rep table renders populated on first paint.
 *
 * Chrome matches team-performance-block.tsx (crm-card, header + lucide icon).
 * Sales-only — slotted into dashboard-client under the same isSales gate.
 */

import { memo, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import type { RoleMetricsDto } from "@/lib/dashboard/role-metrics-types";
import type { ActivityTypeDefinition } from "@/types/activity-type";
import type { ActivityFieldAggregate } from "@/lib/services/dashboard/activity-field-aggregates";

// ── fetchers ──────────────────────────────────────────────────────────────
// Shared with role-kpi-grid: same key + same fetcher → react-query dedupes.
async function fetchRoleMetrics(): Promise<{ success: boolean; data: RoleMetricsDto }> {
  const res = await fetch("/api/dashboard/metrics", { credentials: "include" });
  if (!res.ok) throw new Error(`Role metrics fetch failed (${res.status})`);
  return res.json() as Promise<{ success: boolean; data: RoleMetricsDto }>;
}

async function fetchActivityTypes(): Promise<{ success: boolean; data: ActivityTypeDefinition[] }> {
  const res = await fetch("/api/activities/types", { credentials: "include" });
  if (!res.ok) throw new Error(`Activity types fetch failed (${res.status})`);
  return res.json() as Promise<{ success: boolean; data: ActivityTypeDefinition[] }>;
}

async function fetchFieldAggregates(
  activityTypeId: string,
): Promise<{ success: boolean; data: ActivityFieldAggregate[] }> {
  const res = await fetch(
    `/api/dashboard/field-aggregates?activityTypeId=${encodeURIComponent(activityTypeId)}`,
    { credentials: "include" },
  );
  if (!res.ok) throw new Error(`Field aggregates fetch failed (${res.status})`);
  return res.json() as Promise<{ success: boolean; data: ActivityFieldAggregate[] }>;
}

// activitiesByType lives on the Admin/SalesManager/SalesUser metric DTOs. Read it
// defensively (Marketing/Finance DTOs don't carry it — though this widget is
// sales-gated, the type union is broad).
function readActivitiesByType(dto: RoleMetricsDto | undefined): { type: string; count: number }[] {
  const m = dto?.metrics as { activitiesByType?: { type: string; count: number }[] } | undefined;
  return m?.activitiesByType ?? [];
}

// ── per-rep table ───────────────────────────────────────────────────────────
function PerRepCell({ field, ownerId }: { field: ActivityFieldAggregate; ownerId: string }) {
  const rep = field.perRep.find((r) => r.ownerId === ownerId);
  if (!rep) return <span className="text-crm-muted">—</span>;
  if (field.fieldType === "Number") {
    return <span>{rep.numberSum ?? 0}</span>;
  }
  const counts = rep.countsByValue ?? [];
  if (counts.length === 0) return <span className="text-crm-muted">—</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {counts.map((c) => (
        <span key={c.value} className="rounded bg-crm-panel/60 px-1.5 py-0.5 text-[11px]">
          {c.value}×{c.count}
        </span>
      ))}
    </span>
  );
}

function PerRepTable({ fields }: { fields: ActivityFieldAggregate[] }) {
  // Union of every owner across every field, with a display name.
  const owners = new Map<string, string | null>();
  for (const f of fields) {
    for (const r of f.perRep) {
      if (!owners.has(r.ownerId)) owners.set(r.ownerId, r.ownerName);
    }
  }
  const ownerList = Array.from(owners.entries());
  const hasNumberTotals = fields.some((f) => f.teamTotal?.numberSum != null);

  if (fields.length === 0) {
    return (
      <p className="mt-3 text-xs text-crm-muted">No custom fields configured for this type.</p>
    );
  }

  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[28rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-crm-border text-left">
            <th className="bg-accent-50 px-3 py-2 font-medium text-crm-text">Rep</th>
            {fields.map((f) => (
              <th key={f.fieldKey} className="bg-accent-50 px-3 py-2 font-medium text-crm-text">
                {f.fieldLabel}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ownerList.length === 0 ? (
            <tr>
              <td colSpan={fields.length + 1} className="px-3 py-4 text-center text-xs text-crm-muted">
                No activity values in range.
              </td>
            </tr>
          ) : (
            ownerList.map(([ownerId, ownerName]) => (
              <tr key={ownerId} className="border-b border-crm-border/60">
                <td className="px-3 py-2 text-crm-text">{ownerName ?? ownerId}</td>
                {fields.map((f) => (
                  <td key={f.fieldKey} className="px-3 py-2 text-crm-text">
                    <PerRepCell field={f} ownerId={ownerId} />
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {hasNumberTotals ? (
          <tfoot>
            <tr className="border-t border-crm-border font-medium">
              <td className="px-3 py-2 text-crm-text">Team total</td>
              {fields.map((f) => (
                <td key={f.fieldKey} className="px-3 py-2 text-crm-text">
                  {f.teamTotal?.numberSum != null ? f.teamTotal.numberSum : ""}
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

// ── widget ────────────────────────────────────────────────────────────────
export const ActivityBreakdownWidget = memo(function ActivityBreakdownWidget({
  userRole: _userRole,
}: {
  userRole: string;
}) {
  const metricsQuery = useQuery<{ success: boolean; data: RoleMetricsDto }>({
    queryKey: ["dashboard", "role-metrics"],
    queryFn: fetchRoleMetrics,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const typesQuery = useQuery<{ success: boolean; data: ActivityTypeDefinition[] }>({
    queryKey: ["dashboard", "activity-types"],
    queryFn: fetchActivityTypes,
    staleTime: 5 * 60_000,
  });

  const types = useMemo(
    () => (typesQuery.data?.success ? typesQuery.data.data : []),
    [typesQuery.data],
  );
  const [activityTypeId, setActivityTypeId] = useState("");

  // Default the picker to the first active type once types load.
  useEffect(() => {
    if (!activityTypeId && types.length > 0) {
      setActivityTypeId(types[0].id);
    }
  }, [activityTypeId, types]);

  const aggQuery = useQuery<{ success: boolean; data: ActivityFieldAggregate[] }>({
    queryKey: ["dashboard", "field-aggregates", activityTypeId],
    queryFn: () => fetchFieldAggregates(activityTypeId),
    enabled: !!activityTypeId,
    staleTime: 60_000,
  });

  const byType = readActivitiesByType(metricsQuery.data?.data);
  const fields = aggQuery.data?.success ? aggQuery.data.data : [];

  return (
    <div className="crm-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-crm-text">Activity breakdown</h2>
          <p className="mt-0.5 text-xs text-crm-muted">
            Logged activities by type, and per-rep custom-field aggregates for the selected type.
          </p>
        </div>
        <Activity className="h-8 w-8 text-crm-blue/80" strokeWidth={1.5} aria-hidden />
      </div>

      {/* ── By type ── */}
      <div className="mt-4">
        <h3 className="text-xs font-medium uppercase tracking-wide text-crm-muted">By type</h3>
        {byType.length === 0 ? (
          <p className="mt-2 text-xs text-crm-muted">No activities logged in range.</p>
        ) : (
          <ul className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {byType.map((t) => (
              <li
                key={t.type}
                className="flex items-center justify-between rounded border border-crm-border bg-crm-panel/60 px-3 py-2"
              >
                <span className="truncate text-sm text-crm-text">{t.type}</span>
                <span className="text-lg font-semibold text-crm-text">{t.count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Per-rep field aggregates ── */}
      <div className="mt-5">
        {typesQuery.isLoading ? (
          <p className="text-xs text-crm-muted">Loading activity types…</p>
        ) : types.length === 0 ? (
          <p className="text-xs text-crm-muted">No activity types configured.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-crm-muted">
                Per-rep field aggregates
              </h3>
              <label className="flex items-center gap-2 text-xs text-crm-muted">
                Type
                <select
                  value={activityTypeId}
                  onChange={(e) => setActivityTypeId(e.target.value)}
                  className="rounded border border-crm-border bg-crm-panel px-2 py-1 text-sm text-crm-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
                >
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {aggQuery.isLoading ? (
              <p className="mt-3 text-xs text-crm-muted">Loading aggregates…</p>
            ) : (
              <PerRepTable fields={fields} />
            )}
          </>
        )}
      </div>
    </div>
  );
});
