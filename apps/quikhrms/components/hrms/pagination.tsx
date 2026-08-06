"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { clsx } from "clsx";

export interface PaginationProps {
  page: number;
  totalPages: number;
  /** Optional totals for the "Showing X–Y of N" label. */
  total?: number;
  limit?: number;
  onPageChange: (page: number) => void;
  className?: string;
}

/**
 * Reusable list pager. Renders nothing for a single page. Shows Prev / windowed
 * page numbers / Next plus a "Showing X–Y of N" count when totals are provided.
 */
export function Pagination({ page, totalPages, total, limit, onPageChange, className }: PaginationProps) {
  if (!totalPages || totalPages <= 1) return null;

  const go = (p: number) => { if (p >= 1 && p <= totalPages && p !== page) onPageChange(p); };

  // Windowed page list: first, current±1, last (with ellipses).
  const nums: (number | "ellipsis")[] = [];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);
  nums.push(1);
  if (start > 2) nums.push("ellipsis");
  for (let p = start; p <= end; p++) nums.push(p);
  if (end < totalPages - 1) nums.push("ellipsis");
  if (totalPages > 1) nums.push(totalPages);

  const from = limit ? (page - 1) * limit + 1 : null;
  const to = limit && total != null ? Math.min(page * limit, total) : null;

  const navBtn = "inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div className={clsx("flex items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 flex-wrap", className)}>
      <span className="text-xs text-gray-500 tabular-nums">
        {total != null && from != null && to != null
          ? `Showing ${from}–${to} of ${total}`
          : `Page ${page} of ${totalPages}`}
      </span>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => go(page - 1)} disabled={page <= 1} className={navBtn}>
          <ChevronLeft size={14} /> Prev
        </button>
        {nums.map((p, i) =>
          p === "ellipsis" ? (
            <span key={`e${i}`} className="px-1.5 text-xs text-gray-400">…</span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => go(p)}
              aria-current={p === page ? "page" : undefined}
              className={clsx(
                "min-w-8 h-8 px-2 rounded-md text-xs font-medium border tabular-nums",
                p === page ? "bg-accent-600 text-white border-accent-600" : "text-gray-600 border-gray-200 hover:bg-gray-50",
              )}
            >
              {p}
            </button>
          ),
        )}
        <button type="button" onClick={() => go(page + 1)} disabled={page >= totalPages} className={navBtn}>
          Next <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
