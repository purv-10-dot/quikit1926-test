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
import { ColMenu } from "@quikit/ui";
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
  /** Clicked when the user opens the audit-log drawer for this card. */
  onOpenLogs?: () => void;
  /** Column keys currently hidden (shared across both cards via table prefs).
   *  Only `title` / `achieved` / `comment` are hideable — the rail (#/log/☐)
   *  and Projected tiers are always shown. */
  hiddenCols?: string[];
  /** Hide a column from the card header's ⋮ menu. Omit to disable hiding. */
  onHideCol?: (key: string) => void;
}

/** Columns the user may hide on a Critical card. */
export const CRITICAL_HIDEABLE_COLUMNS: { key: string; label: string }[] = [
  { key: "title", label: "Critical Title" },
  { key: "achieved", label: "Achieved" },
  { key: "comment", label: "Comment" },
];

export function CriticalTable({
  label,
  index,
  card,
  entry,
  onOpenEdit,
  onOpenLogs,
  hiddenCols = [],
  onHideCol,
}: CriticalTableProps) {
  const [checked, setChecked] = useState(false);
  const isHidden = (key: string) => hiddenCols.includes(key);

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
    <div className="mb-6 border border-gray-200 rounded-lg overflow-hidden shadow-sm">
      {/* Block header — e.g. "Critical # — Growth" */}
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 text-sm">
        <span className="font-semibold text-gray-800">{label}</span>
        {card.title.trim() ? (
          <span className="text-gray-500"> — {card.title}</span>
        ) : null}
      </div>

      <table className="w-full text-sm">
        <colgroup>
          <col className="w-10" />
          <col className="w-10" />
          <col className="w-12" />
          {!isHidden("title") && <col className="w-[180px]" />}
          <col className="w-[300px]" />
          {!isHidden("achieved") && <col className="w-[110px]" />}
          {!isHidden("comment") && <col className="w-[260px]" />}
        </colgroup>
        <thead className="bg-accent-50 text-xs font-semibold text-gray-600">
          <tr>
            <th className="px-2 py-2.5 border-b border-gray-200 text-center">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 cursor-pointer"
              />
            </th>
            <th className="px-2 py-2.5 border-b border-gray-200" />
            <th className="px-2 py-2.5 border-b border-gray-200 text-center">#</th>
            {!isHidden("title") && (
              <th className="group relative text-left px-4 py-2.5 border-b border-gray-200">
                <span className="inline-flex items-center gap-1 pr-4">
                  Critical Title
                  {onHideCol && <HideMenu colKey="title" onHide={() => onHideCol("title")} />}
                </span>
              </th>
            )}
            <th className="text-left px-4 py-2.5 border-b border-gray-200">Projected</th>
            {!isHidden("achieved") && (
              <th className="group relative text-center px-4 py-2.5 border-b border-gray-200">
                <span className="inline-flex items-center gap-1 pr-4">
                  Achieved
                  {onHideCol && <HideMenu colKey="achieved" onHide={() => onHideCol("achieved")} />}
                </span>
              </th>
            )}
            {!isHidden("comment") && (
              <th className="group relative text-left px-4 py-2.5 border-b border-gray-200">
                <span className="inline-flex items-center gap-1 pr-4">
                  Comment
                  {onHideCol && <HideMenu colKey="comment" onHide={() => onHideCol("comment")} />}
                </span>
              </th>
            )}
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
                    className="align-middle px-2 py-3 border-r border-gray-100 text-center"
                  >
                    <button
                      onClick={() => onOpenLogs?.()}
                      className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-500 transition-colors"
                      title="View audit history"
                      disabled={!onOpenLogs}
                    >
                      <Clock className="h-3.5 w-3.5" />
                    </button>
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
                  {!isHidden("title") && (
                    <td
                      rowSpan={4}
                      className="align-middle px-4 py-3 border-r border-gray-100 font-medium text-gray-800"
                    >
                      {card.title.trim() || <span className="text-gray-400">—</span>}
                    </td>
                  )}
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
                  {!isHidden("achieved") && (
                    <td
                      rowSpan={4}
                      className="align-middle px-3 py-3 border-r border-gray-100 text-center"
                    >
                      {achievedIsNumeric ? (
                        <span
                          className={cn(
                            "inline-flex items-center justify-center min-w-[64px] py-1.5 px-3 text-sm rounded-md font-semibold tabular-nums",
                            tierCellCls,
                          )}
                        >
                          {achievedNum!.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  )}
                  {!isHidden("comment") && (
                    <td
                      rowSpan={4}
                      className="align-middle px-4 py-3 text-sm text-gray-600"
                    >
                      {entry?.comment?.trim() ? (
                        // Cap height at ~6 lines and scroll if longer so a
                        // chatty comment doesn't stretch the card vertically.
                        <div className="leading-snug whitespace-normal break-words max-h-[7.5em] overflow-y-auto pr-1">
                          {entry.comment}
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  )}
                </>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ───────────────────────── Header hide menu ───────────────────────── */

/**
 * Hover-revealed ⋮ menu on a hideable Critical-card column header. Reuses the
 * shared `ColMenu` with only the Hide action (no sort/freeze — a card layout
 * doesn't support those). The parent `<th>` must carry `group relative` so the
 * trigger reveals on hover, matching every other grid header.
 */
function HideMenu({ colKey, onHide }: { colKey: string; onHide: () => void }) {
  return (
    <ColMenu
      colKey={colKey}
      showSort={false}
      showFreeze={false}
      showHide
      onHide={onHide}
    />
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
    // Fixed widths on the swatch (w-3) and label (w-[110px]) so values across
    // the 4 bullet sub-rows line up in the same column. `tabular-nums` makes
    // digit widths uniform so numbers stack cleanly.
    <div className="flex items-center gap-3">
      <span
        className="w-3 h-3 rounded-sm flex-shrink-0"
        style={{ backgroundColor: CRIT_BULLET_COLORS[bulletIdx] }}
      />
      <span className="text-gray-600 text-xs font-medium w-[100px] flex-shrink-0">
        {CRIT_BULLET_LABELS[bulletIdx]}
      </span>
      <span className="text-gray-800 font-medium tabular-nums">
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
