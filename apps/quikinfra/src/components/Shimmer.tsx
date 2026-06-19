/**
 * Shimmer primitives — used as loading placeholders while API data
 * is in flight. The shimmer keyframe is defined in tailwind.config.ts.
 *
 * Pattern:
 *   <ShimmerBlock className="h-4 w-32" />       // one bar
 *   <TableShimmer rows={8} columns={6} />       // full table placeholder
 */

import * as React from "react";

export interface ShimmerBlockProps {
  className?: string;
}

export function ShimmerBlock({ className = "" }: ShimmerBlockProps) {
  return (
    <div
      className={
        "relative overflow-hidden rounded-md bg-slate-200/70 " + className
      }
    >
      <div
        aria-hidden
        className="absolute inset-0 bg-shimmer-gradient bg-[length:1000px_100%] animate-shimmer"
      />
    </div>
  );
}

export interface TableShimmerProps {
  /** Number of body rows to render. Default 8. */
  rows?: number;
  /** Number of header columns. Default 6. */
  columns?: number;
  /** Whether to render a toolbar strip above the table. Default true. */
  showToolbar?: boolean;
}

export function TableShimmer({
  rows = 8,
  columns = 6,
  showToolbar = true,
}: TableShimmerProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {showToolbar && (
        <div className="flex items-center gap-3 p-4 border-b border-gray-100">
          <ShimmerBlock className="h-9 w-36" />
          <ShimmerBlock className="h-9 flex-1 max-w-md" />
          <ShimmerBlock className="h-9 w-24" />
          <ShimmerBlock className="h-9 w-24" />
          <ShimmerBlock className="h-9 w-24" />
        </div>
      )}

      {/* Header */}
      <div
        className="grid gap-4 px-4 py-3 border-b border-gray-100 bg-gray-50/70"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: columns }).map((_, i) => (
          <ShimmerBlock key={i} className="h-3.5" />
        ))}
      </div>

      {/* Rows */}
      <div className="divide-y divide-gray-100">
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            className="grid gap-4 px-4 py-4"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: columns }).map((_, c) => (
              <ShimmerBlock
                key={c}
                className={c === 0 ? "h-4 w-20" : c === 1 ? "h-4 w-full" : "h-4 w-3/4"}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Page-level skeleton: title bar + toolbar + table. Useful for
 *  route-level `loading.tsx` that fires during navigation. */
export function MasterPageShimmer({
  columns = 6,
  rows = 8,
}: {
  columns?: number;
  rows?: number;
}) {
  return (
    <div className="p-6 space-y-4">
      <div className="space-y-2">
        <ShimmerBlock className="h-3 w-48" />
        <ShimmerBlock className="h-7 w-72" />
        <ShimmerBlock className="h-4 w-56" />
      </div>
      <TableShimmer rows={rows} columns={columns} />
    </div>
  );
}
