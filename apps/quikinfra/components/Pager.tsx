"use client";

/**
 * Single pagination control for the whole app — used by <DataTable> and by
 * the handful of pages that render a custom table (DPR, Work Orders, Audit).
 * Every pager in QuikInfra renders through here so the UI stays identical.
 *
 * `variant="footer"` is the pinned-footer look: it sits flush inside the
 * bottom of a grid card (top border, no rounding of its own so the card's
 * ring supplies it). `variant="inline"` keeps the older free-standing look
 * for tables that aren't wrapped in a card.
 */

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

export const PAGE_SIZES = [25, 50, 100];

/** Max numbered slots (page numbers + ellipses) shown at once. */
const WINDOW = 7;

/**
 * Page numbers to render, with `"…"` marking a gap. Always keeps the first
 * and last page reachable and centres the window on the current page, so a
 * 50-page list stays one click from either end.
 */
function pageWindow(page: number, totalPages: number): (number | "…")[] {
  if (totalPages <= WINDOW) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const slots: (number | "…")[] = [1];
  // Reserve slot 1 + last + up to two ellipses → 3 numbers float in between.
  let from = Math.max(2, page - 1);
  let to = Math.min(totalPages - 1, page + 1);
  // Widen the window when the current page hugs either end, so the control
  // never visually shrinks as you page through.
  if (page <= 3) to = 4;
  if (page >= totalPages - 2) from = totalPages - 3;
  if (from > 2) slots.push("…");
  for (let p = from; p <= to; p++) slots.push(p);
  if (to < totalPages - 1) slots.push("…");
  slots.push(totalPages);
  return slots;
}

export function Pager({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  variant = "inline",
  pageSizes = PAGE_SIZES,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
  variant?: "footer" | "inline";
  pageSizes?: number[];
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const current = Math.min(Math.max(1, page), totalPages);
  const goPage = (p: number) => onPageChange(Math.min(Math.max(1, p), totalPages));

  const shellCls =
    variant === "footer"
      ? "shrink-0 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-slate-200 bg-slate-50/60 px-3 py-2.5 sm:px-4"
      : "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1 pt-3";

  const stepCls =
    "flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white hover:text-accent-700 hover:ring-1 hover:ring-slate-200 disabled:pointer-events-none disabled:opacity-35";

  return (
    <nav className={shellCls} aria-label="Pagination">
      {/* Left — range + rows per page */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span className="tabular-nums">
          {total === 0 ? (
            "No records"
          ) : (
            <>
              <strong className="font-semibold text-slate-800">
                {start + 1}–{Math.min(start + pageSize, total)}
              </strong>{" "}
              of <strong className="font-semibold text-slate-800">{total}</strong>
            </>
          )}
        </span>
        <span aria-hidden className="h-3.5 w-px bg-slate-200" />
        <label className="flex items-center gap-1.5">
          <span className="hidden font-medium sm:inline">Rows</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            aria-label="Rows per page"
            className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 focus:border-accent-400 focus:outline-none focus:ring-2 focus:ring-accent-200"
          >
            {pageSizes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Right — page stepper */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => goPage(1)}
          disabled={current === 1}
          aria-label="First page"
          title="First page"
          className={`${stepCls} hidden sm:flex`}
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => goPage(current - 1)}
          disabled={current === 1}
          aria-label="Previous page"
          title="Previous page"
          className={stepCls}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Numbered pages — desktop. Collapses to "n / total" on mobile so the
            footer never wraps onto a second line on a phone. */}
        <div className="hidden items-center gap-0.5 px-1 sm:flex">
          {pageWindow(current, totalPages).map((slot, i) =>
            slot === "…" ? (
              <span key={`gap-${i}`} aria-hidden className="px-1 text-xs text-slate-300">
                …
              </span>
            ) : (
              <button
                key={slot}
                type="button"
                onClick={() => goPage(slot)}
                aria-label={`Page ${slot}`}
                aria-current={slot === current ? "page" : undefined}
                className={
                  slot === current
                    ? "flex h-8 min-w-8 items-center justify-center rounded-lg bg-gradient-to-b from-accent-500 to-accent-600 px-2 text-xs font-bold tabular-nums text-white shadow-brand"
                    : "flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-semibold tabular-nums text-slate-600 transition-colors hover:bg-white hover:text-accent-700 hover:ring-1 hover:ring-slate-200"
                }
              >
                {slot}
              </button>
            ),
          )}
        </div>
        <span className="px-2 text-xs font-semibold tabular-nums text-slate-600 sm:hidden">
          {current} / {totalPages}
        </span>

        <button
          type="button"
          onClick={() => goPage(current + 1)}
          disabled={current === totalPages}
          aria-label="Next page"
          title="Next page"
          className={stepCls}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => goPage(totalPages)}
          disabled={current === totalPages}
          aria-label="Last page"
          title="Last page"
          className={`${stepCls} hidden sm:flex`}
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}