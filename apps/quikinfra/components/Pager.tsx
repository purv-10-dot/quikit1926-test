"use client";

/**
 * Numbered pager matching the DataTable's built-in pager, for the handful of
 * pages that render a custom table (DPR, Work Orders, Audit) instead of
 * <DataTable>. Keeps the pagination UI consistent across the app.
 */

export const PAGE_SIZES = [25, 50, 100];

export function Pager({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const goPage = (p: number) =>
    onPageChange(Math.min(Math.max(1, p), totalPages));

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap text-sm px-1 mt-3">
      <div className="flex items-center gap-2 text-slate-500 text-xs">
        <span className="font-medium">Rows per page:</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent-200 focus:border-accent-400 hover:border-slate-300 transition-colors"
        >
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span className="text-slate-400">·</span>
        <span className="text-slate-500">
          Showing{" "}
          <strong className="text-slate-700">
            {total === 0 ? 0 : start + 1}–{Math.min(start + pageSize, total)}
          </strong>{" "}
          of <strong className="text-slate-700">{total}</strong>
        </span>
      </div>
      <div className="flex items-center gap-1 bg-white rounded-xl ring-1 ring-slate-200 p-1 shadow-sm">
        {([["«", 1], ["‹", page - 1]] as const).map(([l, target]) => (
          <button
            key={l}
            type="button"
            onClick={() => goPage(target)}
            disabled={page === 1}
            className="rounded-lg w-7 h-7 text-xs text-slate-500 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent-50 hover:text-accent-700 transition-colors flex items-center justify-center"
          >
            {l}
          </button>
        ))}
        <span className="px-3 h-7 inline-flex items-center text-xs font-bold rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-sm">
          {page} <span className="opacity-60 mx-1">/</span> {totalPages}
        </span>
        {([["›", page + 1], ["»", totalPages]] as const).map(([l, target]) => (
          <button
            key={l}
            type="button"
            onClick={() => goPage(target)}
            disabled={page === totalPages}
            className="rounded-lg w-7 h-7 text-xs text-slate-500 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent-50 hover:text-accent-700 transition-colors flex items-center justify-center"
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}
