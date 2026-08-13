"use client";

/**
 * On-screen rendering of a DAILY Adherence Report, matching the 5-section
 * shared-deliverable format: Meeting Details, Attendance, Adherence Snapshot
 * (+ summary tiles), Individual Participant Breakdown, and consolidated
 * Stucks & Blockers. Pure presentational — the report data (incl. edit mode
 * for sections/extracted items) is still owned by `MeetingReportPanel`.
 *
 * Rating colors (Yes/Partial/No, Full/Good/Partial/Poor) are semantic data
 * states, not `accent-*` themed — same convention as the locked KPI/Priority
 * tables elsewhere in QuikScale.
 */
import type { StoredMeetingReport } from "@/lib/ai/meetingReport";
import { summarizeAdherence } from "@/lib/ai/dailyAdherenceFormat";

type AdherenceRow = NonNullable<StoredMeetingReport["adherence"]>[number];

const RATING_CELL: Record<string, string> = {
  YES: "bg-green-50 text-green-700",
  PARTIAL: "bg-amber-50 text-amber-700",
  NO: "bg-red-50 text-red-700",
};

const RATING_LABEL: Record<string, string> = { YES: "Yes", PARTIAL: "Partial", NO: "No" };

function RatingCell({ value }: { value: string | null | undefined }) {
  if (!value) return <td className="px-2 py-1.5 text-center text-gray-400">—</td>;
  return (
    <td className={`px-2 py-1.5 text-center text-xs font-medium ${RATING_CELL[value] ?? ""}`}>
      {RATING_LABEL[value] ?? value}
    </td>
  );
}

const OVERALL_BADGE: Record<string, string> = {
  full: "bg-green-100 text-green-700",
  good: "bg-green-50 text-green-600",
  partial: "bg-amber-100 text-amber-700",
  poor: "bg-red-100 text-red-700",
};

