"use client";

/**
 * CriticalTable — renders ONE Critical # (or Balancing Critical #) card as a
 * row of leftmost meta cells (checkbox + log + S.No + Title) **merged
 * vertically across** 4 bullet rows (Green / Light Green / Yellow / Red).
 *
 * Layout (mirrors the Review tab):
 *   ┌────┬───┬───┬──────────┬────────────────────────┬──────────┬──────┬──────────┐
 *   │ ☐  │🕒 │ # │  Title   │ Projected (• Color val)│ Achieved │ Gap  │ Comment  │
 *   ├────┼───┼───┼──────────┼────────────────────────┼──────────┼──────┼──────────┤
 *   │    │   │   │          │  • Green     100       │   70     │ −30  │   …      │
 *   │ ☐  │🕒 │ 1 │ Growth   │  • L.Green    80       │   70     │ −10  │   …      │
 *   │    │   │   │          │  • Yellow     60       │   70     │ +10  │   …      │
 *   │    │   │   │          │  • Red        40       │   70     │ +30  │   …      │
 *   └────┴───┴───┴──────────┴────────────────────────┴──────────┴──────┴──────────┘
 *
 * Inline editing is REMOVED — Achieved + Comment are display-only here. The
 * `#` button opens the right-side drawer (`<CriticalReviewDrawer>`) where the
 * 4 bullets are edited via per-color tabs, mirroring the Review tab's
 * "open primary modal" flow.
 */

import { useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { achievedPctColor, CRIT_BULLET_COLORS, CRIT_BULLET_LABELS } from "./helpers";

export interface CriticalTableEntry {
  achievedValue: number | null;
  comment: string | null;
}

export interface CriticalTableProps {
  /** Header label e.g. "Critical #" / "Balancing Critical #" */
  label: string;
  /** Per-card S.No to render in the "#" column */
  index: number;
  /** The CritCard payload from OPSPData (title + 4 bullets). */
  card: { title: string; bullets: string[] };
  /** Saved review entries, keyed by bullet index 0..3. */
  entries: Partial<Record<number, CriticalTableEntry>>;
  /** Clicked when the user opens the drawer to edit this card. */
  onOpenEdit: () => void;
}

/** Parse a bullet's free-text Projected value; returns NaN if non-numeric. */
function parseProjected(s: string): number {
  const trimmed = (s ?? "").replace(/[,\s]/g, "").trim();
  if (!trimmed) return NaN;
  return parseFloat(trimmed);
}

export function CriticalTable({
  label,
  index,
  card,
  entries,
  onOpenEdit,
}: CriticalTableProps) {
  const [logsOpen, setLogsOpen] = useState(false);
  const [checked, setChecked] = useState(false);

  // Hide the whole card when it has no title AND every bullet is empty.
  const isEmpty =
    !card.title.trim() && (card.bullets ?? []).every((b) => !(b ?? "").trim());
  if (isEmpty) return null;

  return (
    <div className="mb-6 border border-gray-200 rounded-lg overflow-hidden">
      {/* Block header — e.g. "Critical # — Growth" */}
      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-sm">
        <span className="font-semibold text-gray-800">{label}</span>
        {card.title.trim() ? (
          <span className="text-gray-500"> — {card.title}</span>
        ) : null}
      </div>

      <table className="w-full text-sm">
        <thead className="bg-accent-50 text-xs font-semibold text-gray-600">
          <tr>
            <th className="w-10 px-2 py-2 border-b border-gray-200 text-center">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 cursor-pointer"
              />
            </th>
            <th className="w-10 px-2 py-2 border-b border-gray-200" />
            <th className="w-12 px-2 py-2 border-b border-gray-200 text-center">#</th>
            <th className="text-left px-4 py-2 border-b border-gray-200 w-[160px]">
              Critical Title
            </th>
            <th className="text-left px-4 py-2 border-b border-gray-200">Projected</th>
            <th className="text-center px-4 py-2 border-b border-gray-200 w-[120px]">
              Achieved
            </th>
            <th className="text-center px-4 py-2 border-b border-gray-200 w-[90px]">
              Gap
            </th>
            <th className="text-left px-4 py-2 border-b border-gray-200 w-[35%]">
              Comment
            </th>
          </tr>
        </thead>
        <tbody>
          {[0, 1, 2, 3].map((bulletIdx) => (
            <CriticalRow
              key={bulletIdx}
              firstRow={bulletIdx === 0}
              index={index}
              title={card.title}
              bulletIdx={bulletIdx}
              bulletText={card.bullets[bulletIdx] ?? ""}
              entry={entries[bulletIdx] ?? null}
              checked={checked}
              setChecked={setChecked}
              logsOpen={logsOpen}
              setLogsOpen={setLogsOpen}
              onOpenEdit={onOpenEdit}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ────────────────────────────── Row ────────────────────────────── */

function CriticalRow({
  firstRow,
  index,
  title,
  bulletIdx,
  bulletText,
  entry,
  checked,
  setChecked,
  logsOpen,
  setLogsOpen,
  onOpenEdit,
}: {
  firstRow: boolean;
  index: number;
  title: string;
  bulletIdx: number;
  bulletText: string;
  entry: CriticalTableEntry | null;
  checked: boolean;
  setChecked: (v: boolean) => void;
  logsOpen: boolean;
  setLogsOpen: (v: boolean) => void;
  onOpenEdit: () => void;
}) {
  const projectedNum = parseProjected(bulletText);
  const projectedIsNumeric = Number.isFinite(projectedNum);
  const achievedNum = entry?.achievedValue ?? null;
  const achievedIsNumeric = achievedNum != null && Number.isFinite(achievedNum);

  // Gap = Achieved − Projected (only when both numeric)
  const gap =
    achievedIsNumeric && projectedIsNumeric ? achievedNum! - projectedNum : null;

  // Achieved-cell traffic-light fill (only when both numeric)
  const pctColor =
    achievedIsNumeric && projectedIsNumeric && projectedNum !== 0
      ? achievedPctColor((achievedNum! / projectedNum) * 100)
      : "";

  return (
    <tr className="border-b border-gray-100 last:border-b-0 hover:bg-blue-50/30">
      {/* Leftmost meta cells — rendered on the first row only, rowSpan-ed 4. */}
      {firstRow ? (
        <>
          <td
            rowSpan={4}
            className="align-middle px-2 py-3 border-r border-gray-100 text-center"
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 cursor-pointer"
            />
          </td>
          <td
            rowSpan={4}
            className="align-middle px-2 py-3 border-r border-gray-100 text-center relative"
          >
            <button
              onClick={() => setLogsOpen(!logsOpen)}
              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-500 transition-colors"
              title="View audit history"
            >
              <Clock className="h-3.5 w-3.5" />
            </button>
            {logsOpen ? (
              <div className="absolute left-0 top-full mt-1 z-40 bg-white border border-gray-200 rounded-lg shadow-lg w-60 p-3 text-left">
                <p className="text-[11px] text-gray-500">
                  Audit history for this critical card is shown here.
                </p>
                <button
                  onClick={() => setLogsOpen(false)}
                  className="mt-2 text-[11px] text-accent-600 hover:underline"
                >
                  Close
                </button>
              </div>
            ) : null}
          </td>
          <td
            rowSpan={4}
            className="align-middle px-2 py-3 border-r border-gray-100 text-center"
          >
            <button
              onClick={onOpenEdit}
              className="text-gray-900 hover:underline font-medium"
            >
              {index}
            </button>
          </td>
          <td
            rowSpan={4}
            className="align-middle px-4 py-3 border-r border-gray-100 font-medium text-gray-800"
          >
            {title.trim() || <span className="text-gray-400">—</span>}
          </td>
        </>
      ) : null}

      {/* Projected — colored dot + value */}
      <td className="px-4 py-2 border-r border-gray-100">
        <div className="flex items-center gap-2.5">
          <span
            className="w-3 h-3 rounded-sm flex-shrink-0"
            style={{ backgroundColor: CRIT_BULLET_COLORS[bulletIdx] }}
          />
          <span className="text-gray-600 text-xs font-medium w-[90px]">
            {CRIT_BULLET_LABELS[bulletIdx]}
          </span>
          <span className="text-gray-800 font-medium">
            {bulletText.trim() === "" ? (
              <span className="text-gray-400">—</span>
            ) : projectedIsNumeric ? (
              projectedNum.toLocaleString()
            ) : (
              bulletText
            )}
          </span>
        </div>
      </td>

      {/* Achieved — read-only display (edit happens in the drawer) */}
      <td className="px-2 py-2 border-r border-gray-100 text-center">
        {achievedIsNumeric ? (
          <span
            className={cn(
              "inline-block min-w-[60px] py-1 px-2 text-sm rounded",
              pctColor && "text-white font-semibold",
              pctColor,
            )}
          >
            {achievedNum!.toLocaleString()}
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>

      {/* Gap — Achieved − Projected, signed display with color */}
      <td className="px-3 py-2 border-r border-gray-100 text-center">
        {gap == null ? (
          <span className="text-gray-400">—</span>
        ) : (
          (() => {
            const sign = gap > 0 ? "+" : gap < 0 ? "−" : "";
            const cls = gap > 0 ? "text-green-600" : gap < 0 ? "text-red-600" : "text-gray-500";
            const abs = Math.abs(gap).toLocaleString();
            return (
              <span className={cn("font-medium", cls)}>
                {sign}
                {abs}
              </span>
            );
          })()
        )}
      </td>

      {/* Comment — read-only display */}
      <td className="px-3 py-2">
        <span className="text-gray-600 text-sm block truncate">
          {entry?.comment?.trim() ? entry.comment : <span className="text-gray-400">—</span>}
        </span>
      </td>
    </tr>
  );
}
