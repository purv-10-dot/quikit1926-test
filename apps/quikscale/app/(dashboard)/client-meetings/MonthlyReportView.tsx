"use client";

/**
 * Read-only rendering of a stored Monthly Report.
 *
 * Every figure was computed in TypeScript from the weekly snapshots — the
 * model contributed only the prose. Trends are drawn as inline sparklines
 * rather than a chart library: four to five points per metric do not justify a
 * dependency, and an SVG polyline stays crisp in a modal at any width.
 */

import type { StoredMonthlyReport } from "@/lib/reports/monthlyCompose";
import { Chip, SectionCard, StatRow, StatTile, pctText } from "./reportUi";

type Trend = StoredMonthlyReport["trends"][number];

const directionChip = (d: Trend["direction"]) => {
  switch (d) {
    case "IMPROVING":
      return { label: "Improving", cls: "bg-green-100 text-green-700" };
    case "DECLINING":
      return { label: "Declining", cls: "bg-red-100 text-red-700" };
    case "VOLATILE":
      return { label: "Volatile", cls: "bg-amber-100 text-amber-800" };
    case "STABLE":
      return { label: "Stable", cls: "bg-blue-100 text-blue-700" };
    default:
      return { label: "Not enough data", cls: "bg-gray-100 text-gray-600" };
  }
};

/**
 * A tiny trend line. Missing points break the line rather than being
 * interpolated — a week with no report is not a week that scored the average.
 */
function Sparkline({ points }: { points: Trend["points"] }) {
  const values = points.map((p) => p.value).filter((v): v is number => v != null);
  if (values.length < 2) return <span className="text-[10.5px] text-gray-400">—</span>;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 72;
  const h = 20;
  const step = points.length > 1 ? w / (points.length - 1) : w;

  const segments: string[] = [];
  let current: string[] = [];
  points.forEach((p, i) => {
    if (p.value == null) {
      if (current.length > 1) segments.push(current.join(" "));
      current = [];
      return;
    }
    const x = i * step;
    const y = h - ((p.value - min) / span) * h;
    current.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  });
  if (current.length > 1) segments.push(current.join(" "));

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible" aria-hidden="true">
      {segments.map((s, i) => (
        <polyline key={i} points={s} fill="none" strokeWidth="1.5" className="stroke-accent-500" />
      ))}
    </svg>
  );
}

