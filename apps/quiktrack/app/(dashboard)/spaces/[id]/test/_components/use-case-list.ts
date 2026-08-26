"use client";

import { useEffect, useMemo, useState } from "react";
import { useApiData } from "@/lib/hooks/useApiData";
import type { TestCaseRow } from "./case-meta";

/**
 * Fetches the case list for the active folder/suite, filters, and deleted state.
 *
 * QUIKTR-341 fix: this previously fetched a single page (server default
 * `pageSize=50`, capped at 200) and never fetched more — a suite with, say,
 * 375 cases silently showed only the first page with no way to reach the
 * rest, and the count in the header ("375 cases") disagreed with what was
 * actually on screen. Now accumulates pages via `loadMore()`, exposing
 * `hasMore`/`loadingMore` so the table can trigger the next page as the user
 * scrolls near the bottom — the same "load more" shape already used by the
 * "Select cases" modal's case list (`select-cases-list.tsx`).
 *
 * Extracted from `repository-view.tsx`, which passed the 300-line ceiling in
 * apps/quiktrack/CLAUDE.md once the filter bar (QUIKTR-341) landed.
 */

const PAGE_SIZE = 100;

interface CaseListResponse {
  items: TestCaseRow[];
  total: number;
}

export function useCaseList({
  projectId,
  activeSectionId,
  activeSuiteId,
  showDeleted,
  toQueryString,
}: {
  projectId: string;
  activeSectionId: string | null;
  activeSuiteId: string | null;
  showDeleted: boolean;
  /** From useCaseFilters — builds the filter query string. */
  toQueryString: (extra: Record<string, string>) => string;
}) {
  const [page, setPage] = useState(1);

  const baseQuery = useMemo(() => {
    if (!activeSectionId && !activeSuiteId) return null;
    const scope: Record<string, string> = { deleted: showDeleted ? "true" : "false" };
    if (activeSectionId) scope.sectionId = activeSectionId;
    else if (activeSuiteId) scope.suiteId = activeSuiteId;
    return toQueryString(scope);
  }, [activeSectionId, activeSuiteId, showDeleted, toQueryString]);

  // A new folder/suite/filter/deleted-view invalidates accumulated pages —
  // otherwise "load more" while browsing folder A could keep appending folder
  // A's page 3 after switching to folder B.
  useEffect(() => {
    setPage(1);
  }, [baseQuery]);

  const caseQuery =
    baseQuery === null ? null : `${baseQuery}&page=${page}&pageSize=${PAGE_SIZE}`;

  // showDeleted, the filter string, AND the page are part of the cache key:
  // different pages are different data, and sharing one key would show a
  // stale page until an unrelated refetch happened to occur.
  const casesKey = [
    "quiktrack",
    "test-cases",
    projectId,
    activeSectionId ?? activeSuiteId ?? "none",
    showDeleted ? "deleted" : "live",
    baseQuery ?? "",
    page,
  ] as const;

  const { data, isLoading } = useApiData<CaseListResponse>(
    casesKey,
    caseQuery ? `/api/test/cases?projectId=${projectId}&${caseQuery}` : null,
    { staleTime: 0 },
  );

  // Accumulate across pages rather than replacing — "load more" grows the
  // visible list, it does not reset scroll position back to the top.
  const [accumulated, setAccumulated] = useState<TestCaseRow[]>([]);
  useEffect(() => {
    if (!data) return;
    setAccumulated((prev) => (page === 1 ? data.items : [...prev, ...data.items]));
  }, [data, page]);

  const total = data?.total ?? 0;
  const hasMore = accumulated.length < total;

  return {
    cases: { items: accumulated, total },
    loading: isLoading && page === 1,
    hasMore,
    loadingMore: isLoading && page > 1,
    loadMore: () => {
      if (hasMore && !isLoading) setPage((p) => p + 1);
    },
  };
}
