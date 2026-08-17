"use client";

import type { MemberOption } from "./assignee-picker";
import { CaseDetailPane } from "./case-detail-pane";
import { ResultEntryPane } from "./result-entry-pane";
import { RunActivityPane } from "./run-activity-pane";
import { RunDefectsPane } from "./run-defects-pane";
import { RunProgressPane } from "./run-progress-pane";
import type { RunTab } from "./run-tabs";
import { TestListPane, type RunnerFilter } from "./test-list-pane";
import type { RunActivity } from "./run-activity-types";
import type {
  RunSummaryData,
  RunnerTest,
  TestDetail,
  TestStatusLite,
} from "./runner-types";
import type { StatusCounts } from "@/lib/test/statuses";

/**
 * Body of the run's sub-navigation (QUIKTR-339).
 *
 * Split from `runner-view.tsx`, which reached 331 lines once four tabs landed —
 * over the 300 ceiling in apps/quiktrack/CLAUDE.md. The view keeps the data and
 * handlers; this file only decides which pane is on screen.
 */

interface RunTabPanelsProps {
  tab: RunTab;
  projectId: string;
  run: RunSummaryData | undefined;
  // Tests tab
  tests: RunnerTest[];
  testsTotal: number;
  testsLoading: boolean;
  activeTestId: string | null;
  onSelectTest: (id: string) => void;
  filter: RunnerFilter;
  onFilterChange: (f: RunnerFilter) => void;
  assigneeName: (userId: string) => string;
  detail: TestDetail | null;
  detailLoading: boolean;
  statuses: TestStatusLite[];
  onSubmit: (input: { statusId: string; comment?: string }) => Promise<boolean>;
  submitting: boolean;
  onAdvance: () => void;
  members: MemberOption[];
  onReassign: (userId: string | null) => Promise<void>;
  // Activity / Defects
  activity: RunActivity | undefined;
  activityLoading: boolean;
}

export function RunTabPanels({
  tab,
  projectId,
  run,
  tests,
  testsTotal,
  testsLoading,
  activeTestId,
  onSelectTest,
  filter,
  onFilterChange,
  assigneeName,
  detail,
  detailLoading,
  statuses,
  onSubmit,
  submitting,
  onAdvance,
  members,
  onReassign,
  activity,
  activityLoading,
}: RunTabPanelsProps) {
  if (tab === "tests") {
    return (
      <div className="flex min-h-0 flex-1">
        <TestListPane
          tests={tests}
          total={testsTotal}
          activeTestId={activeTestId}
          onSelect={onSelectTest}
          filter={filter}
          onFilterChange={onFilterChange}
          loading={testsLoading}
          assigneeName={assigneeName}
        />
        <CaseDetailPane detail={detail} loading={detailLoading} />
        <ResultEntryPane
          detail={detail}
          statuses={statuses}
          onSubmit={onSubmit}
          submitting={submitting}
          onAdvance={onAdvance}
          members={members}
          onReassign={onReassign}
        />
      </div>
    );
  }

  if (tab === "activity") {
    return (
      <div className="min-h-0 flex-1 overflow-auto">
        <RunActivityPane data={activity} loading={activityLoading} />
      </div>
    );
  }

  if (tab === "progress") {
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

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <RunDefectsPane
        data={activity}
        loading={activityLoading}
        projectId={projectId}
      />
    </div>
  );
}
