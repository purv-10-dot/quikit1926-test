"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPage: (next: number) => void;
  /** Optional — when provided, renders the page-size dropdown. */
  pageSizeOptions?: readonly number[];
  onPageSizeChange?: (next: number) => void;
  /** Optional — when true, renders numbered page buttons (default false to preserve legacy callers). */
  showPageNumbers?: boolean;
}

/**
 * Build a windowed list of page numbers around the current page, plus first/last
 * sentinels with ellipses. Returns a mix of numbers and the literal "…" marker.
 */
function buildPageList(current: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const out: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(totalPages - 1, current + 1);
  if (start > 2) out.push("…");
  for (let p = start; p <= end; p++) out.push(p);
  if (end < totalPages - 1) out.push("…");
  out.push(totalPages);
  return out;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  pageSizeOptions,
  onPageSizeChange,
  showPageNumbers = false,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  const pages = showPageNumbers ? buildPageList(page, totalPages) : [];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-crm-border px-4 py-3 text-sm text-crm-muted">
      <div className="flex items-center gap-3">
        <span>
          {start}–{end} of {total}
        </span>
        {pageSizeOptions && onPageSizeChange && (
          <label className="flex items-center gap-1.5">
            <span className="text-xs">Rows</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-8 rounded border border-crm-border bg-white px-2 text-xs text-crm-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
              aria-label="Rows per page"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="crm-btn-ghost h-8 w-8 p-0"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
        </button>
        {showPageNumbers ? (
          pages.map((p, i) =>
            p === "…" ? (
              <span key={`gap-${i}`} className="px-2 text-xs text-crm-muted">
                …
              </span>
            ) : (
              <button
                type="button"
                key={p}
                onClick={() => onPage(p)}
                aria-current={p === page ? "page" : undefined}
                className={
                  "h-8 min-w-[2rem] rounded px-2 text-xs font-medium transition " +
                  (p === page
                    ? "bg-accent-600 text-white"
                    : "text-crm-text hover:bg-crm-panel")
                }
              >
                {p}
              </button>
            ),
          )
        ) : (
          <span className="px-2">
            {page} / {totalPages}
          </span>
        )}
        <button
          type="button"
          className="crm-btn-ghost h-8 w-8 p-0"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
