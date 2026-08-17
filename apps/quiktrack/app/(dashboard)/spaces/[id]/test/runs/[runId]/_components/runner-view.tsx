"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useProjectMembers } from "../../../_components/use-project-members";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Lock, Unlock } from "lucide-react";
import { Button } from "@quikit/ui";
import { useApiData } from "@/lib/hooks/useApiData";
import { RunSummary } from "@/components/test/run-summary";
import { RunTabPanels } from "./run-tab-panels";
import { RunTabs, type RunTab } from "./run-tabs";
import { useRunnerKeys } from "./use-runner-keys";
import { type RunnerFilter } from "./test-list-pane";
import type { RunActivity } from "./run-activity-types";
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
  const [tab, setTab] = useState<RunTab>("tests");

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

  // Project members for the assignee picker (QUIKTR-317).
  const { members: memberList, assigneeName } = useProjectMembers(projectId);

  const reassign = async (userId: string | null) => {
    if (!activeTestId) return;
    await fetch(`/api/test/tests/${activeTestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assigneeId: userId }),
    });
    // The list shows the assignee chip and the detail pane shows the picker, so
    // both caches are stale after a reassignment.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["quiktrack", "run-tests", runId] }),
      queryClient.invalidateQueries({
        queryKey: ["quiktrack", "test-detail", activeTestId],
      }),
    ]);
  };

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
        // The result just recorded is a new activity event and may have added a
        // defect, so the trail and the Defects badge are both stale.
        queryClient.invalidateQueries({
          queryKey: ["quiktrack", "run-activity", runId],
        }),
        // And it is a new entry in this test's own history (QUIKTR-340) — without
        // this the pane would still show the PREVIOUS result marked "current".
        queryClient.invalidateQueries({
          queryKey: ["quiktrack", "test-results", activeTestId],
        }),
      ]);
      return true;
    } catch {
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
    submitResult,
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
              {/* Run owner. Individual tests are assigned separately, so this is
                  who owns the run, not who executes each case. */}
              {run.owner
                ? ` · owner ${`${run.owner.firstName} ${run.owner.lastName}`.trim()}`
                : ""}
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

      {/* QUIKTR-339 — tabs rather than routes: the header above stays put across
          all four, and routing would remount it and lose the selected test on
          every switch. */}
      <RunTabs
        active={tab}
        onChange={setTab}
        defectCount={activity?.defects.length}
      />

      <RunTabPanels
        tab={tab}
        projectId={projectId}
        run={run}
        tests={tests}
        testsTotal={testsData?.total ?? 0}
        testsLoading={testsLoading}
        activeTestId={activeTestId}
        onSelectTest={setActiveTestId}
        filter={filter}
        onFilterChange={setFilter}
        assigneeName={assigneeName}
        detail={detail ?? null}
        detailLoading={detailLoading}
        statuses={statuses ?? []}
        onSubmit={submitResult}
        submitting={submitting}
        onAdvance={advance}
        members={memberList}
        onReassign={reassign}
        activity={activity}
        activityLoading={activityLoading}
      />

      {tab === "tests" && (
        <div className="border-t border-gray-200 px-4 py-1.5 text-[11px] text-gray-400">
          Shortcuts: 1 Passed · 2 Failed · 3 Blocked · 4 Retest · 5 Skipped · j/k
          to move
        </div>
      )}
    </div>
  );
}
