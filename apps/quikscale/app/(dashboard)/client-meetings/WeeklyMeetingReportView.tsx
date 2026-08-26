"use client";

/**
 * Read-only rendering of a stored Weekly Meeting Report.
 *
 * Every value here was computed server-side (`wmCompose`) — this component
 * formats, it never derives. Where a section is empty it says WHY (the report
 * records `unavailableReason` and `deferred` for exactly this), because an
 * empty table that looks like "nothing happened" is worse than no table.
 */

import type { StoredWmReport } from "@/lib/reports/wmCompose";
import { Chip, SectionCard, StatRow, StatTile, ragClass, pctText } from "./reportUi";
import {
  WwwReviewSection,
  type WwwReviewRowView,
} from "./www/WwwReviewSection";

const attendanceTone = (state: string) => {
  const s = state.toUpperCase();
  if (s === "PRESENT") return "bg-green-100 text-green-700";
  if (s === "ABSENT") return "bg-red-100 text-red-700";
  if (s === "PARTIAL") return "bg-amber-100 text-amber-800";
  return "bg-gray-100 text-gray-600";
};

const coverageTone = (coverage: string) => {
  const c = coverage.toUpperCase();
  if (c.startsWith("FULL") || c === "COVERED" || c === "YES") return "bg-green-100 text-green-700";
  if (c.startsWith("PART")) return "bg-amber-100 text-amber-800";
  if (c.startsWith("NOT") || c === "NO" || c === "MISSED") return "bg-red-100 text-red-700";
  return "bg-gray-100 text-gray-600";
};

