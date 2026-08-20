"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@quikit/ui";
import { useApiData } from "@/lib/hooks/useApiData";
import { caseRef, type TestCaseRow } from "../../_components/case-meta";
import { TriCheckbox } from "./tri-checkbox";

/**
 * Middle column of `SelectCasesModal` (QUIKTR-341) — the active folder's cases,
 * with search, a real "load more" against the server's `total` (replacing the
 * old picker's hard 200-case cap with no way past it), and per-row
 * checkboxes.
 *
 * Locking is entirely the CALLER'S concern via `lockedIds` — this component
 * only refuses to toggle a locked row and shows why. It does not know or care
 * whether "locked" means "has results" (Edit mode) or nothing at all (Create
 * mode, where nothing is ever locked).
 */

const PAGE_SIZE = 100;

export function SelectCasesList({
  projectId,
  sectionId,
  filters,
  selected,
  onToggle,
  lockedIds,
}: {
  projectId: string;
  /** Null = no folder chosen yet. */
  sectionId: string | null;
  /** Raw filter key→value map, forwarded as query params. */
  filters: Partial<Record<string, string>>;
  selected: Set<string>;
  onToggle: (caseId: string, on: boolean) => void;
  /** Rows whose checkbox is individually disabled (see file comment). */
  lockedIds: Set<string>;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const filtersKey = JSON.stringify(filters);
  // A new folder or a changed search/filter set invalidates the current page —
  // otherwise "load more" on page 3 of the old folder would silently keep
  // fetching page 3 of the new one.
  useEffect(() => {
    setPage(1);
  }, [sectionId, query, filtersKey]);

  const qs = new URLSearchParams({
    projectId,
    pageSize: String(PAGE_SIZE),
    page: String(page),
  });
  if (sectionId) qs.set("sectionId", sectionId);
  if (query.trim()) qs.set("query", query.trim());
  for (const [k, v] of Object.entries(filters)) if (v) qs.set(k, v);

  const { data, isLoading } = useApiData<{ items: TestCaseRow[]; total: number }>(
    ["quiktrack", "test-cases", "select-modal", qs.toString()],
    sectionId ? `/api/test/cases?${qs.toString()}` : null,
    { staleTime: 0 },
  );

  // Accumulate across pages rather than replacing — "load more" should grow
  // the visible list, not jump the scroll position back to a fresh page 1.
  const [accumulated, setAccumulated] = useState<TestCaseRow[]>([]);
  useEffect(() => {
    if (!data) return;
    setAccumulated((prev) => (page === 1 ? data.items : [...prev, ...data.items]));
  }, [data, page]);

  const total = data?.total ?? 0;
  const hasMore = accumulated.length < total;

  if (!sectionId) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-gray-500">
        Choose a folder on the left.
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="relative border-b border-gray-200 p-2">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title…"
          size="compact"
          className="w-full pl-7"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && accumulated.length === 0 ? (
          <p className="p-4 text-sm text-gray-400">Loading…</p>
        ) : accumulated.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">No cases match.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-gray-200 text-left text-[11px] text-gray-500">
                <th className="w-9 px-2 py-1.5" />
                <th className="px-2 py-1.5">Title</th>
              </tr>
            </thead>
            <tbody>
              {accumulated.map((c) => {
                const locked = lockedIds.has(c.id);
                return (
                  <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-2 py-1.5">
                      <TriCheckbox
                        checked={selected.has(c.id)}
                        disabled={locked}
                        onChange={(on) => onToggle(c.id, on)}
                        ariaLabel={`Select ${caseRef(c.refId)}`}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-gray-800">
                      <span className="mr-1.5 font-mono text-[11px] text-gray-400">
                        {caseRef(c.refId)}
                      </span>
                      {c.title}
                      {locked && (
                        <span className="ml-1.5 rounded bg-blue-50 px-1 text-[10px] text-blue-600">
                          Already in run
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {hasMore && (
          <div className="p-2 text-center">
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              className="text-xs text-accent-700 hover:underline"
            >
              Load {Math.min(PAGE_SIZE, total - accumulated.length)} more (
              {accumulated.length} of {total})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
