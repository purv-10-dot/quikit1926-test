"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

interface PagerProps {
  page: number;
  pageSize: number;
  total: number;
  loading: boolean;
  rowCount: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (n: number) => void;
}

export function Pager({ page, pageSize, total, loading, rowCount, onPageChange, onPageSizeChange }: PagerProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = total === 0 ? 0 : Math.min(total, (page - 1) * pageSize + rowCount);
  const canPrev = page > 1 && !loading;
  const canNext = page < totalPages && !loading;

  return (
    <div className="mt-3 flex items-center justify-between text-xs text-gray-600">
      <div>
        {loading && rowCount === 0
          ? "Loading…"
          : total === 0
            ? "0 of 0"
            : `${start}–${end} of ${total}`}
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5">
          <span className="text-gray-500">Rows</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-7 px-1.5 border border-gray-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={!canPrev}
            onClick={() => onPageChange(page - 1)}
            className="h-7 w-7 inline-flex items-center justify-center border border-gray-200 rounded disabled:opacity-40 hover:bg-gray-50"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="px-2">
            Page <span className="font-medium text-gray-800">{page}</span> of {totalPages}
          </span>
          <button
            type="button"
            disabled={!canNext}
            onClick={() => onPageChange(page + 1)}
            className="h-7 w-7 inline-flex items-center justify-center border border-gray-200 rounded disabled:opacity-40 hover:bg-gray-50"
            aria-label="Next page"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Shimmer placeholder rows shown while the first page loads. */
export function SkeletonRows({ rows }: { rows: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i}>
          <td className="px-3 py-2.5">
            <div className="flex items-center gap-2">
              <div className="h-4 w-12 shrink-0 rounded bg-gray-200 animate-pulse" />
              <div className="h-4 w-2/3 rounded bg-gray-200 animate-pulse" />
            </div>
          </td>
          <td className="px-3 py-2.5">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 shrink-0 rounded-full bg-gray-200 animate-pulse" />
              <div className="h-4 w-16 rounded bg-gray-200 animate-pulse" />
            </div>
          </td>
          <td className="px-3 py-2.5">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 shrink-0 rounded-full bg-gray-200 animate-pulse" />
              <div className="h-4 w-16 rounded bg-gray-200 animate-pulse" />
            </div>
          </td>
          <td className="px-3 py-2.5">
            <div className="h-4 w-12 rounded bg-gray-200 animate-pulse" />
          </td>
          <td className="px-3 py-2.5">
            <div className="h-5 w-16 rounded bg-gray-200 animate-pulse" />
          </td>
          <td className="px-3 py-2.5">
            <div className="h-4 w-20 rounded bg-gray-200 animate-pulse" />
          </td>
          <td className="px-3 py-2.5">
            <div className="h-4 w-20 rounded bg-gray-200 animate-pulse" />
          </td>
        </tr>
      ))}
    </>
  );
}
