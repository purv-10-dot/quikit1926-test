"use client";

/**
 * The Yes/Partial/No and Full/Good/Partial/Poor cells, shared by the DAILY
 * Adherence Report and the WEEKLY Adherence Snapshot.
 *
 * Extracted rather than copied: the two reports show the same scale, and a
 * reader comparing a day against its week must not see "Partial" in two
 * different ambers. A copy would drift the first time either side was tweaked.
 *
 * These colours are semantic data states, not branded chrome — never `accent-*`,
 * same convention as the locked KPI/Priority tables. See CLAUDE.md.
 */

export const RATING_CELL: Record<string, string> = {
  YES: "bg-green-50 text-green-700",
  PARTIAL: "bg-amber-50 text-amber-700",
  NO: "bg-red-50 text-red-700",
};

export const RATING_LABEL: Record<string, string> = {
  YES: "Yes",
  PARTIAL: "Partial",
  NO: "No",
};

export const OVERALL_BADGE: Record<string, string> = {
  full: "bg-green-100 text-green-700",
  good: "bg-green-50 text-green-600",
  partial: "bg-amber-100 text-amber-700",
  poor: "bg-red-100 text-red-700",
};

/** One Yes/Partial/No cell. Renders its own `<td>`. */
export function RatingCell({ value }: { value: string | null | undefined }) {
  if (!value) return <td className="px-2 py-1.5 text-center text-gray-400">—</td>;
  return (
    <td className={`px-2 py-1.5 text-center text-xs font-medium ${RATING_CELL[value] ?? ""}`}>
      {RATING_LABEL[value] ?? value}
    </td>
  );
}

/** The overall Full/Good/Partial/Poor pill. Case-insensitive on the input. */
export function RatingBadge({ rating }: { rating: string | null | undefined }) {
  const key = (rating ?? "").trim().toLowerCase();
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        OVERALL_BADGE[key] ?? "bg-gray-100 text-gray-600"
      }`}
    >
      {rating ?? "—"}
    </span>
  );
}

/**
 * The legend the shared deliverable prints above the snapshot table. Same words
 * in both reports, so the scale is defined once.
 */
export function RatingScaleLegend() {
  return (
    <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-lg bg-gray-50 px-3 py-2 text-[11px] text-gray-600">
      <span className="font-medium text-gray-700">Rating Scale:</span>
      <span>
        <span className="font-semibold text-green-700">Yes</span> — complete, specific answer given
      </span>
      <span>
        <span className="font-semibold text-amber-700">Partial</span> — vague or incomplete
      </span>
      <span>
        <span className="font-semibold text-red-700">No</span> — not addressed
      </span>
    </div>
  );
}
