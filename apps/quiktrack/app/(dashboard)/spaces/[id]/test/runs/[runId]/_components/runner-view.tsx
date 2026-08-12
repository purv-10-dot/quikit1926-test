"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Lock, Unlock } from "lucide-react";
import { Button } from "@quikit/ui";
import { useApiData } from "@/lib/hooks/useApiData";
import { RunSummary } from "@/components/test/run-summary";
import { CaseDetailPane } from "./case-detail-pane";
import { ResultEntryPane } from "./result-entry-pane";
import { TestListPane, type RunnerFilter } from "./test-list-pane";
import {
  runRef,
  type RunSummaryData,
  type RunnerTest,
  type TestDetail,
  type TestStatusLite,
} from "./runner-types";

/**
 * The three-pane runner: work list → case detail → result entry.
 *
 * The point of this screen is throughput, so nothing here navigates: selecting a
 * test swaps the middle and right panes in place, and recording a result
 * advances to the next unfinished test. Keyboard shortcuts (1-5 to record, j/k
 * to move) let a tester work without the mouse.
 */

interface RunnerViewProps {
  projectId: string;
  runId: string;
}

const FILTER_STATUS: Record<RunnerFilter, string | null> = {
  all: null,
  untested: "untested",
  failed: "failed",
  mine: null,
};

export function RunnerView({ projectId, runId }: RunnerViewProps) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<RunnerFilter>("all");
  const [activeTestId, setActiveTestId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const testsQuery = useMemo(() => {
    const params = new URLSearchParams({ pageSize: "500" });
    const status = FILTER_STATUS[filter];
    if (status) params.set("status", status);
    if (filter === "mine") params.set("mine", "true");
    return params.toString();
  }, [filter]);

  const testsKey = ["quiktrack", "run-tests", runId, filter] as const;
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

  // Memoised because `?? []` yields a fresh array on every render, which would
  // re-run the selection effect and rebuild the navigation callbacks each pass.
  const tests = useMemo(() => testsData?.items ?? [], [testsData]);

  // Select the first test once the list arrives, and recover if the active test
  // drops out of the current filter.
  useEffect(() => {
    if (tests.length === 0) return;
    if (activeTestId && tests.some((t) => t.id === activeTestId)) return;
    setActiveTestId(tests[0].id);
  }, [tests, activeTestId]);

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

  const submitResult = async (input: {
    statusId: string;
    comment?: string;
    elapsedMs?: number;
  }): Promise<boolean> => {
    if (!activeTestId) return false;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/test/tests/${activeTestId}/results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = (await res.json()) as { success: boolean };
      if (!json.success) return false;

      // Refresh the list (status glyphs) and the run summary (donut + counts).
      // The detail pane's cached status is stale too, so drop it.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["quiktrack", "run-tests", runId] }),
        queryClient.invalidateQueries({ queryKey: runKey }),
        queryClient.invalidateQueries({
          queryKey: ["quiktrack", "test-detail", activeTestId],
        }),
      ]);
      return true;
    } catch {
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const primaryStatusByIndex = useMemo(() => {
    const order = ["passed", "failed", "blocked", "retest", "skipped"];
    return order
      .map((key) => statuses?.find((s) => s.key === key))
      .filter((s): s is TestStatusLite => Boolean(s));
  }, [statuses]);

  // Keyboard: 1-5 record an outcome, j/k move. Ignored while typing so a comment
  // containing "1" doesn't fire a result.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (submitting || run?.state === "closed") return;

      if (e.key === "j") {
        step(1);
        return;
      }
      if (e.key === "k") {
        step(-1);
        return;
      }

      const n = Number.parseInt(e.key, 10);
      if (Number.isInteger(n) && n >= 1 && n <= primaryStatusByIndex.length) {
        const status = primaryStatusByIndex[n - 1];
        void submitResult({ statusId: status.id }).then((saved) => {
          if (saved) advance();
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryStatusByIndex, submitting, run?.state, step, advance, activeTestId]);

  const toggleRunState = async () => {
    if (!run) return;
    await fetch(`/api/test/runs/${runId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: run.state === "closed" ? "reopen" : "close" }),
    });
    await queryClient.invalidateQueries({ queryKey: runKey });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 px-4 py-3">
        <div className="min-w-0">
          <Link
            href={`/spaces/${projectId}/test`}
            className="mb-1 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"
          >
            <ArrowLeft className="h-3 w-3" />
            Test cases
          </Link>
          <h1 className="truncate text-base font-semibold text-gray-900">
            {run ? `${runRef(run.refId)} · ${run.name}` : "Loading run…"}
          </h1>
          {run && (
            <p className="text-xs text-gray-500">
              {run.source}
              {run.build ? ` · build ${run.build}` : ""}
              {run.environment ? ` · ${run.environment}` : ""}
              {run.state === "closed" ? " · closed" : ""}
            </p>
          )}
        </div>

        {run && (
          <Button
            size="sm"
            variant="outline"
            onClick={toggleRunState}
            className="shrink-0"
          >
            {run.state === "closed" ? (
              <>
                <Unlock className="mr-1 h-3.5 w-3.5" />
                Reopen run
              </>
            ) : (
              <>
                <Lock className="mr-1 h-3.5 w-3.5" />
                Close run
              </>
            )}
          </Button>
        )}
      </div>

      {run && Object.keys(run.counts).length > 0 && (
        <div className="border-b border-gray-200 px-4 py-3">
          <RunSummary counts={run.counts} size="sm" />
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <TestListPane
          tests={tests}
          total={testsData?.total ?? 0}
          activeTestId={activeTestId}
          onSelect={setActiveTestId}
          filter={filter}
          onFilterChange={setFilter}
          loading={testsLoading}
        />
        <CaseDetailPane detail={detail ?? null} loading={detailLoading} />
        <ResultEntryPane
          detail={detail ?? null}
          statuses={statuses ?? []}
          onSubmit={submitResult}
          submitting={submitting}
          onAdvance={advance}
        />
      </div>

      <div className="border-t border-gray-200 px-4 py-1.5 text-[11px] text-gray-400">
        Shortcuts: 1 Passed · 2 Failed · 3 Blocked · 4 Retest · 5 Skipped · j/k to
        move
      </div>
    </div>
  );
}