/** Render one of the P7-owned WWW sections, whose rows are opaque records. */
function WwwSection({
  title,
  section,
}: {
  title: string;
  section: StoredWmReport["wwwReview"];
}) {
  if (!section.available) {
    return (
      <SectionCard title={title}>
        <p className="text-xs text-gray-500">
          {section.unavailableReason ?? "This section was not available for this meeting."}
        </p>
      </SectionCard>
    );
  }
  const rows = section.rows ?? [];
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))].slice(0, 6);

  return (
    <SectionCard
      title={title}
      subtitle={`${rows.length} item${rows.length === 1 ? "" : "s"}`}
      action={
        section.scopeLimited ? (
          <Chip className="bg-amber-100 text-amber-800">Scope limited</Chip>
        ) : null
      }
    >
      {rows.length === 0 ? (
        <p className="text-xs text-gray-500">No items recorded.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c} className="whitespace-nowrap bg-accent-50 px-2 py-1.5 font-semibold capitalize text-gray-700">
                    {c.replace(/([A-Z])/g, " $1").trim()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-gray-100">
                  {columns.map((c) => (
                    <td key={c} className="px-2 py-1.5 align-top text-gray-700">
                      {formatCell(r[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

function formatCell(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function DiscussionList({ title, rows }: { title: string; rows: Record<string, unknown>[] }) {
  if (!rows.length) return null;
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{title}</p>
      <ul className="space-y-1 text-xs text-gray-700">
        {rows.map((r, i) => (
          <li key={i} className="rounded-lg bg-gray-50 px-2.5 py-1.5">
            {formatCell(
              r.summary ?? r.description ?? r.text ?? r.point ?? r.item ?? r,
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WeeklyMeetingReportView({ report }: { report: StoredWmReport }) {
  const d = report.discussions;
  const hasDiscussion =
    d.goodNews.length + d.customerFeedback.length + d.employeeFeedback.length + d.collectiveIntelligence.length > 0;

  return (
    <div className="space-y-4">
      {/* Headline numbers */}
      <StatRow>
        <StatTile
          label="Attendance"
          value={pctText(report.attendance.attendancePct)}
          hint={`${report.attendance.present} of ${report.attendance.expected} expected`}
          tone={
            report.attendance.attendancePct == null
              ? "neutral"
              : report.attendance.attendancePct >= 90
                ? "good"
                : report.attendance.attendancePct >= 75
                  ? "warn"
                  : "bad"
          }
        />
        <StatTile
          label="K&P reviewed"
          value={`${report.kpDashboard.reviewed}/${report.kpDashboard.expected}`}
          hint="Members whose KPIs and priorities were reviewed"
        />
        <StatTile
          label="Gaps raised"
          value={report.gaps.rows.length}
          hint={`${report.gaps.withoutAction} without an agreed action`}
          tone={report.gaps.withoutAction > 0 ? "warn" : "neutral"}
        />
        <StatTile
          label="Overall"
          value={report.scorecard.overall.reading || "—"}
          hint={`RAG ${report.scorecard.overall.rag || "—"}`}
          tone={
            report.scorecard.overall.rag?.toUpperCase().startsWith("G")
              ? "good"
              : report.scorecard.overall.rag?.toUpperCase().startsWith("R")
                ? "bad"
                : "warn"
          }
        />
      </StatRow>

      {/* Coverage — stated first, because it qualifies everything below it. */}
      <SectionCard
        title="Coverage"
        subtitle={
          report.coverage.extractionRan
            ? `${report.coverage.completeness === "COMPLETE" ? "Complete" : "Partial"} reading of the meeting${
                report.coverage.coveragePct != null ? ` · ${report.coverage.coveragePct}%` : ""
              }`
            : "Extraction has not run for this meeting"
        }
      >
        {report.coverage.missingWindows.length === 0 && report.coverage.incompleteSections.length === 0 ? (
          <p className="text-xs text-gray-600">The whole meeting was read — no gaps to declare.</p>
        ) : (
          <div className="space-y-2 text-xs text-gray-700">
            {report.coverage.missingWindows.length ? (
              <div>
                <p className="font-medium text-gray-800">Windows not read</p>
                <ul className="mt-1 list-disc pl-4">
                  {report.coverage.missingWindows.map((w) => (
                    <li key={`${w.startMs}-${w.endMs}`}>{w.label}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {report.coverage.incompleteSections.length ? (
              <div>
                <p className="font-medium text-gray-800">Sections read only in part</p>
                <p className="mt-0.5">{report.coverage.incompleteSections.join(", ")}</p>
              </div>
            ) : null}
          </div>
        )}
      </SectionCard>

      {/* 1 — attendance */}
      <SectionCard
        title="Attendance"
        subtitle={`${report.attendance.present} present · ${report.attendance.absent} absent · ${report.attendance.onLeave} on leave · ${report.attendance.unknown} unknown`}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr>
                {["Member", "Role", "Type", "State", "Evidence"].map((h) => (
                  <th key={h} className="whitespace-nowrap bg-accent-50 px-2 py-1.5 font-semibold text-gray-700">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.attendance.rows.map((r) => (
                <tr key={r.memberId} className="border-t border-gray-100">
                  <td className="px-2 py-1.5 font-medium text-gray-800">{r.name}</td>
                  <td className="px-2 py-1.5 text-gray-600">{r.role ?? "—"}</td>
                  <td className="px-2 py-1.5 text-gray-600">{r.attendanceType}</td>
                  <td className="px-2 py-1.5">
                    <Chip className={attendanceTone(r.state)}>{r.state}</Chip>
                  </td>
                  <td className="px-2 py-1.5 text-[10.5px] text-gray-500">
                    {r.evidence.replace(/_/g, " ").toLowerCase()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* 2 — agenda coverage */}
      <SectionCard title="Agenda coverage" subtitle={report.agenda.observation ?? undefined}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr>
                {["Segment", "Coverage", "Time discipline", "Planned", "Actual"].map((h) => (
                  <th key={h} className="whitespace-nowrap bg-accent-50 px-2 py-1.5 font-semibold text-gray-700">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.agenda.rows.map((r) => (
                <tr key={r.key} className="border-t border-gray-100">
                  <td className="px-2 py-1.5 font-medium text-gray-800">
                    {r.label}
                    {r.flagDisagrees ? (
                      <span
                        className="ml-1 text-amber-600"
                        title="The human flag on the Weekly Meeting record disagrees with what the transcript shows"
                      >
                        ⚠
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5">
                    <Chip className={coverageTone(r.coverage)}>{r.coverage}</Chip>
                  </td>
                  <td className="px-2 py-1.5 text-gray-600">{r.timeDiscipline}</td>
                  <td className="px-2 py-1.5 tabular-nums text-gray-600">{r.expectedMinutes} min</td>
                  <td className="px-2 py-1.5 tabular-nums text-gray-600">
                    {r.actualMinutes == null ? "—" : `${r.actualMinutes} min`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* 3 — K&P dashboard */}
      <SectionCard
        title="KPI & Priority dashboard"
        subtitle={`${report.kpDashboard.reviewed} of ${report.kpDashboard.expected} members reviewed`}
      >
        <div className="space-y-2">
          {report.kpDashboard.rows.map((r) => (
            <div key={r.name} className="rounded-lg border border-gray-200 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-gray-800">{r.name}</span>
                {r.role ? <span className="text-[11px] text-gray-500">{r.role}</span> : null}
                <Chip className={ragClass(r.kpiRag)}>KPI {r.kpiRag}</Chip>
                <Chip className={ragClass(r.priorityRag)}>Priority {r.priorityRag}</Chip>
                {r.ragConflict ? (
                  <Chip className="bg-amber-100 text-amber-800">RAG conflict</Chip>
                ) : null}
                {r.notApplicable ? <Chip className="bg-gray-100 text-gray-600">N/A</Chip> : null}
              </div>
              {r.keyPoints.length ? (
                <ul className="mt-1.5 list-disc pl-4 text-xs text-gray-700">
                  {r.keyPoints.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
          {report.kpDashboard.rows.length === 0 ? (
            <p className="text-xs text-gray-500">No K&P review was recorded in this meeting.</p>
          ) : null}
        </div>
      </SectionCard>

      {/* 4 — gaps */}
      <SectionCard
        title="Gaps"
        subtitle={report.gaps.observation ?? `${report.gaps.teamWide} team-wide · ${report.gaps.withoutAction} without an agreed action`}
      >
        {report.gaps.rows.length === 0 ? (
          <p className="text-xs text-gray-500">No gaps were raised.</p>
        ) : (
          <ul className="space-y-2">
            {report.gaps.rows.map((g, i) => (
              <li key={i} className="rounded-lg border border-gray-200 px-3 py-2">
                <p className="text-xs font-medium text-gray-800">{g.gap}</p>
                <p className="mt-0.5 text-[11px] text-gray-600">
                  {g.agreedAction ? (
                    <>
                      Action: {g.agreedAction}
                      {g.owner ? ` · ${g.owner}` : ""}
                    </>
                  ) : (
                    <span className="text-amber-700">No agreed action was recorded.</span>
                  )}
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Chip className="bg-gray-100 text-gray-600">{g.scope}</Chip>
                  {g.severityStated ? (
                    <Chip className="bg-gray-100 text-gray-600">{g.severityStated}</Chip>
                  ) : null}
                  {g.raisedBy.length ? (
                    <span className="text-[10.5px] text-gray-500">Raised by {g.raisedBy.join(", ")}</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* 5 & 6 — WWW */}
      {/* Review has a purpose-built renderer: its rows carry a specific
          previous→current status contract that the generic key-dump below
          cannot express, and the format asks for them grouped by person. */}
      <WwwReviewSection
        title="WWW review"
        rows={(report.wwwReview.rows ?? []) as WwwReviewRowView[]}
        unavailableReason={report.wwwReview.unavailableReason}
        scopeLimited={report.wwwReview.scopeLimited}
      />
      <WwwSection title="New WWW" section={report.newWww} />

      {/* 7 — discussions */}
      <SectionCard
        title="Discussions"
        subtitle={
          report.discussions.deferred.length
            ? `Deferred: ${report.discussions.deferred.join(", ")}`
            : undefined
        }
      >
        {hasDiscussion ? (
          <div className="space-y-3">
            <DiscussionList title="Good news" rows={d.goodNews} />
            <DiscussionList title="Customer feedback" rows={d.customerFeedback} />
            <DiscussionList title="Employee feedback" rows={d.employeeFeedback} />
            <DiscussionList title="Collective intelligence" rows={d.collectiveIntelligence} />
          </div>
        ) : (
          <p className="text-xs text-gray-500">
            No discussion items were recorded
            {report.discussions.deferred.length ? " — the segments above were deferred." : "."}
          </p>
        )}
      </SectionCard>

      {/* 8 — scorecard + narrative */}
      <SectionCard
        title="Scorecard"
        subtitle={`Overall: ${report.scorecard.overall.reading || "—"}`}
        action={<Chip className={ragClass(report.scorecard.overall.rag)}>{report.scorecard.overall.rag || "—"}</Chip>}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr>
                {["#", "Metric", "Reading", "RAG"].map((h) => (
                  <th key={h} className="whitespace-nowrap bg-accent-50 px-2 py-1.5 font-semibold text-gray-700">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.scorecard.metrics.map((m) => (
                <tr key={m.n} className="border-t border-gray-100">
                  <td className="px-2 py-1.5 tabular-nums text-gray-500">{m.n}</td>
                  <td className="px-2 py-1.5 text-gray-800">
                    {m.label}
                    {m.derivedProxy ? (
                      <span className="ml-1 text-[10px] text-gray-400" title="Derived from a proxy signal, not measured directly">
                        (proxy)
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5 text-gray-700">{m.reading}</td>
                  <td className="px-2 py-1.5">
                    <Chip className={ragClass(m.rag)}>{m.rag}</Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Meeting summary">
        <p className="whitespace-pre-wrap text-xs text-gray-700">{report.meetingSummary}</p>
      </SectionCard>

      {report.keyObservations.length ? (
        <SectionCard title="Key observations">
          <ul className="list-disc space-y-1 pl-4 text-xs text-gray-700">
            {report.keyObservations.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      {report.recommendations.length ? (
        <SectionCard title="Recommendations">
          <ul className="list-disc space-y-1 pl-4 text-xs text-gray-700">
            {report.recommendations.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </SectionCard>
      ) : null}
    </div>
  );
}
