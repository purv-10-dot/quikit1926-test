"use client";

/**
 * WWW Review — what this meeting said about commitments made before it.
 *
 * Shared by the Weekly Meeting report, the Daily Huddle weekly report and the
 * per-meeting report, because all three answer the same question and a
 * facilitator reading two of them should not have to learn two layouts.
 *
 * READ-ONLY, DELIBERATELY
 * -----------------------
 * There is no status editor and no Create button here. Changing a WWW belongs
 * in the WWW module, where `canEditWWW` and the transactional status ledger
 * apply. A report that could quietly rewrite business state would make the
 * record depend on who last opened a document.
 *
 * THE STORED STATUS WINS
 * ----------------------
 * When the meeting claimed an item was finished and the record disagrees, both
 * are shown and the row is flagged. That discrepancy is the most useful thing
 * this section can surface, and resolving it in the transcript's favour would
 * be letting a conversation overwrite the business record.
 *
 * Rows arrive as loose records because the Weekly Meeting report stores its WWW
 * sections as opaque JSON (`wwwSectionSchema.rows` is `z.record(z.unknown())`).
 * They are narrowed here rather than at every call site.
 */

import { Chip, SectionCard } from "../reportUi";

export interface WwwReviewRowView {
  id?: string;
  what?: string;
  whoName?: string | null;
  who?: string;
  statusAtMeeting?: string | null;
  statusAtMeetingSource?: "history" | "unchanged" | "unavailable";
  currentStatus?: string;
  changed?: boolean;
  changeLabel?: string;
  discussedOn?: string[];
  closureDisputed?: boolean;
  meetingEvidence?: { quote: string; claim: string }[];
  lifecycle?: { lifecycle?: string; overdue?: boolean; carriedForward?: boolean };
}

export interface WwwReviewSectionProps {
  title?: string;
  rows: WwwReviewRowView[];
  /** Why the section is empty, when it is. Never render a bare empty table. */
  unavailableReason?: string | null;
  /** The viewer saw less than the meeting actually discussed. */
  scopeLimited?: boolean;
}

const UNASSIGNED = "Unassigned";

/** Group by owner, so the section reads person by person as the format asks. */
function groupByOwner(rows: WwwReviewRowView[]): [string, WwwReviewRowView[]][] {
  const groups = new Map<string, WwwReviewRowView[]>();
  for (const r of rows) {
    const key = r.whoName?.trim() || UNASSIGNED;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  // Unassigned last: it is a gap to fix, not a person to read about.
  return [...groups.entries()].sort(([a], [b]) =>
    a === UNASSIGNED ? 1 : b === UNASSIGNED ? -1 : a.localeCompare(b),
  );
}

function StatusCell({ row }: { row: WwwReviewRowView }) {
  if (row.statusAtMeetingSource === "unavailable" || !row.statusAtMeeting) {
    return (
      <span
        className="text-gray-400"
        title="No status history was recorded for this item before the meeting, so we cannot say what it looked like at the time."
      >
        Not recorded
      </span>
    );
  }
  return <span className="text-gray-700">{row.statusAtMeeting}</span>;
}

export function WwwReviewSection({
  title = "WWW Review",
  rows,
  unavailableReason,
  scopeLimited,
}: WwwReviewSectionProps) {
  // An unexplained empty table asserts "the team discussed nothing". That is a
  // different claim from "extraction has not run", and only one of them is
  // usually true.
  if (rows.length === 0) {
    return (
      <SectionCard title={title}>
        <p className="text-xs text-gray-500">
          {unavailableReason ??
            "No previously-created WWW item was discussed in this period."}
        </p>
      </SectionCard>
    );
  }

  const groups = groupByOwner(rows);

  return (
    <SectionCard
      title={title}
      subtitle={`${rows.length} item${rows.length === 1 ? "" : "s"} discussed`}
      action={
        scopeLimited ? (
          <Chip className="bg-amber-100 text-amber-800">
            Limited to what you can see
          </Chip>
        ) : null
      }
    >
      <div className="space-y-4">
        {groups.map(([owner, ownerRows]) => (
          <div key={owner}>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              {owner}
            </p>
            <div className="overflow-x-auto rounded-lg border border-gray-100">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-accent-50">
                    <th className="px-3 py-1.5 font-semibold text-gray-700">WWW</th>
                    <th className="px-3 py-1.5 font-semibold text-gray-700">Previous Status</th>
                    <th className="px-3 py-1.5 font-semibold text-gray-700">Current Status</th>
                    <th className="px-3 py-1.5 font-semibold text-gray-700">Change</th>
                    <th className="px-3 py-1.5 font-semibold text-gray-700">Discussion</th>
                  </tr>
                </thead>
                <tbody>
                  {ownerRows.map((row, i) => (
                    <tr key={row.id ?? i} className="border-t border-gray-100 align-top">
                      <td className="px-3 py-1.5 text-gray-800">
                        {row.what ?? "—"}
                        {row.discussedOn?.length ? (
                          <span className="ml-1.5 text-[10px] text-gray-400">
                            discussed {row.discussedOn.join(", ")}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-1.5">
                        <StatusCell row={row} />
                      </td>
                      <td className="px-3 py-1.5 text-gray-700">{row.currentStatus ?? "—"}</td>
                      <td className="px-3 py-1.5">
                        <span className={row.changed ? "font-medium text-gray-800" : "text-gray-400"}>
                          {row.changeLabel ?? "—"}
                        </span>
                        {row.lifecycle?.overdue ? (
                          <Chip className="ml-1.5 bg-red-50 text-red-600">Overdue</Chip>
                        ) : null}
                        {row.lifecycle?.carriedForward ? (
                          <Chip className="ml-1.5 bg-amber-50 text-amber-700">Carried forward</Chip>
                        ) : null}
                      </td>
                      <td className="px-3 py-1.5 text-gray-600">
                        {row.meetingEvidence?.length ? (
                          <span className="italic">“{row.meetingEvidence[0].quote}”</span>
                        ) : (
                          <span className="text-gray-400">No update captured</span>
                        )}
                        {row.closureDisputed ? (
                          <p className="mt-1 text-[11px] font-medium text-amber-700">
                            ⚠ Closure was claimed in the meeting, but the record still shows it open.
                          </p>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
