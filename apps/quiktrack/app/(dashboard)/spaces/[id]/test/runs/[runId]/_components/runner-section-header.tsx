"use client";

import type { RunnerTest } from "./runner-types";

/**
 * Section group header row — folder name, count, and a per-status progress bar
 * (QUIKTR-341). An earlier pass dropped the bar in favour of plain text,
 * reasoning it was redundant next to the run's own donut; the owner asked for
 * it back, so it returns here — the donut summarises the WHOLE run, this bar
 * summarises just the folder's own tests, which is a different, still useful
 * question ("how is THIS folder doing").
 *
 * Segments by each test's CURRENT status colour (`QtTestStatus.color`),
 * proportional to count — not a fixed passed/failed/blocked palette — since an
 * org's status catalogue is configurable (QUIKTR-status-admin) and a hardcoded
 * palette would misrepresent a custom status.
 */
export function RunnerSectionHeader({
  name,
  tests,
  columnCount,
}: {
  name: string;
  tests: RunnerTest[];
  /** Must match the grid's actual column count (the checkbox column is optional). */
  columnCount: number;
}) {
  const total = tests.length;
  const byStatus = new Map<string, { count: number; color: string }>();
  for (const t of tests) {
    const s = t.currentStatus;
    const entry = byStatus.get(s.id) ?? { count: 0, color: s.color };
    entry.count += 1;
    byStatus.set(s.id, entry);
  }

  return (
    <tr className="border-b border-gray-100 bg-gray-50">
      <td colSpan={columnCount} className="px-3 py-1.5">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-gray-600">
            {name} · {total} {total === 1 ? "test" : "tests"}
          </span>
          {total > 0 && (
            <div
              className="flex h-1.5 w-28 shrink-0 overflow-hidden rounded-full bg-gray-200"
              role="img"
              aria-label={`Status breakdown for ${name}`}
            >
              {[...byStatus.values()].map((seg, i) => (
                <span
                  key={i}
                  style={{ width: `${(seg.count / total) * 100}%`, backgroundColor: seg.color }}
                />
              ))}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}
