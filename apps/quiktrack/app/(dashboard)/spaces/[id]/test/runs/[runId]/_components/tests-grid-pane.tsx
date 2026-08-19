"use client";

import { Fragment } from "react";
import { TriCheckbox } from "../../_components/tri-checkbox";
import type { MemberOption } from "../../../_components/use-project-members";
import { groupBySection } from "./runner-group";
import { RunnerGridRow } from "./runner-grid-row";
import { RunnerSectionHeader } from "./runner-section-header";
import type { RunnerTest, TestStatusLite } from "./runner-types";

/**
 * The runner's grid (QUIKTR-341) — replaces the old compact `TestListPane`.
 *
 * Matches the TestRail reference: ID / Title / Labels / Assigned To / Status /
 * Priority, grouped by the case's folder, with a checkbox column for bulk
 * actions. Status, Assigned To, Priority and Labels are all editable directly in
 * the row — no separate result-entry form. Picking a status records a result
 * immediately (no comment/elapsed time in this flow, by design: the point of a
 * grid is throughput, and a form-per-click defeats that).
 *
 * Clicking the ROW itself (not a dropdown cell or the checkbox) still opens the
 * existing `CaseDetailPane` on the right, unchanged.
 *
 * Priority and Labels are CASE properties (`QtTestCase.priority`,
 * `QtTestCaseTag`), so editing them here changes the case everywhere it appears,
 * not just in this run — same as the case repository's own inline-edit grid.
 * Status and Assigned To are per-test (`QtTest`), scoped to this run only.
 *
 * Row rendering lives in `runner-grid-row.tsx`, grouping logic in
 * `runner-group.ts` — split out to keep this file under the 300-line ceiling in
 * apps/quiktrack/CLAUDE.md.
 */

interface Selection {
  selectedIds: Set<string>;
  allSelected: boolean;
  someSelected: boolean;
  onToggle: (id: string, on: boolean) => void;
  onToggleAll: (on: boolean) => void;
}

interface TestsGridPaneProps {
  tests: RunnerTest[];
  total: number;
  loading: boolean;
  projectId: string;
  statuses: TestStatusLite[];
  members: MemberOption[];
  /** Row click (outside a dropdown cell) — opens CaseDetailPane. */
  onOpenDetail: (testId: string) => void;
  activeTestId: string | null;
  /** True on a closed run — every editable cell is disabled there. */
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
  /** Omit to hide the checkbox column — a read-only viewer gets no dead controls. */
  selection?: Selection;
}

export function TestsGridPane({
  tests,
  total,
  loading,
  projectId,
  statuses,
  members,
  onOpenDetail,
  activeTestId,
  readOnly,
  onSetStatus,
  onReassign,
  onSetCaseField,
  onLabelsChanged,
  selection,
}: TestsGridPaneProps) {
  const statusOptions = statuses.map((s) => ({ value: s.id, label: s.label, color: s.color }));
  const columnCount = selection ? 7 : 6;

  if (loading) {
    return <div className="flex-1 p-4 text-sm text-gray-400">Loading tests…</div>;
  }

  if (tests.length === 0) {
    return (
      <div className="flex-1 p-6 text-sm text-gray-500">
        No tests match this filter.
      </div>
    );
  }

  const groups = groupBySection(tests);

  return (
    <div className="min-w-0 flex-1 overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0">
          <tr className="text-left">
            {selection && (
              <th className="w-9 bg-accent-50 px-3 py-2">
                <TriCheckbox
                  checked={selection.allSelected}
                  indeterminate={selection.someSelected}
                  onChange={selection.onToggleAll}
                  ariaLabel="Select all tests on this page"
                />
              </th>
            )}
            <th className="bg-accent-50 px-3 py-2 font-medium text-gray-700">ID</th>
            <th className="bg-accent-50 px-3 py-2 font-medium text-gray-700">Title</th>
            <th className="bg-accent-50 px-3 py-2 font-medium text-gray-700">Labels</th>
            <th className="bg-accent-50 px-3 py-2 font-medium text-gray-700">Assigned To</th>
            <th className="bg-accent-50 px-3 py-2 font-medium text-gray-700">Status</th>
            <th className="bg-accent-50 px-3 py-2 font-medium text-gray-700">Priority</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <Fragment key={group.sectionId}>
              <RunnerSectionHeader
                name={group.sectionName}
                tests={group.tests}
                columnCount={columnCount}
              />
              {group.tests.map((t) => (
                <RunnerGridRow
                  key={t.id}
                  test={t}
                  active={t.id === activeTestId}
                  projectId={projectId}
                  statusOptions={statusOptions}
                  members={members}
                  readOnly={readOnly}
                  selectable={Boolean(selection)}
                  selected={selection?.selectedIds.has(t.id) ?? false}
                  onToggleSelect={selection?.onToggle ?? (() => undefined)}
                  onOpenDetail={onOpenDetail}
                  onSetStatus={onSetStatus}
                  onReassign={onReassign}
                  onSetCaseField={onSetCaseField}
                  onLabelsChanged={onLabelsChanged}
                />
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
      <p className="border-t border-gray-100 px-3 py-1.5 text-[11px] text-gray-400">
        {tests.length} of {total} shown
      </p>
    </div>
  );
}
