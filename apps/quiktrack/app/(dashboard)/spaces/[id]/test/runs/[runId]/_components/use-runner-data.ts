"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useApiData } from "@/lib/hooks/useApiData";
import type { RunnerFilterKey } from "./runner-filters";
import type { RunnerSort } from "./runner-toolbar";
import { useRunnerKeys } from "./use-runner-keys";
import type { RunActivity } from "./run-activity-types";
import type {
  RunSummaryData,
  RunnerTest,
  TestDetail,
  TestStatusLite,
} from "./runner-types";
import type { RunTab } from "./run-tabs";

/**
 * All data-fetching and mutation logic for the runner (QUIKTR-341).
 *
 * Extracted from `runner-view.tsx`, which crossed the 300-line ceiling in
 * apps/quiktrack/CLAUDE.md once Sort/Filter state landed alongside everything
 * the grid already needed. The view file is now JSX + this hook's return value;
 * every fetch, cache key, and mutation lives here.
 */
export function useRunnerData({ runId, tab }: { runId: string; tab: RunTab }) {
  const queryClient = useQueryClient();
  const [activeTestId, setActiveTestId] = useState<string | null>(null);
  // QUIKTR-341 — the detail panel now has a real × close. `activeTestId ===
  // null` used to mean two different things at once ("nothing has loaded yet"
  // AND "the user closed it"), which is why closing needed its own flag: without
  // it, the auto-select effect below would immediately reopen the panel on the
  // very next render.
  const [panelClosed, setPanelClosed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Surfaces the server's actual validation message when a status/result write
  // fails — previously the failure was swallowed to a bare `false`, so a 400
  // (e.g. a malformed body) looked identical to "nothing happened" with no way
  // to tell why short of opening DevTools' Network tab.
  const [resultError, setResultError] = useState<string | null>(null);

  const openTest = (id: string) => {
    setPanelClosed(false);
    setActiveTestId(id);
  };
  const closePanel = () => {
    setPanelClosed(true);
    setActiveTestId(null);
  };

  // Sort + Filter bar. Component state, not URL — the runner is a work surface
  // a tester keeps open and re-filters through a session, unlike the case
  // repository's filters, which are meant to be bookmarked/shared.
  const [sort, setSort] = useState<RunnerSort>("section");
  const [filters, setFilters] = useState<Partial<Record<RunnerFilterKey, string>>>({});
  const setFilter = (key: RunnerFilterKey, value: string | undefined) =>
    setFilters((f) => ({ ...f, [key]: value }));
  const clearFilters = () => setFilters({});

  const testsQuery = useMemo(() => {
    const p = new URLSearchParams({ pageSize: "500", sort });
    if (filters.statusId) p.set("statusId", filters.statusId);
    if (filters.assignee) p.set("assignee", filters.assignee);
    if (filters.priority) p.set("priority", filters.priority);
    if (filters.label) p.set("label", filters.label);
    return p.toString();
  }, [sort, filters]);

  const testsKey = ["quiktrack", "run-tests", runId, testsQuery] as const;
  const { data: testsData, isLoading: testsLoading } = useApiData<{
    items: RunnerTest[];
    total: number;
  }>(testsKey, `/api/test/runs/${runId}/tests?${testsQuery}`, { staleTime: 0 });

  const runKey = ["quiktrack", "run", runId] as const;
  const { data: run } = useApiData<RunSummaryData>(
    runKey,
    `/api/test/runs/${runId}`,
    { staleTime: 0 },
  );

  const { data: statuses } = useApiData<TestStatusLite[]>(
    ["quiktrack", "test-statuses"],
    "/api/test/statuses",
    { staleTime: 5 * 60_000 },
  );

  /** Reassigns any row's per-test owner — the grid calls this directly per row. */
  const reassign = async (testId: string, userId: string | null) => {
    await fetch(`/api/test/tests/${testId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assigneeId: userId }),
    });
    // The grid shows the picker inline and the detail pane shows it again, so
    // both caches are stale after a reassignment.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: testsKey }),
      queryClient.invalidateQueries({ queryKey: ["quiktrack", "test-detail", testId] }),
    ]);
  };

  /**
   * Priority/Type/etc. live on the CASE, not the test — same inline-edit
   * endpoint (`inlineUpdateTestCase`) the case repository grid uses, which
   * deliberately does NOT bump the case version (see QUIKTEST-INLINE). Callers
   * pass the test's id too, purely so both the grid's cache AND the detail
   * panel's own cached copy invalidate together — editing a field from the
   * panel must not leave the panel showing a stale value for what it just
   * changed.
   */
  const patchCaseInline = async (
    caseId: string,
    testId: string,
    patch: Record<string, string>,
  ): Promise<boolean> => {
    try {
      const res = await fetch(`/api/test/cases/${caseId}/inline`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = (await res.json()) as { success: boolean };
      if (!json.success) return false;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: testsKey }),
        queryClient.invalidateQueries({ queryKey: ["quiktrack", "test-detail", testId] }),
      ]);
      return true;
    } catch {
      return false;
    }
  };

/**
   * Any single-field case edit (Priority, Type, …) — a thin, named wrapper over
   * `patchCaseInline` so callers pass the field they mean rather than a raw
   * object. Callers always know their own row's testId, so this never needs to
   * guess at "the active one".
   */
  const setCaseField = (testId: string, caseId: string, field: string, value: string) =>
    patchCaseInline(caseId, testId, { [field]: value });

  const onLabelsChanged = () => {
    void queryClient.invalidateQueries({ queryKey: testsKey });
    if (activeTestId) {
      void queryClient.invalidateQueries({
        queryKey: ["quiktrack", "test-detail", activeTestId],
      });
    }
  };

  // Memoised because `?? []` yields a fresh array on every render, which would
  // re-run the selection effect and rebuild the navigation callbacks each pass.
  const tests = useMemo(() => testsData?.items ?? [], [testsData]);

  // Select the first test once the list arrives, and recover if the active test
  // drops out of the current filter. Skipped once the panel has been explicitly
  // closed — a tester who dismissed it does not want it reopening on the next
  // refetch (a status change, a filter change, anything that reruns this).
  useEffect(() => {
    if (panelClosed) return;
    if (tests.length === 0) return;
    if (activeTestId && tests.some((t) => t.id === activeTestId)) return;
    setActiveTestId(tests[0].id);
  }, [tests, activeTestId, panelClosed]);

  const { data: detail, isLoading: detailLoading } = useApiData<TestDetail>(
    ["quiktrack", "test-detail", activeTestId ?? "none"],
    activeTestId ? `/api/test/tests/${activeTestId}` : null,
    { staleTime: 0 },
  );

  /** Next test in the visible list, or null at the end. */
  const advance = useCallback(() => {
    if (!activeTestId) return;
    const index = tests.findIndex((t) => t.id === activeTestId);
    const next = tests[index + 1];
    if (next) setActiveTestId(next.id);
  }, [activeTestId, tests]);

  const step = useCallback(
    (delta: number) => {
      if (!activeTestId) return;
      const index = tests.findIndex((t) => t.id === activeTestId);
      const target = tests[index + delta];
      if (target) setActiveTestId(target.id);
    },
    [activeTestId, tests],
  );

  // j/k and the post-record advance only make sense once a test is active,
  // i.e. only after the panel has been opened at least once — they never
  // reopen a closed panel on their own.

  /**
   * Records a result for ANY test row, not only the active one — the grid's
   * Status column calls this per row. No comment/elapsed time: QUIKTR-341
   * dropped the result-entry form in favour of one-click status changes,
   * matching the reference UI.
   */
  const submitResult = async (
    testId: string,
    input: { statusId: string; comment?: string; elapsedMs?: number },
  ): Promise<boolean> => {
    setSubmitting(true);
    setResultError(null);
    try {
      const res = await fetch(`/api/test/tests/${testId}/results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!json.success) {
        setResultError(json.error ?? "Could not record the result.");
        return false;
      }

      // Refresh the grid (status pills) and the run summary (donut + counts).
      // The detail pane's cached status is stale too, so drop it.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: testsKey }),
        queryClient.invalidateQueries({ queryKey: runKey }),
        queryClient.invalidateQueries({
          queryKey: ["quiktrack", "test-detail", testId],
        }),
        // The result just recorded is a new activity event and may have added a
        // defect, so the trail and the Defects badge are both stale.
        queryClient.invalidateQueries({
          queryKey: ["quiktrack", "run-activity", runId],
        }),
        // And it is a new entry in this test's own history (QUIKTR-340) — without
        // this the pane would still show the PREVIOUS result marked "current".
        queryClient.invalidateQueries({
          queryKey: ["quiktrack", "test-results", testId],
        }),
      ]);
      return true;
    } catch {
      setResultError("Network error — the result was not saved. Please retry.");
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  // Activity and Defects share one endpoint. Fetched for every tab rather than
  // lazily, because the Defects tab carries a count badge that must be right
  // while the user is still on Tests — a badge that only appears after you click
  // the tab is worse than no badge.
  const { data: activity, isLoading: activityLoading } = useApiData<RunActivity>(
    ["quiktrack", "run-activity", runId],
    `/api/test/runs/${runId}/activity`,
    { staleTime: 0 },
  );

  useRunnerKeys({
    statuses,
    // Disabled on a closed run and on every tab except Tests.
    enabled: tab === "tests" && run?.state !== "closed",
    submitting,
    step,
    advance,
    // 1-5 always act on the ACTIVE row (last one clicked open) — same target the
    // detail pane on the right is showing.
    submitResult: (input) =>
      activeTestId ? submitResult(activeTestId, input) : Promise.resolve(false),
  });

  const toggleRunState = async () => {
    if (!run) return;
    await fetch(`/api/test/runs/${runId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: run.state === "closed" ? "reopen" : "close" }),
    });
    await queryClient.invalidateQueries({ queryKey: runKey });
  };

  return {
    activeTestId,
    openTest,
    closePanel,
    sort,
    setSort,
    filters,
    setFilter,
    clearFilters,
    tests,
    testsTotal: testsData?.total ?? 0,
    testsLoading,
    run,
    statuses: statuses ?? [],
    detail: detail ?? null,
    detailLoading,
    activity,
    activityLoading,
    reassign,
    setCaseField,
    onLabelsChanged,
    submitResult,
    resultError,
    dismissResultError: () => setResultError(null),
    toggleRunState,
  };
}
