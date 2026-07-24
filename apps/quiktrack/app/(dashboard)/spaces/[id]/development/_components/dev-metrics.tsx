"use client";

/**
 * Key-metrics grid for the Development tab — matches Jira's layout:
 *   Row 1 (4 wide tiles): Work items completed (w/ sparkline), PR cycle time,
 *     Lead time for changes, Deployment frequency.
 *   Row 2 (5 small tiles): Work items overdue, Work items reopened, Bugs open,
 *     Pull requests open, Vulnerabilities critical.
 * DORA tiles show real computed values, or "0" when there isn't enough data yet
 * (same as Jira).
 */

export interface DevMetrics {
  workItemsCompletedThisWeek: number;
  completedTrend: number[];
  prCycleTimeHours: number | null;
  leadTimeHours: number | null;
  deploymentFrequencyPerWeek: number;
  workItemsOverdue: number;
  workItemsReopened: number;
  bugsOpen: number;
  pullRequestsOpen: number;
  vulnerabilitiesCritical: number;
}

/** Humanize an hours value into Jira-style "2d 1h" / "96m" / "—". */
function fmtDuration(hours: number | null): string {
  if (hours == null) return "—";
  if (hours < 1) return "<1h";
  if (hours < 24) return `${hours}h`;
  const d = Math.floor(hours / 24);
  const h = hours % 24;
  return h ? `${d}d ${h}h` : `${d}d`;
}

export function DevMetricsGrid({ m }: { m: DevMetrics }) {
  return (
    <>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Key metrics</h2>
        <span className="rounded border border-accent-300 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-600 dark:border-accent-500/50 dark:text-accent-400">
          Beta
        </span>
      </div>

      {/* Row 1 — the four headline DORA-style tiles. */}
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <BigTile
          label="Work items"
          value={String(m.workItemsCompletedThisWeek)}
          sub="Completed this week"
          spark={m.completedTrend}
        />
        <BigTile label="Pull request cycle time" value={fmtDuration(m.prCycleTimeHours)} sub="Rolling 7-day median" />
        <BigTile label="Lead time for changes" value={fmtDuration(m.leadTimeHours)} sub="Rolling 12-week average" />
        <BigTile
          label="Deployment frequency"
          value={String(m.deploymentFrequencyPerWeek)}
          sub="Weekly average"
        />
      </div>

      {/* Row 2 — five compact tiles. */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <SmallTile label="Work items" value={m.workItemsOverdue} sub="Overdue" />
        <SmallTile label="Work items" value={m.workItemsReopened} sub="Reopened" />
        <SmallTile label="Bugs" value={m.bugsOpen} sub="Open" />
        <SmallTile label="Pull requests" value={m.pullRequestsOpen} sub="Open" />
        <SmallTile label="Vulnerabilities" value={m.vulnerabilitiesCritical} sub="Critical" />
      </div>
    </>
  );
}

function BigTile({
  label,
  value,
  sub,
  spark,
}: {
  label: string;
  value: string;
  sub: string;
  spark?: number[];
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between">
        <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">{label}</p>
        {spark && spark.length > 1 && <Sparkline data={spark} />}
      </div>
      <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-gray-100">{value}</p>
      <p className="mt-0.5 text-[12px] text-gray-500 dark:text-gray-400">{sub}</p>
    </div>
  );
}

function SmallTile({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
      <p className="text-[12px] font-semibold text-gray-900 dark:text-gray-100">{label}</p>
      <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-gray-100">{value}</p>
      <p className="text-[11px] text-gray-500 dark:text-gray-400">{sub}</p>
    </div>
  );
}

/** Tiny inline SVG sparkline (no chart lib) for the completed-trend. */
function Sparkline({ data }: { data: number[] }) {
  const w = 56, h = 20;
  const max = Math.max(1, ...data);
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const pts = data.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="text-accent-500" aria-hidden>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
