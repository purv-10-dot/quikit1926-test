"use client";

import { useMemo } from "react";
import type { MemberOption } from "../../../_components/use-project-members";
import { RunnerBulkNotice } from "./runner-bulk-notice";
import { RunnerBulkBar } from "./runner-bulk-bar";
import { RunnerToolbar, type RunnerSort } from "./runner-toolbar";
import type { RunnerFilterKey } from "./runner-filters";
import { TestsGridPane } from "./tests-grid-pane";
import { useRunnerSelection } from "./use-runner-selection";
import type { RunnerTest, TestStatusLite } from "./runner-types";

/**
 * The Tests tab body (QUIKTR-341): Sort + Filter toolbar, the grid, and the
 * selection + bulk-actions bar. The detail pane is NOT rendered here — it now
 * lives in `runner-view.tsx` as a SEPARATE card beside the main one (the
 * reference UI frames them as two distinct bordered cards, not one column with
 * an inner divider), so it needs to be a sibling of this tab's card, not a
 * child of it.
 *
 * Extracted from `run-tab-panels.tsx` — that file dispatches between four tabs
 * and stays thin; this one owns everything specific to the grid, including
 * SELECTION STATE, which does not belong one level up where the other three
 * tabs have no use for it.
 */
export function TestsTab({
  runId,
  projectId,
  tests,
  testsTotal,
  testsLoading,
  activeTestId,
  onOpenDetail,
  statuses,
  members,
  readOnly,
  onSetStatus,
  onReassign,
  onSetCaseField,
  onLabelsChanged,
  sort,
  onSortChange,
  filters,
  onSetFilter,
  onClearFilters,
  onBulkDone,
}: {
  runId: string;
  projectId: string;
  tests: RunnerTest[];
  testsTotal: number;
  testsLoading: boolean;
  activeTestId: string | null;
  onOpenDetail: (id: string) => void;
  statuses: TestStatusLite[];
  members: MemberOption[];
  readOnly: boolean;
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
  onBulkDone: () => void;
}) {
  const visibleIds = useMemo(() => tests.map((t) => t.id), [tests]);
  const selection = useRunnerSelection({ runId, visibleIds, onDone: onBulkDone });

  // All labels currently visible in the grid, deduped — the bulk "Add Label"
  // picker's option list. Not every label in the project (that would need a
  // separate fetch); this is enough to re-apply a label already in use here,
  // and RunnerLabelCell's own per-row picker still reaches the full vocabulary
  // for creating a new one.
  const visibleLabels = useMemo(() => {
    const byId = new Map<string, RunnerTest["case"]["labels"][number]>();
    for (const t of tests) for (const l of t.case.labels) byId.set(l.id, l);
    return [...byId.values()];
  }, [tests]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RunnerToolbar
        sort={sort}
        onSortChange={onSortChange}
        filters={filters}
        onSetFilter={onSetFilter}
        onClearAll={onClearFilters}
        statuses={statuses}
        members={members}
        labels={visibleLabels}
      />

      <RunnerBulkBar
        count={selection.count}
        busy={selection.busy}
        statuses={statuses}
        members={members}
        labels={visibleLabels}
        onAssign={selection.assign}
        onSetStatus={selection.setStatus}
        onAddLabel={selection.addLabel}
        onRemove={selection.remove}
        onClear={selection.clear}
      />

      <RunnerBulkNotice
        notice={selection.notice}
        error={selection.error}
        onDismiss={selection.dismissNotice}
      />

      <TestsGridPane
        tests={tests}
        total={testsTotal}
        loading={testsLoading}
        projectId={projectId}
        statuses={statuses}
        members={members}
        activeTestId={activeTestId}
        onOpenDetail={onOpenDetail}
        readOnly={readOnly}
        onSetStatus={onSetStatus}
        onReassign={onReassign}
        onSetCaseField={onSetCaseField}
        onLabelsChanged={onLabelsChanged}
        selection={
          readOnly
            ? undefined
            : {
                selectedIds: selection.selectedIds,
                allSelected: selection.allSelected,
                someSelected: selection.someSelected,
                onToggle: selection.toggle,
                onToggleAll: selection.toggleAll,
              }
        }
      />
    </div>
  );
}
