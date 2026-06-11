import type { HideBelow } from "@/components/ui/table";
import { TBody, TD, TR } from "@/components/ui/table";

/** Single shimmer bar — width controlled by tailwind class on the parent or via `widthClass`. */
export function SkeletonBar({
  className = "",
  widthClass = "w-full",
  heightClass = "h-3",
}: {
  className?: string;
  widthClass?: string;
  heightClass?: string;
}) {
  return (
    <span
      aria-hidden
      className={`inline-block animate-pulse rounded bg-crm-panel ${heightClass} ${widthClass} ${className}`}
    />
  );
}

export interface SkeletonColumn {
  /** Tailwind width class applied to the bar in this cell. Defaults to `w-24`. */
  widthClass?: string;
  /** Hide this column on smaller breakpoints (must match the live <TH hideBelow=...>). */
  hideBelow?: HideBelow;
  /** Override cell className (e.g. text alignment). */
  className?: string;
}

/**
 * Skeleton rows for list-style tables built with <Table> + <TBody>. Renders
 * inside a <TBody> — pass it as the body of <Table> while data is loading so
 * the user sees row chrome instead of a single "Loading…" cell.
 *
 *   <TBody>
 *     {loading ? <TableSkeletonRows columns={cols} /> : items.map(...)}
 *   </TBody>
 */
export function TableSkeletonRows({
  columns,
  rows = 8,
}: {
  columns: SkeletonColumn[];
  rows?: number;
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TR key={`sk-${i}`} aria-hidden>
          {columns.map((c, j) => (
            <TD
              key={j}
              hideBelow={c.hideBelow}
              className={`py-3 ${c.className ?? ""}`}
            >
              <SkeletonBar widthClass={c.widthClass ?? "w-24"} />
            </TD>
          ))}
        </TR>
      ))}
    </>
  );
}

/**
 * Self-contained variant — when the caller doesn't already render <TBody>.
 * Wrap with <Table>...<THead>...</THead><TableSkeletonBody columns=.../></Table>.
 */
export function TableSkeletonBody({
  columns,
  rows = 8,
}: {
  columns: SkeletonColumn[];
  rows?: number;
}) {
  return (
    <TBody>
      <TableSkeletonRows columns={columns} rows={rows} />
    </TBody>
  );
}

/**
 * Skeleton for kanban / column-list layouts. Renders N columns each with M
 * card placeholders. Mirrors the proportions of a typical opportunity board.
 */
export function KanbanSkeleton({
  columns = 5,
  cardsPerColumn = 3,
}: {
  columns?: number;
  cardsPerColumn?: number;
}) {
  return (
    <div
      aria-hidden
      className="flex h-[calc(100vh-260px)] min-h-[420px] gap-4 overflow-hidden pb-2 pr-4"
    >
      {Array.from({ length: columns }).map((_, ci) => (
        <section
          key={ci}
          className="flex h-full w-[300px] shrink-0 flex-col overflow-hidden rounded-xl border border-crm-border bg-crm-panel/60"
        >
          <header className="flex items-center justify-between gap-2 border-b border-crm-border bg-white/40 px-3 py-2.5">
            <SkeletonBar widthClass="w-24" heightClass="h-3" />
            <SkeletonBar widthClass="w-6" heightClass="h-4" className="rounded-full" />
          </header>
          <div className="flex flex-1 flex-col gap-2 p-2">
            {Array.from({ length: cardsPerColumn }).map((_, di) => (
              <div
                key={di}
                className="space-y-2 rounded-lg border border-crm-border bg-white p-3 shadow-sm"
              >
                <SkeletonBar widthClass="w-3/4" heightClass="h-3" />
                <SkeletonBar widthClass="w-1/2" heightClass="h-2.5" />
                <div className="flex items-center justify-between pt-1">
                  <SkeletonBar widthClass="w-16" heightClass="h-4" className="rounded-full" />
                  <SkeletonBar widthClass="w-6" heightClass="h-6" className="rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Generic week/day grid skeleton — 7 columns of stacked card placeholders. */
export function WeekGridSkeleton({ tasksPerDay = 2 }: { tasksPerDay?: number }) {
  return (
    <div aria-hidden className="grid grid-cols-7 min-h-[260px]">
      {Array.from({ length: 7 }).map((_, di) => (
        <div
          key={di}
          className="space-y-1 border-r border-crm-border p-2 last:border-r-0"
        >
          {Array.from({ length: tasksPerDay }).map((_, ti) => (
            <div
              key={ti}
              className="space-y-1.5 rounded-md border border-crm-border bg-white px-2 py-2"
            >
              <SkeletonBar widthClass="w-full" heightClass="h-3" />
              <SkeletonBar widthClass="w-1/2" heightClass="h-2.5" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Simple stacked-card list skeleton (e.g. My Day). */
export function CardListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <ul aria-hidden className="crm-card divide-y divide-crm-border overflow-hidden">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex-1 space-y-2">
            <SkeletonBar widthClass="w-2/3" heightClass="h-3" />
            <SkeletonBar widthClass="w-1/3" heightClass="h-2.5" />
          </div>
          <SkeletonBar widthClass="w-24" heightClass="h-6" className="rounded" />
        </li>
      ))}
    </ul>
  );
}
