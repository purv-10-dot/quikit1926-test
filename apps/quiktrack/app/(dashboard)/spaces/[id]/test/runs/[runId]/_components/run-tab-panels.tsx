"use client";

import type { MemberOption } from "./assignee-picker";
import type { RunnerFilterKey } from "./runner-filters";
import type { RunnerSort } from "./runner-toolbar";
import { RunActivityPane } from "./run-activity-pane";
import { RunProgressPane } from "./run-progress-pane";
import type { RunTab } from "./run-tabs";
import { TestsTab } from "./tests-tab";
import type { RunActivity } from "./run-activity-types";
import type { RunSummaryData, RunnerTest, TestStatusLite } from "./runner-types";
import type { StatusCounts } from "@/lib/test/statuses";

/**
 * Body of the run's sub-navigation (QUIKTR-339).
 *
 * Split from `runner-view.tsx`, which reached 331 lines once four tabs landed —
 * over the 300 ceiling in apps/quiktrack/CLAUDE.md. The view keeps the data and
 * handlers; this file only decides which pane is on screen.
 *
 * QUIKTR-341 — the Tests tab is now `TestsTab`: a TestRail-style grid (Sort +
 * Filter toolbar, section grouping, bulk selection) rather than
 * list+detail+entry-form. That whole tab's composition lives in tests-tab.tsx,
 * not here, since it needs selection state the other three tabs have no use
 * for. The detail pane is rendered by `runner-view.tsx` directly, as a card
 * SIBLING to this whole component (not a child of any one tab) — it needs to
 * sit outside the main card's border, matching the reference UI's two-card
 * layout.
 */

interface RunTabPanelsProps {
  tab: RunTab;
  projectId: string;
  runId: string;
  run: RunSummaryData | undefined;
  // Tests tab
  tests: RunnerTest[];
  testsTotal: number;
  testsLoading: boolean;
  activeTestId: string | null;
  onOpenDetail: (id: string) => void;
  statuses: TestStatusLite[];
  members: MemberOption[];
  onSetStatus: (testId: string, statusId: string) => Promise<boolean>;
  onReassign: (testId: string, userId: string | null) => Promise<void>;
  onSetCaseField: (
    testId: string,
    caseId: string,
    field: string,
    value: string,
  ) => Promise<boolean>;
  onLabelsChanged: () => void;
  sort: RunnerSort;
  onSortChange: (s: RunnerSort) => void;
  filters: Partial<Record<RunnerFilterKey, string>>;
  onSetFilter: (key: RunnerFilterKey, value: string | undefined) => void;
  onClearFilters: () => void;
  // Activity
  activity: RunActivity | undefined;
  activityLoading: boolean;
}

export function RunTabPanels({
  tab,
  projectId,
  runId,
  run,
  tests,
  testsTotal,
  testsLoading,
  activeTestId,
  onOpenDetail,
  statuses,
  members,
  onSetStatus,
  onReassign,
  onSetCaseField,
  onLabelsChanged,
  sort,
  onSortChange,
  filters,
  onSetFilter,
  onClearFilters,
  activity,
  activityLoading,
}: RunTabPanelsProps) {
  if (tab === "tests") {
    return (
      <TestsTab
        runId={runId}
        projectId={projectId}
        tests={tests}
        testsTotal={testsTotal}
        testsLoading={testsLoading}
        activeTestId={activeTestId}
        onOpenDetail={onOpenDetail}
        statuses={statuses}
        members={members}
        readOnly={run?.state === "closed"}
        onSetStatus={onSetStatus}
        onReassign={onReassign}
        onSetCaseField={onSetCaseField}
        onLabelsChanged={onLabelsChanged}
        sort={sort}
        onSortChange={onSortChange}
        filters={filters}
        onSetFilter={onSetFilter}
        onClearFilters={onClearFilters}
        onBulkDone={onLabelsChanged}
      />
    );
  }

  if (tab === "activity") {
    return (
      <div className="min-h-0 flex-1 overflow-auto">
        <RunActivityPane data={activity} loading={activityLoading} />
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <RunProgressPane
        counts={(run?.counts ?? {}) as StatusCounts}
        state={run?.state ?? "open"}
        testCount={testsTotal}
      />
    </div>
  );
}
