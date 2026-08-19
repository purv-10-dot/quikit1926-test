"use client";

import { useMemo } from "react";
import { useApiData } from "@/lib/hooks/useApiData";
import type { TestCaseRow } from "./case-meta";

/**
 * Fetches the case list for the active folder/suite, filters, and deleted state.
 *
 * Extracted from `repository-view.tsx`, which passed the 300-line ceiling in
 * apps/quiktrack/CLAUDE.md once the filter bar (QUIKTR-341) landed.
 */

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
  const caseQuery = useMemo(() => {
    if (!activeSectionId && !activeSuiteId) return null;
    const scope: Record<string, string> = { deleted: showDeleted ? "true" : "false" };
    if (activeSectionId) scope.sectionId = activeSectionId;
    else if (activeSuiteId) scope.suiteId = activeSuiteId;
    return toQueryString(scope);
  }, [activeSectionId, activeSuiteId, showDeleted, toQueryString]);

  // showDeleted AND the filter string are part of the cache key: different
  // filters are different data, and sharing one key would show stale rows until
  // an unrelated refetch happened to occur.
  const casesKey = [
    "quiktrack",
    "test-cases",
    projectId,
    activeSectionId ?? activeSuiteId ?? "none",
    showDeleted ? "deleted" : "live",
    caseQuery ?? "",
  ] as const;

  const { data, isLoading } = useApiData<CaseListResponse>(
    casesKey,
    caseQuery ? `/api/test/cases?projectId=${projectId}&${caseQuery}` : null,
  );

  return { cases: data, loading: isLoading };
}
