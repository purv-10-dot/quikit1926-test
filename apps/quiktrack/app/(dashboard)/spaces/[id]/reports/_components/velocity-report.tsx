"use client";

import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { ChartTip } from "../../summary/_components/chart-tip";

/** Shape returned by GET /api/projects/[id]/reports/velocity. */
interface VelocitySprint {
  sprintId: string;
  sprintName: string;
  status: string;
  committedPoints: number;
  completedPoints: number;
  committedCount: number;
  completedCount: number;
  fromSnapshot: boolean;
}
interface VelocityData {
  metric: string;
  sprints: VelocitySprint[];
  average: number;
  hasEstimates: boolean;
}

const COMMITTED = "#93c5fd"; // blue-300 — planned scope
const COMPLETED = "#2563eb"; // blue-600 — delivered (velocity)

export function VelocityReport({ projectId }: { projectId: string }) {
  const [data, setData] = useState<VelocityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    fetch(`/api/projects/${projectId}/reports/velocity`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j?.success) setData(j.data);
        else setError(true);
      })
      .catch(() => alive && setError(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [projectId]);

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
        <div className="mt-6 h-[260px] animate-pulse rounded bg-gray-50" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <VelocityHeader />
        <EmptyState
          title="Couldn't load the velocity report"
          body="Something went wrong fetching sprint data. Refresh the page to try again."
        />
      </div>
    );
  }

  const sprints = data?.sprints ?? [];
  const average = data?.average ?? 0;
  const hasEstimates = data?.hasEstimates ?? false;

  if (sprints.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <VelocityHeader />
        <EmptyState
          title="No sprint data yet"
          body="Start a sprint from the Backlog to begin tracking velocity. Committed story points are captured when a sprint starts; completed points are recorded when it finishes."
        />
      </div>
    );
  }

  const maxPoints = Math.max(
    1,
    ...sprints.map((s) => Math.max(s.committedPoints, s.completedPoints)),
  );

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <VelocityHeader />

      {/* Sprints exist but nothing is estimated → the bars would all be zero.
          Explain why instead of showing a flat, confusing chart. */}
      {!hasEstimates && (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            These sprints have no story points assigned, so velocity is 0. Add
            story-point estimates to work items in the Backlog to see committed
            vs completed velocity here.
          </span>
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-gray-600">
        <LegendSwatch color={COMMITTED} label="Committed" />
        <LegendSwatch color={COMPLETED} label="Completed (velocity)" />
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0 w-4 border-t-2 border-dashed border-gray-400" />
          Average: <span className="font-medium tabular-nums text-gray-800">{average}</span>
        </span>
      </div>

      {/* Clustered column chart — committed vs completed per sprint. Pure CSS
          bars (matches the Summary charts; no charting dependency). The plot
          area is a fixed 220px tall; the average line sits at its proportional
          height and the sprint labels live in normal flow beneath it. */}
      <div className="mt-5 overflow-x-auto">
        <div className="min-w-max px-2">
          <div className="relative flex h-[220px] items-end gap-6">
            {/* Average reference line across the plot area. */}
            {average > 0 && (
              <div
                className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-dashed border-gray-400/70"
                style={{ bottom: `${(average / maxPoints) * 220}px` }}
              />
            )}
            {sprints.map((s) => (
              <SprintColumn key={s.sprintId} sprint={s} maxPoints={maxPoints} />
            ))}
          </div>
          <div className="border-t border-gray-200" />
          <div className="flex gap-6">
            {sprints.map((s) => (
              <div key={s.sprintId} className="flex min-w-[96px] flex-1 flex-col items-center pt-1.5">
                <span className="block max-w-[110px] truncate text-center text-[11px] text-gray-600" title={s.sprintName}>
                  {s.sprintName}
                </span>
                {!s.fromSnapshot && (
                  <span className="text-[9px] font-medium uppercase tracking-wide text-amber-600">
                    in progress
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <VelocityTable sprints={sprints} average={average} />
    </div>
  );
}

function VelocityHeader() {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">Velocity report</h2>
        <p className="mt-1 text-xs text-gray-600">
          Committed vs completed story points per sprint. Use it to predict how
          much work the team can take on in future sprints. Bugs, epics and
          subtasks are excluded.
        </p>
      </div>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-6 flex flex-col items-center justify-center rounded-md border border-dashed border-gray-200 bg-gray-50/60 py-14 text-center">
      <p className="text-sm font-medium text-gray-700">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-gray-500">{body}</p>
    </div>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

function SprintColumn({
  sprint,
  maxPoints,
}: {
  sprint: VelocitySprint;
  maxPoints: number;
}) {
  const committedH = (sprint.committedPoints / maxPoints) * 220;
  const completedH = (sprint.completedPoints / maxPoints) * 220;
  const isLive = !sprint.fromSnapshot;
  return (
    <div className="flex h-full min-w-[96px] flex-1 items-end justify-center gap-1.5">
      <Bar color={COMMITTED} heightPx={committedH} points={sprint.committedPoints}
        tip={<Tip name={sprint.sprintName} series="Committed" points={sprint.committedPoints} count={sprint.committedCount} live={isLive} />}
      />
      <Bar color={COMPLETED} heightPx={completedH} points={sprint.completedPoints}
        tip={<Tip name={sprint.sprintName} series="Completed" points={sprint.completedPoints} count={sprint.completedCount} live={isLive} />}
      />
    </div>
  );
}

function Bar({
  color,
  heightPx,
  points,
  tip,
}: {
  color: string;
  heightPx: number;
  points: number;
  tip: React.ReactNode;
}) {
  return (
    <ChartTip content={tip} className="flex h-full items-end">
      <div className="flex w-7 cursor-pointer flex-col items-center justify-end">
        <span className="mb-1 text-[10px] font-medium tabular-nums text-gray-600">
          {points > 0 ? points : ""}
        </span>
        <div
          className="w-full rounded-t-sm"
          style={{ height: `${points > 0 ? Math.max(heightPx, 3) : 0}px`, background: color }}
        />
      </div>
    </ChartTip>
  );
}

function Tip({
  name,
  series,
  points,
  count,
  live,
}: {
  name: string;
  series: string;
  points: number;
  count: number;
  live: boolean;
}) {
  return (
    <>
      <span className="font-medium text-gray-900">{name}</span>
      <span className="flex items-center gap-2 text-gray-600">
        {series}
        <span className="tabular-nums text-gray-900">{points} pts</span>
        <span className="tabular-nums text-gray-400">· {count} items</span>
      </span>
      {live && <span className="text-[10px] text-amber-600">Live estimate — sprint not yet completed</span>}
    </>
  );
}

function VelocityTable({
  sprints,
  average,
}: {
  sprints: VelocitySprint[];
  average: number;
}) {
  const anyLive = sprints.some((s) => !s.fromSnapshot);
  return (
    <div className="mt-6 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
            <th className="bg-accent-50 py-2 pl-3 pr-4 font-medium">Sprint</th>
            <th className="bg-accent-50 py-2 pr-4 text-right font-medium">Committed</th>
            <th className="bg-accent-50 py-2 pr-4 text-right font-medium">Completed</th>
            <th className="bg-accent-50 py-2 pr-4 text-right font-medium">Completion</th>
          </tr>
        </thead>
        <tbody>
          {sprints.map((s) => {
            const pct = s.committedPoints > 0
              ? Math.round((s.completedPoints / s.committedPoints) * 100)
              : 0;
            return (
              <tr key={s.sprintId} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 pl-3 pr-4 text-gray-800">
                  {s.sprintName}
                  {!s.fromSnapshot && <span className="ml-1 text-gray-400">*</span>}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums text-gray-700">{s.committedPoints}</td>
                <td className="py-2 pr-4 text-right tabular-nums text-gray-900">{s.completedPoints}</td>
                <td className="py-2 pr-4 text-right tabular-nums text-gray-500">
                  {s.committedPoints > 0 ? `${pct}%` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="text-xs text-gray-500">
            <td className="py-2 pl-3 pr-4 font-medium text-gray-700">Average velocity</td>
            <td />
            <td className="py-2 pr-4 text-right font-semibold tabular-nums text-gray-900">{average}</td>
            <td />
          </tr>
        </tfoot>
      </table>
      {anyLive && (
        <p className="mt-2 flex items-center gap-1.5 pl-3 text-[11px] text-gray-500">
          <Info className="h-3 w-3" />
          <span>* Live estimate — figures update until the sprint is completed.</span>
        </p>
      )}
    </div>
  );
}