function RatingBadge({ rating }: { rating: string | null | undefined }) {
  const key = (rating ?? "").trim().toLowerCase();
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${OVERALL_BADGE[key] ?? "bg-gray-100 text-gray-600"}`}>
      {rating ?? "—"}
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="w-48 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600">{label}</td>
      <td className="px-3 py-1.5 text-xs text-gray-800">{value}</td>
    </tr>
  );
}

export function DailyAdherenceReport({ report }: { report: StoredMeetingReport }) {
  const adherence: AdherenceRow[] = report.adherence ?? [];
  const summary = summarizeAdherence(adherence);
  const present = report.attendance?.present ?? [];
  const notPresent = report.attendance?.notPresent ?? [];
  const blockers = report.blockers ?? [];
  const details = report.meetingDetails;

  return (
    <div className="space-y-6">
      {/* 1. Meeting Details */}
      {details && (details.meetingType || details.dateLabel || details.durationLabel || details.timeOfDay) ? (
        <section>
          <h4 className="mb-2 text-sm font-semibold text-gray-800">1. Meeting Details</h4>
          <table className="w-full overflow-hidden rounded-lg border border-gray-100 text-left">
            <tbody>
              <DetailRow label="Meeting Type" value={details.meetingType} />
              <DetailRow label="Date" value={details.dateLabel} />
              <DetailRow label="Start (recording mark)" value={details.startMark} />
              <DetailRow label="End (recording mark)" value={details.endMark} />
              <DetailRow label="Total Duration" value={details.durationLabel} />
              <DetailRow label="Time of Day" value={details.timeOfDay} />
            </tbody>
          </table>
        </section>
      ) : null}

      {/* 2. Attendance */}
      {present.length ? (
        <section>
          <h4 className="mb-2 text-sm font-semibold text-gray-800">2. Attendance</h4>
          <div className="overflow-hidden rounded-lg border border-gray-100">
            <div className="bg-green-700 px-3 py-1.5 text-xs font-semibold text-white">Present ({present.length})</div>
            <div className="grid grid-cols-1 gap-x-4 gap-y-1 bg-green-50/40 px-3 py-2 sm:grid-cols-2">
              {present.map((p, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs text-gray-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-600" />
                  {p.name}
                  {p.role ? <span className="text-gray-400">· {p.role}</span> : null}
                </div>
              ))}
            </div>
          </div>
          {notPresent.length ? (
            <div className="mt-2 overflow-hidden rounded-lg border border-gray-100">
              <div className="bg-gray-700 px-3 py-1.5 text-xs font-semibold text-white">
                Not Present ({notPresent.length})
                {report.attendance?.comparisonNote ? ` — ${report.attendance.comparisonNote}` : ""}
              </div>
              <div className="grid grid-cols-1 gap-x-4 gap-y-1 bg-gray-50 px-3 py-2 sm:grid-cols-2">
                {notPresent.map((name, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs text-gray-700">
                    <span className="h-1.5 w-1.5 bg-gray-500" />
                    {name}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* 3. Adherence Snapshot */}
      {adherence.length ? (
        <section>
          <h4 className="mb-2 text-sm font-semibold text-gray-800">3. Adherence Snapshot</h4>
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-accent-50">
                  <th className="px-2 py-1.5">Participant</th>
                  <th className="px-2 py-1.5 text-center">Achievement</th>
                  <th className="px-2 py-1.5 text-center">Focus</th>
                  <th className="px-2 py-1.5 text-center">Stuck / Blockers</th>
                  <th className="px-2 py-1.5 text-center">Score</th>
                  <th className="px-2 py-1.5 text-center">Rating</th>
                </tr>
              </thead>
              <tbody>
                {adherence.map((row, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0">
                    <td className="px-2 py-1.5">
                      <div className="font-medium text-gray-800">{row.participant}</div>
                      {row.role ? <div className="text-[10px] italic text-gray-400">{row.role}</div> : null}
                    </td>
                    <RatingCell value={row.achievement} />
                    <RatingCell value={row.focus} />
                    <RatingCell value={row.stuck} />
                    <td className="px-2 py-1.5 text-center font-medium text-gray-700">{row.score ?? "—"}</td>
                    <td className="px-2 py-1.5 text-center"><RatingBadge rating={row.rating} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 grid grid-cols-5 gap-2 text-center">
            {([
              ["Full Adherence", summary.full, "text-green-700"],
              ["Good", summary.good, "text-green-600"],
              ["Partial", summary.partial, "text-amber-600"],
              ["Poor", summary.poor, "text-red-600"],
              ["Total Attendees", summary.total, "text-gray-700"],
            ] as const).map(([label, value, color]) => (
              <div key={label} className="rounded-lg border border-gray-100 bg-gray-50 py-2">
                <div className={`text-lg font-bold ${color}`}>{value}</div>
                <div className="text-[10px] text-gray-500">{label}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* 4. Individual Participant Breakdown */}
      {adherence.length ? (
        <section>
          <h4 className="mb-2 text-sm font-semibold text-gray-800">4. Individual Participant Breakdown</h4>
          <div className="space-y-3">
            {adherence.map((row, i) => (
              <div key={i} className="overflow-hidden rounded-lg border border-gray-100">
                <div className="flex items-center justify-between bg-gray-50 px-3 py-1.5">
                  <div>
                    <div className="text-xs font-semibold text-gray-800">{row.participant}</div>
                    {row.role ? <div className="text-[10px] italic text-gray-400">{row.role}</div> : null}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
                    <RatingBadge rating={row.rating} /> {row.score ?? ""}
                  </div>
                </div>
                <table className="w-full text-left">
                  <tbody>
                    <BreakdownRow label="Achievement (Yesterday)" value={row.achievement} note={row.achievementNote} />
                    <BreakdownRow label="Focus Area (Today)" value={row.focus} note={row.focusNote} />
                    <BreakdownRow label="Stuck / Blockers" value={row.stuck} note={row.stuckNote} />
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* 5. Stucks & Blockers — Consolidated */}
      {blockers.length ? (
        <section>
          <h4 className="mb-2 text-sm font-semibold text-gray-800">5. Stucks &amp; Blockers — Consolidated</h4>
          <p className="mb-2 text-xs text-gray-500">
            A total of <strong>{blockers.length}</strong> blocker{blockers.length === 1 ? "" : "s"} raised during the huddle.
          </p>
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-accent-50">
                  <th className="px-2 py-1.5">#</th>
                  <th className="px-2 py-1.5">Raised By</th>
                  <th className="px-2 py-1.5">Category</th>
                  <th className="px-2 py-1.5">Description &amp; Impact</th>
                </tr>
              </thead>
              <tbody>
                {blockers.map((b, i) => (
                  <tr key={i} className="border-b border-gray-100 align-top last:border-0">
                    <td className="px-2 py-1.5 text-gray-500">{i + 1}</td>
                    <td className="px-2 py-1.5 font-medium text-gray-800">{b.raisedBy}</td>
                    <td className="px-2 py-1.5"><span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700">{b.category}</span></td>
                    <td className="px-2 py-1.5 text-gray-700">
                      <div className="font-medium">{b.description}</div>
                      {b.impact ? <div className="mt-0.5 text-gray-500"><span className="font-medium">Impact:</span> {b.impact}</div> : null}
                      {b.requiredAction ? <div className="text-gray-500"><span className="font-medium">Required action:</span> {b.requiredAction}</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function BreakdownRow({ label, value, note }: { label: string; value: string | null | undefined; note: string | null | undefined }) {
  return (
    <tr className="border-b border-gray-50 last:border-0">
      <td className="w-40 px-3 py-1.5 align-top text-xs font-medium text-gray-600">{label}</td>
      <RatingCell value={value} />
      <td className="px-3 py-1.5 text-xs text-gray-700">{note ?? "—"}</td>
    </tr>
  );
}
