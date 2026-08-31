"use client";

/**
 * "Load more (N of Total shown)" fallback for the case grid's scroll-triggered
 * pagination (QUIKTR-341). Split from `case-table.tsx`, which passed the
 * 300-line ceiling in apps/quiktrack/CLAUDE.md once real pagination replaced
 * the single-page fetch that silently truncated large suites.
 *
 * Scroll-triggered loading is the primary path (see `CaseTable`'s own
 * `onScroll` handler); this button is the fallback for anyone who reaches the
 * bottom via keyboard/Page Down before a scroll event has fired, and it also
 * states plainly how many of the total are actually loaded — the exact fact
 * that was silently wrong before this fix.
 */
export function CaseTableLoadMore({
  shown,
  total,
  loading,
  onLoadMore,
}: {
  shown: number;
  total: number;
  loading: boolean;
  onLoadMore?: () => void;
}) {
  return (
    <div className="border-t border-gray-100 py-3 text-center">
      <button
        type="button"
        onClick={onLoadMore}
        disabled={loading}
        className="text-xs font-medium text-accent-700 hover:underline disabled:opacity-50"
      >
        {loading ? "Loading…" : `Load more (${shown} of ${total} shown)`}
      </button>
    </div>
  );
}
