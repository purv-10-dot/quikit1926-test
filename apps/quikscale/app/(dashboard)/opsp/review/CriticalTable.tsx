"use client";

/**
 * CriticalTable — renders ONE Critical # (or Balancing Critical #) card.
 * The "Projected" column shows 4 colored sub-rows (Super Green / Light
 * Green / Yellow / Red); the leftmost meta cells (checkbox + log + S.No +
 * Title) plus the rightmost data cells (Achieved + Comment) are merged
 * vertically across those 4 sub-rows. There is ONE Achieved value and ONE
 * Comment per card — the tier is derived live by `resolveCritTier()`
 * placing the achieved value into the band defined by the 4 projected
 * thresholds entered during OPSP creation.
 *
 * Layout:
 *   ┌────┬───┬───┬──────────┬────────────────────────┬──────────┬──────────┐
 *   │ ☐  │🕒 │ # │  Title   │ Projected (• Color val)│ Achieved │ Comment  │
 *   ├────┼───┼───┼──────────┼────────────────────────┼──────────┼──────────┤
 *   │    │   │   │          │  • Super Green  120    │          │          │
 *   │ ☐  │🕒 │ 1 │ Growth   │  • Light Green   80    │   65     │   …      │
 *   │    │   │   │          │  • Yellow        60    │ (tinted) │          │
 *   │    │   │   │          │  • Red           40    │          │          │
 *   └────┴───┴───┴──────────┴────────────────────────┴──────────┴──────────┘
 *
 * The Achieved cell background is tinted by `resolveCritTier()` so a quick
 * scan of the table communicates which tier each critical landed in. The
 * `#` button opens `<CriticalReviewDrawer>` for editing.
 */

import { useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { CRIT_BULLET_COLORS, CRIT_BULLET_LABELS } from "./helpers";
import {
  resolveCritTier,
  critTierCellClasses,
  toNum,
} from "@/lib/utils/opspHelpers";

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
  /** Saved review entry for this card (single entry — no per-bullet rows). */
  entry: CriticalTableEntry | null;
  /** Clicked when the user opens the drawer to edit this card. */
  onOpenEdit: () => void;
}

export function CriticalTable({
  label,
  index,
  card,
  entry,
  onOpenEdit,
}: CriticalTableProps) {
  const [logsOpen, setLogsOpen] = useState(false);
  const [checked, setChecked] = useState(false);

  // Hide the whole card when it has no title AND every bullet is empty.
  const isEmpty =
    !card.title.trim() && (card.bullets ?? []).every((b) => !(b ?? "").trim());
  if (isEmpty) return null;

  const achievedNum = entry?.achievedValue ?? null;
  const achievedIsNumeric = achievedNum != null && Number.isFinite(achievedNum);
  const tier = achievedIsNumeric
    ? resolveCritTier(achievedNum, card.bullets)
    : null;
  const tierCellCls = critTierCellClasses(tier);

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
            <th className="text-left px-4 py-2 border-b border-gray-200 w-[35%]">
              Comment
            </th>
          </tr>
        </thead>
        <tbody>
          {[0, 1, 2, 3].map((bulletIdx) => (
            <tr
              key={bulletIdx}
              className="border-b border-gray-100 last:border-b-0 hover:bg-blue-50/30"
            >
              {/* Leftmost meta cells + Achieved + Comment — all rowSpan-ed
                  4 from the first sub-row only. */}
              {bulletIdx === 0 ? (
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
                    {card.title.trim() || <span className="text-gray-400">—</span>}
                  </td>
                </>
              ) : null}

              {/* Projected — colored dot + value (one cell per sub-row) */}
              <td className="px-4 py-2 border-r border-gray-100">
                <ProjectedCell
                  bulletIdx={bulletIdx}
                  bulletText={card.bullets[bulletIdx] ?? ""}
                />
              </td>

              {/* Achieved + Comment — single cell each, rowSpan=4 from row 0 */}
              {bulletIdx === 0 ? (
                <>
                  <td
                    rowSpan={4}
                    className="align-middle px-2 py-3 border-r border-gray-100 text-center"
                  >
                    {achievedIsNumeric ? (
                      <span
                        className={cn(
                          "inline-block min-w-[60px] py-1.5 px-3 text-sm rounded font-semibold",
                          tierCellCls,
                        )}
                      >
                        {achievedNum!.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td
                    rowSpan={4}
                    className="align-middle px-3 py-3 text-sm text-gray-600"
                  >
                    {entry?.comment?.trim() ? (
                      <span className="block">{entry.comment}</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ───────────────────────── Projected cell ───────────────────────── */

function ProjectedCell({
  bulletIdx,
  bulletText,
}: {
  bulletIdx: number;
  bulletText: string;
}) {
  const num = toNum(bulletText);
  return (
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
        ) : num !== null ? (
          num.toLocaleString()
        ) : (
          bulletText
        )}
      </span>
    </div>
  );
}
