/**
 * Shared header `<th>` for the Meeting Rhythm tables (Weekly Meeting,
 * Daily Huddle, Client Master, Client Members). Mirrors the cascade-freeze
 * pattern Individual KPI uses: freezing column C pins every column from the
 * always-frozen left rail up to and including C as a sticky group.
 *
 * Responsibilities:
 *   - Render `null` when the column is hidden so parents don't have to wrap
 *     each call in `{!isHidden(k) && …}`.
 *   - Apply `sticky z-[35] bg-accent-50` and a measured `left` offset to
 *     frozen columns. The `left` value comes from `useStickyOffsets`, which
 *     reads each `<th data-col-key>`'s `offsetWidth` from the live DOM —
 *     no hardcoded pixel constants to drift.
 *   - Show a small `<FreezeIcon />` next to the label when this column is
 *     the freeze BOUNDARY (the rightmost frozen column).
 *   - Hover-reveal a `<ColMenu>` for Sort / Freeze / Hide.
 *   - Anchor an absolutely-positioned `<ResizeHandle>` via `relative`.
 *
 * Why no `overflow-hidden` on the `<th>`: the inner `<span>` already
 * truncates long labels via `truncate min-w-0`. Putting overflow-hidden
 * on the cell itself clips the absolutely-positioned <ColMenu> dropdown
 * (the bug this component was originally extracted to fix).
 *
 * The `thClassName` prop is the only visual escape hatch: each table can
 * inject its own padding/border palette (e.g. `py-3 font-semibold text-gray-600
 * border-b border-gray-200` for Client tables) while keeping the freeze
 * behavior unified.
 */
import { ColMenu } from "@quikit/ui";
import { ResizeHandle } from "@/lib/hooks/useColumnResize";
import { FreezeIcon } from "@/components/ui/FreezeIcon";

export type SortDirection = "asc" | "desc";

export interface HeaderCellProps {
  /** Stable column key — used for hide/freeze state + `data-col-key`. */
  k: string;
  /** Display label. Truncated with ellipsis when narrow; full text in tooltip. */
  label: string;
  /** When true, ColMenu shows Sort Asc / Sort Desc and the active arrow renders. */
  sortable?: boolean;
  /** Backend whitelist key when it differs from `k` (e.g. UI `weeklyWindow`
   *  → backend `weeklyStartTime`). Defaults to `k`. */
  sortKey?: string;

  /** Returns true if this column is currently hidden (returns null then). */
  isHidden: (key: string) => boolean;
  /** Returns the pixel width for this column from the resize hook. */
  getColWidth: (key: string) => number;
  /** Starts a column-resize drag. */
  startResize: (key: string, clientX: number) => void;
  /** Hide this column via the table-prefs hook. */
  hideCol: (key: string) => void;

  /** Currently sorted backend key, or null. */
  sortBy: string | null;
  /** Sort direction when `sortBy === sortKey`. */
  sortOrder: SortDirection;
  /** Replace sort state — wired through to ColMenu's onSort callback. */
  setSort: (next: { sortBy: string; sortOrder: SortDirection }) => void;

  /** True when this column is part of the frozen group. */
  isFrozen: (key: string) => boolean;
  /** Measured left offset (px) — only consumed when `isFrozen(k)`. */
  getStickyLeft: (key: string) => number;
  /** The freeze boundary key, or null. Drives lock-icon + ColMenu state. */
  frozenUpTo: string | null;
  /** Toggle freeze: if `k === frozenUpTo`, clear; else set `frozenUpTo = k`. */
  onFreeze: (key: string) => void;

  /** Per-table className override. Lets Client tables use a different
   *  padding/border palette without duplicating the component. Appended
   *  after the always-applied `group relative ...` base. */
  thClassName?: string;
}

const BASE_TH_CLASS = "group relative px-3 py-2 text-left whitespace-nowrap";

export function HeaderCell({
  k,
  label,
  sortable,
  sortKey,
  isHidden,
  getColWidth,
  startResize,
  hideCol,
  sortBy,
  sortOrder,
  setSort,
  isFrozen,
  getStickyLeft,
  frozenUpTo,
  onFreeze,
  thClassName,
}: HeaderCellProps) {
  if (isHidden(k)) return null;
  const effectiveSortKey = sortKey ?? k;
  const isSorted = !!sortable && sortBy === effectiveSortKey;
  const frozen = isFrozen(k);
  const boundary = k === frozenUpTo;
  const width = getColWidth(k);
  return (
    <th
      data-col-key={k}
      style={
        frozen
          ? { left: getStickyLeft(k), width, minWidth: width }
          : { width }
      }
      className={[
        thClassName ?? BASE_TH_CLASS,
        // Sticky headers go on z-[35] (above body cells on z-[10..15]) so the
        // ColMenu dropdown doesn't disappear behind a frozen body column.
        // Boundary shadow gives a soft edge between frozen + scroll regions.
        frozen
          ? `sticky z-[35] bg-accent-50${boundary ? " shadow-[2px_0_4px_rgba(0,0,0,0.06)]" : ""}`
          : "",
      ].join(" ").trim()}
    >
      <div className="flex items-center gap-1">
        {boundary && <FreezeIcon />}
        <span className="flex-1 truncate min-w-0" title={label}>
          {label}
          {isSorted && (sortOrder === "asc" ? " ↑" : " ↓")}
        </span>
        <ColMenu
          colKey={k}
          onSort={
            sortable
              ? (d) => setSort({ sortBy: effectiveSortKey, sortOrder: d })
              : undefined
          }
          onFreeze={() => onFreeze(k)}
          onHide={() => hideCol(k)}
          frozen={boundary}
          showSort={!!sortable}
        />
      </div>
      <ResizeHandle onStart={(e) => startResize(k, e.clientX)} />
    </th>
  );
}
