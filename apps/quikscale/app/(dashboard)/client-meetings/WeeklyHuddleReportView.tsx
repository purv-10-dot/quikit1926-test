"use client";

/**
 * On-screen rendering of the Daily Huddle Weekly Report, following the
 * client's reference format section for section: §4.1 Meeting Details,
 * §4.2 Executive Summary, §4.3 Attendance Analysis, §4.4 Adherence Heat Map,
 * §4.5 Stucks & Blockers (all + recurring), §4.6 Facilitator Observations,
 * and the WWW suggestions this rollup produced.
 *
 * Purely presentational — the page owns fetching, generating and saving.
 *
 * Rating and status colours are semantic data states (traffic-light), so they
 * stay fixed `green/amber/red` rather than `accent-*`, matching the convention
 * used by the locked KPI/Priority tables and the daily adherence report.
 */

import type { StoredWeeklyReport } from "@/lib/ai/weeklyHuddleCompose";
import type { ValidationResult, ValidationSeverity } from "@/lib/ai/weeklyReportValidation";

const pct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n}%`);

/** Badge for a member who appears in the table but is not scored. */
const MEMBER_TYPE_LABEL: Record<string, string> = { OPTIONAL: "Optional", EXTERNAL: "External" };

/** §4.3 cell states. Semantic data colours — not themeable. */
const ATTENDANCE_CELL: Record<string, { label: string; cls: string; title: string }> = {
  PRESENT: { label: "✓", cls: "bg-green-50 text-green-700", title: "Present" },
  PARTIAL: {
    label: "◐",
    cls: "bg-amber-50 text-amber-700",
    title: "Joined briefly — counted as half a presence",
  },
  ABSENT: { label: "✗", cls: "bg-red-50 text-red-700", title: "Absent" },
  NA: { label: "NA", cls: "bg-gray-50 text-gray-400", title: "No huddle, or on planned leave" },
  // Deliberately blank, not a cross: we do not know, and guessing here is what
  // produced the understated attendance this replaced.
  UNKNOWN: {
    label: "—",
    cls: "bg-gray-50 text-gray-300",
    title: "No attendance evidence for this day — excluded from the percentage",
  },
};

/**
 * Why a cell reads the way it does, shown on hover.
 *
 * Provenance matters here more than in most tables: "absent" from a Teams
 * attendance report is a measurement, while "absent" inferred from a
 * participant list is a deduction, and a facilitator disputing a cell needs to
 * know which one they are arguing with.
 */
const ATTENDANCE_EVIDENCE: Record<string, string> = {
  HUMAN_MARKED: "Recorded by hand in the Daily Huddle module",
  NA_LEAVE: "On approved leave — excluded from the percentage",
  NA_NOT_HELD: "No huddle was held that day",
  TEAMS_REPORT: "Teams attendance report — joined for the full meeting",
  TEAMS_REPORT_SHORT: "Teams attendance report — joined only briefly (counts as half)",
  TEAMS_REPORT_ABSENT: "Teams attendance report — invited, never joined",
  OPTIONAL_NOT_JOINED: "Optional attendee who did not join — not counted either way",
  PRESENT_PARTICIPANT_LIST: "In the meeting's participant list",
  PRESENT_SPOKE: "Spoke during the meeting",
  INFERRED_ABSENT: "Not in an otherwise complete participant list",
  NO_DATA: "No attendance evidence for this day — excluded from the percentage",
};

const BLOCKER_STATUS: Record<string, { label: string; cls: string }> = {
  OPEN: { label: "Open", cls: "bg-red-100 text-red-700" },
  IN_PROGRESS: { label: "In Progress", cls: "bg-amber-100 text-amber-800" },
  RESOLVED: { label: "Resolved", cls: "bg-green-100 text-green-700" },
};

const WWW_KIND: Record<string, { label: string; cls: string }> = {
  BLOCKER: { label: "Blocker", cls: "bg-red-100 text-red-700" },
  KPI_RELATED: { label: "KPI-related", cls: "bg-blue-100 text-blue-800" },
  PRIORITY_RELATED: { label: "Priority-related", cls: "bg-purple-100 text-purple-800" },
  ACTION: { label: "Action", cls: "bg-gray-100 text-gray-700" },
};

const SEVERITY: Record<ValidationSeverity, { cls: string; dot: string; label: string }> = {
  ERROR: { cls: "text-red-800", dot: "bg-red-500", label: "Error" },
  WARNING: { cls: "text-amber-800", dot: "bg-amber-500", label: "Warning" },
  INFO: { cls: "text-gray-600", dot: "bg-gray-400", label: "Info" },
};

function ConfidenceBar({ value }: { value: number }) {
  const shown = Math.round(value * 100);
  const color = value >= 0.7 ? "bg-green-500" : value >= 0.4 ? "bg-amber-400" : "bg-red-500";
  return (
    <div className="flex items-center gap-2" title={`Confidence ${shown}%`}>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-200">
        <div className={`h-full ${color}`} style={{ width: `${shown}%` }} />
      </div>
      <span className="text-[10px] tabular-nums text-gray-500">{shown}%</span>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-sm font-semibold text-gray-800">{children}</h3>;
}

function DetailRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="w-56 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600">{label}</td>
      <td className="px-3 py-1.5 text-xs text-gray-800">{value === null || value === undefined || value === "" ? "—" : value}</td>
    </tr>
  );
}

/**
 * The validation banner. Deliberately prominent: a report with errors is a
 * draft, and the reviewer needs to see why before signing it off.
 */
export function ValidationBanner({ validation }: { validation: ValidationResult | null }) {
  if (!validation) return null;
  const { passed, counts, issues } = validation;

  if (passed && !counts.warnings && !counts.infos) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
        Consistency check passed — every name, figure and date in the written sections traces back to this week&apos;s data.
      </div>
    );
  }

  const tone = passed
    ? "border-amber-200 bg-amber-50 text-amber-900"
    : "border-red-200 bg-red-50 text-red-900";

  return (
    <details className={`rounded-lg border px-3 py-2 text-xs ${tone}`} open={!passed}>
      <summary className="cursor-pointer font-medium">
        {passed
          ? `Consistency check passed with ${counts.warnings} warning${counts.warnings === 1 ? "" : "s"}`
          : `Consistency check found ${counts.errors} issue${counts.errors === 1 ? "" : "s"} — review before sign-off`}
        {counts.infos ? ` · ${counts.infos} note${counts.infos === 1 ? "" : "s"}` : ""}
      </summary>
      <ul className="mt-2 space-y-1.5">
        {issues.map((issue, i) => {
          const s = SEVERITY[issue.severity];
          return (
            <li key={i} className="flex items-start gap-2">
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} />
              <span className={s.cls}>
                <span className="font-medium">{s.label}:</span> {issue.message}{" "}
                <span className="text-[10px] opacity-70">({issue.location})</span>
              </span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

export function WeeklyHuddleReportView({
  report,
  validation,
}: {
  report: StoredWeeklyReport;
  validation: ValidationResult | null;
}) {
  const { meetingDetails: md, executive, attendance, heatMap, stucks, facilitatorObservations: fo } = report;
  const team = heatMap.teamAverage;

  const observationRows: [string, typeof fo.strongPerformers][] = [
    ["Attendance & Participation", fo.attendanceParticipation],
    ["Strong Performers", fo.strongPerformers],
    ["Achievement Gap", fo.achievementGap],
    ["Focus Specificity", fo.focusSpecificity],
    ["Stuck Protocol", fo.stuckProtocol],
    ["Recommendations", fo.recommendations],
  ];

  return (
    <div className="space-y-6">
      <ValidationBanner validation={validation} />

      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-gray-600">Overall confidence</span>
        <ConfidenceBar value={report.overallConfidence} />
      </div>

      {/* §4.1 Meeting Details */}
      <section>
        <SectionHeading>1. Meeting Details</SectionHeading>
        <table className="w-full overflow-hidden rounded-lg border border-gray-100">
          <tbody>
            <DetailRow label="Meeting Type" value={md.meetingType} />
            <DetailRow label="Week" value={md.weekLabel} />
            <DetailRow label="Planned Start Time" value={md.plannedStartTime} />
            <DetailRow label="Planned End Time" value={md.plannedEndTime} />
            <DetailRow
              label="Planned Duration"
              value={md.plannedDurationMinutes ? `${md.plannedDurationMinutes} minutes` : null}
            />
            <DetailRow
              label="Day DH doesn't happen"
              value={md.nonHuddleDay ? md.nonHuddleDay.charAt(0).toUpperCase() + md.nonHuddleDay.slice(1) : null}
            />
            <DetailRow label="# of team members" value={md.teamMemberCount} />
          </tbody>
        </table>
      </section>

      {/* §4.2 Executive Summary */}
      <section>
        <SectionHeading>2. Executive Summary</SectionHeading>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {(
            [
              ["DHs Planned", executive.metrics.huddlesPlanned],
              ["DHs Conducted", executive.metrics.huddlesConducted],
              ["Avg Attendance", pct(executive.metrics.averageAttendancePct)],
              ["Started On Time", pct(executive.metrics.startedOnTimePct)],
              [
                "Avg Duration",
                executive.metrics.averageDurationMinutes === null
                  ? "—"
                  : `${executive.metrics.averageDurationMinutes}m`,
              ],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-lg border border-gray-100 bg-gray-50 py-2 text-center">
              <div className="text-lg font-bold text-gray-800">{value}</div>
              <div className="text-[10px] text-gray-500">{label}</div>
            </div>
          ))}
        </div>

        {/* Agenda adherence IS the §4.4 team-average row — one computed value,
            rendered in both places, so they can never disagree. */}
        <div className="mt-3 overflow-x-auto rounded-lg border border-gray-100">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-accent-50">
                <th className="px-3 py-1.5">Agenda Item</th>
                <th className="px-3 py-1.5">Team Adherence</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Yesterday Achievement", team.achievementPct],
                  ["Today's Focus", team.focusPct],
                  ["Stucks", team.stuckPct],
                ] as const
              ).map(([label, value]) => (
                <tr key={label} className="border-b border-gray-100 last:border-0">
                  <td className="px-3 py-1.5 text-gray-800">{label}</td>
                  <td className="px-3 py-1.5 font-medium text-gray-700">{pct(value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {executive.keyHighlights.length ? (
          <>
            <h4 className="mb-1 mt-3 text-xs font-semibold text-gray-700">Key Highlights</h4>
            <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
              {executive.keyHighlights.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      {/* §4.3 Attendance Analysis */}
      {attendance.rows.length ? (
        <section>
          <SectionHeading>3. Attendance Analysis</SectionHeading>
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-accent-50">
                  <th className="px-3 py-1.5">Team Member</th>
                  {attendance.columns.map((c) => (
                    <th key={c.date} className="px-2 py-1.5 text-center" title={c.date}>
                      {c.weekday}
                    </th>
                  ))}
                  <th className="px-3 py-1.5 text-center">Attendance %</th>
                </tr>
              </thead>
              <tbody>
                {attendance.rows.map((row) => (
                  <tr key={row.memberId} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-1.5 font-medium text-gray-800">
                      {row.name}
                      {row.attendanceType !== "REQUIRED" ? (
                        <span
                          className="ml-1.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500"
                          title="Shown for visibility, but excluded from the attendance percentage"
                        >
                          {MEMBER_TYPE_LABEL[row.attendanceType]}
                        </span>
                      ) : null}
                    </td>
                    {row.cells.map((cell) => {
                      const s = ATTENDANCE_CELL[cell.state];
                      return (
                        <td
                          key={cell.date}
                          title={ATTENDANCE_EVIDENCE[cell.evidence] ?? s.title}
                          className={`px-2 py-1.5 text-center font-semibold ${s.cls}`}
                        >
                          {s.label}
                        </td>
                      );
                    })}
                    <td className="px-3 py-1.5 text-center font-semibold text-gray-700">{pct(row.attendancePct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* The requirement doc's §5 attendance block: expected / present /
              absent / on leave, so the percentage is auditable rather than
              asserted. */}
          <p className="mt-2 text-[11px] text-gray-500">
            {(() => {
              const scored = attendance.rows.filter((r) => r.attendanceType === "REQUIRED");
              const present = scored.reduce((sum, r) => sum + r.presentDays, 0);
              const expected = scored.reduce((sum, r) => sum + r.expectedDays, 0);
              const onLeave = scored.reduce((sum, r) => sum + r.onLeaveDays, 0);
              const unknown = scored.reduce((sum, r) => sum + r.unknownDays, 0);
              return (
                <>
                  <strong>{present}</strong> present of <strong>{expected}</strong> expected
                  member-days
                  {onLeave ? <> · {onLeave} on planned leave</> : null}
                  {unknown ? <> · {unknown} with no attendance evidence</> : null}.
                </>
              );
            })()}
          </p>
          <p className="mt-1 text-[11px] text-gray-400">
            NA = no huddle held that day, or the member was on planned leave — excluded from the percentage.
            {attendance.rows.some((r) => r.attendanceType !== "REQUIRED") ? (
              <>
                {" "}
                Optional and External members are shown for visibility only: they neither raise nor
                lower the team average.
              </>
            ) : null}
          </p>
        </section>
      ) : null}

      {/* §4.4 Adherence Heat Map */}
      {heatMap.rows.length ? (
        <section>
          <SectionHeading>4. Adherence Heat Map</SectionHeading>
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-accent-50">
                  <th className="px-3 py-1.5">Team Member</th>
                  <th className="px-3 py-1.5 text-center">Yesterday Achievement</th>
                  <th className="px-3 py-1.5 text-center">Today Focus</th>
                  <th className="px-3 py-1.5 text-center">Stuck</th>
                  <th className="px-3 py-1.5 text-center">Avg Score</th>
                </tr>
              </thead>
              <tbody>
                {heatMap.rows.map((row) => (
                  <tr key={row.memberId ?? row.participant} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-1.5">
                      <div className="font-medium text-gray-800">{row.participant}</div>
                      <div className="text-[10px] text-gray-400">
                        assessed over {row.daysAssessed} huddle{row.daysAssessed === 1 ? "" : "s"}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-center">{pct(row.achievementPct)}</td>
                    <td className="px-3 py-1.5 text-center">{pct(row.focusPct)}</td>
                    <td className="px-3 py-1.5 text-center">{pct(row.stuckPct)}</td>
                    <td className="px-3 py-1.5 text-center font-semibold text-gray-700">{pct(row.avgScorePct)}</td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-semibold">
                  <td className="px-3 py-1.5 text-gray-800">Team Average</td>
                  <td className="px-3 py-1.5 text-center">{pct(team.achievementPct)}</td>
                  <td className="px-3 py-1.5 text-center">{pct(team.focusPct)}</td>
                  <td className="px-3 py-1.5 text-center">{pct(team.stuckPct)}</td>
                  <td className="px-3 py-1.5 text-center text-gray-400">–</td>
                </tr>
              </tbody>
            </table>
          </div>
          {heatMap.unrecognized.length ? (
            <p className="mt-1 text-[11px] text-amber-700">
              Excluded — could not be matched to the client roster:{" "}
              {heatMap.unrecognized.map((u) => `${u.name} (${u.reason})`).join(", ")}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* §4.5 Stucks & Blockers */}
      <section>
        <SectionHeading>5. Stucks &amp; Blockers</SectionHeading>

        <h4 className="mb-1 text-xs font-semibold text-gray-700">A. All Stucks Raised During the Week</h4>
        {stucks.all.length ? (
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-accent-50">
                  <th className="px-3 py-1.5">Date</th>
                  <th className="px-3 py-1.5">Raised By</th>
                  <th className="px-3 py-1.5">Raised For</th>
                  <th className="px-3 py-1.5">Blocker</th>
                  <th className="px-3 py-1.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {stucks.all.map((b, i) => (
                  <tr key={`${b.huddleId}-${i}`} className="border-b border-gray-100 align-top last:border-0">
                    <td className="whitespace-nowrap px-3 py-1.5 text-gray-600">{b.date}</td>
                    <td className="px-3 py-1.5 font-medium text-gray-800">{b.raisedBy}</td>
                    <td className="px-3 py-1.5 text-gray-700">{b.raisedFor ?? "—"}</td>
                    <td className="px-3 py-1.5 text-gray-700">
                      <div className="font-medium">{b.description}</div>
                      {b.impact ? <div className="text-gray-500">Impact: {b.impact}</div> : null}
                    </td>
                    <td className="px-3 py-1.5">
                      {b.status ? (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${BLOCKER_STATUS[b.status].cls}`}>
                          {BLOCKER_STATUS[b.status].label}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-gray-400">No stucks were raised this week.</p>
        )}

        <h4 className="mb-1 mt-3 text-xs font-semibold text-gray-700">B. Recurring Stucks</h4>
        {stucks.recurring.length ? (
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-accent-50">
                  <th className="px-3 py-1.5">Blocker</th>
                  <th className="px-3 py-1.5 text-center"># of Occurrences</th>
                  <th className="px-3 py-1.5">Raised By</th>
                  <th className="px-3 py-1.5">Raised For</th>
                  <th className="px-3 py-1.5">Current Status</th>
                </tr>
              </thead>
              <tbody>
                {stucks.recurring.map((g, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-1.5 font-medium text-gray-800">{g.blocker}</td>
                    <td className="px-3 py-1.5 text-center">{g.occurrences}</td>
                    <td className="px-3 py-1.5 text-gray-700">{g.raisedBy.join(", ") || "—"}</td>
                    <td className="px-3 py-1.5 text-gray-700">{g.raisedFor.join(", ") || "—"}</td>
                    <td className="px-3 py-1.5">
                      {g.status ? (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${BLOCKER_STATUS[g.status].cls}`}>
                          {BLOCKER_STATUS[g.status].label}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-gray-400">No stuck recurred this week.</p>
        )}
      </section>

      {/* §4.6 Facilitator Observations */}
      <section>
        <SectionHeading>6. Facilitator Observations &amp; Recommendations</SectionHeading>
        <div className="overflow-hidden rounded-lg border border-gray-100">
          <table className="w-full text-left text-xs">
            <tbody>
              {observationRows.map(([label, obs]) => (
                <tr key={label} className="border-b border-gray-100 align-top last:border-0">
                  <td className="w-52 bg-gray-50 px-3 py-2 font-semibold text-gray-700">{label}</td>
                  <td className="px-3 py-2 text-gray-700">
                    {obs.text}
                    {obs.sourceDates.length ? (
                      <div className="mt-1 text-[10px] text-gray-400">Evidence: {obs.sourceDates.join(", ")}</div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* WWW suggestions */}
      {report.wwwSuggestions.length ? (
        <section>
          <SectionHeading>7. WWW Suggestions</SectionHeading>
          <p className="mb-2 text-[11px] text-gray-500">
            Drawn from this week&apos;s stucks and discussion points. Nothing here is created automatically.
          </p>
          <ul className="space-y-2">
            {report.wwwSuggestions.map((w, i) => {
              const kind = WWW_KIND[w.kind] ?? WWW_KIND.ACTION;
              return (
                <li key={i} className="rounded-lg border border-gray-100 px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-800">{w.what}</p>
                      <p className="mt-0.5 text-[11px] text-gray-600">
                        <span className="font-medium">Who:</span> {w.who || "—"}
                        {" · "}
                        <span className="font-medium">When:</span>{" "}
                        {w.when ? w.when : <em className="text-amber-700">not stated — flagged</em>}
                      </p>
                      {w.sourceQuote || w.sourceDate ? (
                        <p className="mt-0.5 text-[10px] italic text-gray-400">
                          Source{w.sourceDate ? ` (${w.sourceDate})` : ""}: {w.sourceQuote ?? "—"}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${kind.cls}`}>{kind.label}</span>
                      <ConfidenceBar value={w.confidence} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
