"use client";

import { useEffect, useMemo, useState } from "react";
import { ChartTip } from "../../summary/_components/chart-tip";

/** One completed sprint's frozen velocity, as GET …/reports/velocity returns. */
interface VelocitySprint {
  sprintId: string;
  sprintName: string;
  completedAt: string | null;
  committedPoints: number;
  completedPoints: number;
  committedHours: number;
  completedHours: number;
  committedCount: number;
  completedCount: number;
  completionPct: number;
}
interface VelocityData {
  sprints: VelocitySprint[];
  averagePoints: number;
  averageHours: number;
  hasEstimates: boolean;
  hasHours: boolean;
}

type Metric = "points" | "hours";

const COMMITTED = "#93c5fd"; // blue-300 — committed scope
const COMPLETED = "#2563eb"; // blue-600 — completed (velocity)

export function VelocityReport({ projectId }: { projectId: string }) {
  const [data, setData] = useState<VelocityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [metric, setMetric] = useState<Metric>("points");

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

  const sprints = useMemo(() => data?.sprints ?? [], [data]);

  // Per-metric accessors so the chart/table are metric-agnostic.
  const committedOf = (s: VelocitySprint) =>
    metric === "points" ? s.committedPoints : s.committedHours;
  const completedOf = (s: VelocitySprint) =>
    metric === "points" ? s.completedPoints : s.completedHours;
  const average = metric === "points" ? data?.averagePoints ?? 0 : data?.averageHours ?? 0;
  const unit = metric === "points" ? "pts" : "h";

  const maxVal = useMemo(
    () =>
      Math.max(
        1,
        ...sprints.map((s) =>
          metric === "points"
            ? Math.max(s.committedPoints, s.completedPoints)
            : Math.max(s.committedHours, s.completedHours),
        ),
      ),
    [sprints, metric],
  );

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
        <div className="mt-4 h-[200px] max-w-3xl animate-pulse rounded bg-gray-50" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <VelocityHeader metric={metric} onMetric={setMetric} showToggle={false} />
        <EmptyState
          title="Couldn't load the velocity report"
          body="Something went wrong fetching sprint data. Refresh the page to try again."
        />
      </div>
    );
  }

  if (sprints.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <VelocityHeader metric={metric} onMetric={setMetric} showToggle={false} />
        <EmptyState
          title="No completed sprints yet"
          body="Velocity is recorded when you complete a sprint. Once you complete your first sprint from the Backlog, its committed vs completed work will appear here."
        />
      </div>
    );
  }

  const hasEstimates = metric === "points" ? data?.hasEstimates : data?.hasHours;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <VelocityHeader metric={metric} onMetric={setMetric} showToggle />

      {!hasEstimates && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          These completed sprints have no {metric === "points" ? "story points" : "estimated hours"} recorded,
          so velocity is 0. {metric === "points" ? "Add story-point estimates" : "Set estimated hours (ETA)"} on
          work items before completing a sprint to see velocity here.
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-gray-600">
        <LegendSwatch color={COMMITTED} label="Committed" />
        <LegendSwatch color={COMPLETED} label="Completed (velocity)" />
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0 w-4 border-t-2 border-dashed border-gray-400" />
          Average: <span className="font-medium tabular-nums text-gray-800">{average} {unit}</span>
        </span>
      </div>

      {/* Clustered column chart — committed vs completed per COMPLETED sprint.
          Pure CSS bars. NO overflow-* on this wrapper: `overflow-x-auto` forces
          overflow-y to compute as `auto`, which clips the hover tooltip that
          renders above the bars. Columns are flex-1 so they fit the card width
          without needing horizontal scroll. pt-16 reserves headroom so the
          tooltip has somewhere to render inside the card. */}
      <div className="relative z-20 mt-2 pt-16">
        <div className="w-full px-2">
          <div className="relative flex h-[180px] items-end gap-6">
            {average > 0 && (
              <div
                className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-dashed border-gray-400/70"
                style={{ bottom: `${(average / maxVal) * 180}px` }}
              />
            )}
            {sprints.map((s) => (
              <SprintColumn
                key={s.sprintId}
                sprint={s}
                committed={committedOf(s)}
                completed={completedOf(s)}
                unit={unit}
                maxVal={maxVal}
              />
            ))}
          </div>
          <div className="border-t border-gray-200" />
          <div className="flex gap-6">
            {sprints.map((s) => (
              <div key={s.sprintId} className="flex min-w-[96px] flex-1 flex-col items-center pt-1.5">
                <span className="block max-w-[110px] truncate text-center text-[11px] text-gray-600" title={s.sprintName}>
                  {s.sprintName}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <VelocityTable sprints={sprints} committedOf={committedOf} completedOf={completedOf} average={average} unit={unit} />
    </div>
  );
}

function VelocityHeader({
  metric,
  onMetric,
  showToggle,
}: {
  metric: Metric;
  onMetric: (m: Metric) => void;
  showToggle: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">Velocity report</h2>
        <p className="mt-1 text-xs text-gray-600">
          Committed vs completed work per completed sprint. Use it to predict how
          much the team can take on in future sprints. Only completed sprints are
          shown; bugs, epics and subtasks are excluded.
        </p>
      </div>
      {showToggle && (
        <div className="flex shrink-0 rounded-md border border-gray-200 p-0.5 text-xs">
          <MetricButton active={metric === "points"} onClick={() => onMetric("points")}>
            Story points
          </MetricButton>
          <MetricButton active={metric === "hours"} onClick={() => onMetric("hours")}>
            Est. hours
          </MetricButton>
        </div>
      )}
    </div>
  );
}

function MetricButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-2.5 py-1 font-medium transition-colors ${
        active ? "bg-accent-100 text-accent-700" : "text-gray-500 hover:text-gray-700"
      }`}
    >
      {children}
    </button>
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
  committed,
  completed,
  unit,
  maxVal,
}: {
  sprint: VelocitySprint;
  committed: number;
  completed: number;
  unit: string;
  maxVal: number;
}) {
  return (
    <div className="flex h-full min-w-[96px] flex-1 items-end justify-center gap-1.5">
      <Bar
        color={COMMITTED}
        heightPx={(committed / maxVal) * 180}
        value={committed}
        tip={<Tip name={sprint.sprintName} series="Committed" value={committed} unit={unit} count={sprint.committedCount} />}
      />
      <Bar
        color={COMPLETED}
        heightPx={(completed / maxVal) * 180}
        value={completed}
        tip={<Tip name={sprint.sprintName} series="Completed" value={completed} unit={unit} count={sprint.completedCount} />}
      />
    </div>
  );
}

function Bar({
  color,
  heightPx,
  value,
  tip,
}: {
  color: string;
  heightPx: number;
  value: number;
  tip: React.ReactNode;
}) {
  return (
    <ChartTip content={tip} className="flex h-full items-end">
      <div className="flex w-7 cursor-pointer flex-col items-center justify-end">
        <span className="mb-1 text-[10px] font-medium tabular-nums text-gray-600">
          {value > 0 ? value : ""}
        </span>
        <div
          className="w-full rounded-t-sm"
          style={{ height: `${value > 0 ? Math.max(heightPx, 3) : 0}px`, background: color }}
        />
      </div>
    </ChartTip>
  );
}

function Tip({
  name,
  series,
  value,
  unit,
  count,
}: {
  name: string;
  series: string;
  value: number;
  unit: string;
  count: number;
}) {
  return (
    <>
      <span className="font-medium text-gray-900">{name}</span>
      <span className="flex items-center gap-2 text-gray-600">
        {series}
        <span className="tabular-nums text-gray-900">{value} {unit}</span>
        <span className="tabular-nums text-gray-400">· {count} items</span>
      </span>
    </>
  );
}

function VelocityTable({
  sprints,
  committedOf,
  completedOf,
  average,
  unit,
}: {
  sprints: VelocitySprint[];
  committedOf: (s: VelocitySprint) => number;
  completedOf: (s: VelocitySprint) => number;
  average: number;
  unit: string;
}) {
  return (
    <div className="mt-6 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
            <th className="bg-accent-50 py-2 pl-3 pr-4 font-medium">Sprint</th>
            <th className="bg-accent-50 py-2 pr-4 text-right font-medium">Committed</th>
            <th className="bg-accent-50 py-2 pr-4 text-right font-medium">Completed</th>
            <th className="bg-accent-50 py-2 pr-4 text-right font-medium">Completion</th>
            <th className="bg-accent-50 py-2 pr-4 text-right font-medium">Completed on</th>
          </tr>
        </thead>
        <tbody>
          {sprints.map((s) => (
            <tr key={s.sprintId} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="py-2 pl-3 pr-4 text-gray-800">{s.sprintName}</td>
              <td className="py-2 pr-4 text-right tabular-nums text-gray-700">{committedOf(s)}</td>
              <td className="py-2 pr-4 text-right tabular-nums text-gray-900">{completedOf(s)}</td>
              <td className="py-2 pr-4 text-right tabular-nums text-gray-500">
                {s.completionPct}%
              </td>
              <td className="py-2 pr-4 text-right tabular-nums text-gray-500">
                {s.completedAt ? new Date(s.completedAt).toLocaleDateString() : "—"}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="text-xs text-gray-500">
            <td className="py-2 pl-3 pr-4 font-medium text-gray-700">Average velocity</td>
            <td />
            <td className="py-2 pr-4 text-right font-semibold tabular-nums text-gray-900">
              {average} {unit}
            </td>
            <td />
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