export function MonthlyReportView({ report }: { report: StoredMonthlyReport }) {
  const www = report.www;

  return (
    <div className="space-y-4">
      <StatRow>
        <StatTile
          label="Weeks reported"
          value={`${report.coverage.weeksReported}/${report.coverage.weeksTotal}`}
          hint={
            report.coverage.missingWeeks.length
              ? `Missing: ${report.coverage.missingWeeks.join(", ")}`
              : "Every week in the month is covered"
          }
          tone={report.coverage.missingWeeks.length ? "warn" : "good"}
        />
        <StatTile
          label="WWW completion"
          value={pctText(www.completionRate)}
          hint={`${www.completed} of ${www.total} completed`}
          tone={
            www.completionRate == null ? "neutral" : www.completionRate >= 80 ? "good" : www.completionRate >= 60 ? "warn" : "bad"
          }
        />
        <StatTile
          label="Overdue"
          value={pctText(www.overdueRate)}
          hint={`${www.overdue} item${www.overdue === 1 ? "" : "s"}`}
          tone={www.overdueRate == null ? "neutral" : www.overdueRate > 20 ? "bad" : www.overdueRate > 10 ? "warn" : "good"}
        />
        <StatTile
          label="Avg days to close"
          value={www.averageDaysToClose == null ? "—" : www.averageDaysToClose.toFixed(1)}
          hint={`${www.carriedForward} carried forward · ${www.cancelled} cancelled`}
        />
      </StatRow>

      {!report.coverage.weeklyMeetingsIncluded ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          Weekly meeting reports are not part of this month — extraction has not run for them, so the
          month is built from daily huddle rollups alone.
        </div>
      ) : null}

      <SectionCard
        title="Trends"
        subtitle={
          report.materialTrends.length
            ? `${report.materialTrends.length} material movement${report.materialTrends.length === 1 ? "" : "s"}`
            : "No movement large enough to call material"
        }
      >
        {report.trends.length === 0 ? (
          <p className="text-xs text-gray-500">No metrics had enough weeks to trend.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr>
                  {["Metric", "Trend", "First → Last", "Change", "Direction"].map((h) => (
                    <th key={h} className="whitespace-nowrap bg-accent-50 px-2 py-1.5 font-semibold text-gray-700">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.trends.map((t) => {
                  const dir = directionChip(t.direction);
                  return (
                    <tr key={t.metric} className="border-t border-gray-100">
                      <td className="px-2 py-1.5">
                        <span className="font-medium text-gray-800">{t.metric}</span>
                        {t.significant ? (
                          <span className="ml-1 text-[10px] text-amber-600" title="Material movement">
                            ●
                          </span>
                        ) : null}
                        <p className="text-[10.5px] text-gray-500">{t.summary}</p>
                      </td>
                      <td className="px-2 py-1.5">
                        <Sparkline points={t.points} />
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-gray-600">
                        {t.first ?? "—"} → {t.last ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-gray-600">
                        {t.delta == null ? "—" : `${t.delta > 0 ? "+" : ""}${t.delta.toFixed(1)}`}
                        {t.deltaPct == null ? "" : ` (${t.deltaPct > 0 ? "+" : ""}${t.deltaPct.toFixed(0)}%)`}
                      </td>
                      <td className="px-2 py-1.5">
                        <Chip className={dir.cls}>{dir.label}</Chip>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {report.recurringStucks.length ? (
        <SectionCard
          title="Recurring stucks"
          subtitle="Blockers raised in more than one week — the month's real friction"
        >
          <ul className="space-y-2">
            {report.recurringStucks.map((s, i) => (
              <li key={i} className="rounded-lg border border-gray-200 px-3 py-2">
                <p className="text-xs font-medium text-gray-800">{s.description}</p>
                <p className="mt-0.5 text-[11px] text-gray-600">
                  {s.occurrences} mention{s.occurrences === 1 ? "" : "s"} across {s.weeksSeen} week
                  {s.weeksSeen === 1 ? "" : "s"}
                  {s.raisedBy.length ? ` · raised by ${s.raisedBy.join(", ")}` : ""}
                </p>
                {s.latestStatusStated ? (
                  <p className="mt-0.5 text-[11px] text-gray-500">Latest status: {s.latestStatusStated}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      {report.noStuckOutliers.length ? (
        <SectionCard
          title="Never reported a stuck"
          subtitle="Attended consistently but never raised a blocker — worth a conversation, not a conclusion"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr>
                  {["Member", "No-stuck rate", "Huddles attended", "Stuck adherence"].map((h) => (
                    <th key={h} className="whitespace-nowrap bg-accent-50 px-2 py-1.5 font-semibold text-gray-700">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.noStuckOutliers.map((o) => (
                  <tr key={o.name} className="border-t border-gray-100">
                    <td className="px-2 py-1.5 font-medium text-gray-800">{o.name}</td>
                    <td className="px-2 py-1.5 tabular-nums text-gray-600">{pctText(o.noStuckRate)}</td>
                    <td className="px-2 py-1.5 tabular-nums text-gray-600">{o.huddlesAttended}</td>
                    <td className="px-2 py-1.5 tabular-nums text-gray-600">{pctText(o.stuckAdherencePct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : null}

      {report.wwwObservation ? (
        <SectionCard title="WWW observation">
          <p className="text-xs text-gray-700">{report.wwwObservation}</p>
        </SectionCard>
      ) : null}

      <SectionCard title="Key observations">
        <ul className="list-disc space-y-1 pl-4 text-xs text-gray-700">
          {report.keyObservations.map((o, i) => (
            <li key={i}>{o}</li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="Recommendations">
        <ul className="list-disc space-y-1 pl-4 text-xs text-gray-700">
          {report.recommendations.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}
