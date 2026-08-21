"use client";

import { Check } from "lucide-react";
import { caseRef, labelOf, PRIORITY_CLASS, PRIORITY_DOT, PRIORITY_OPTIONS } from "../../../_components/case-meta";
import { InlineSelect } from "../../../_components/inline-cell";
import type { MemberOption } from "../../../_components/use-project-members";
import { TriCheckbox } from "../../_components/tri-checkbox";
import { AssigneePicker } from "./assignee-picker";
import { RunnerLabelCell } from "./runner-label-cell";
import { testRef, type RunnerTest, type TestStatusLite } from "./runner-types";

/**
 * One row of the runner grid. Split from `tests-grid-pane.tsx`, which passed the
 * 300-line ceiling in apps/quiktrack/CLAUDE.md once checkboxes and section
 * grouping landed alongside the four editable columns.
 */

export const priorityPill = (v: string) => (
  <span
    className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
      PRIORITY_CLASS[v] ?? "bg-gray-100 text-gray-600"
    }`}
  >
    {labelOf(v)}
  </span>
);

/**
 * Compact status pill (QUIKTR-341 restyle) — a soft-tinted chip with the
 * status's own colour, plus a check glyph for the "passed" family so a scan
 * down the column reads the same way the ✓/✕ columns do elsewhere in the app.
 * "Untested" and every other status render as plain text-only pills.
 */
export function statusPill(status: TestStatusLite) {
  const isPassed = status.key === "passed" || status.key === "automation_passed";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `${status.color}1a`, color: status.color }}
    >
      {isPassed && <Check className="h-3 w-3" />}
      {status.label}
    </span>
  );
}

export function RunnerGridRow({
  test,
  active,
  projectId,
  statusOptions,
  members,
  readOnly,
  selectable,
  selected,
  onToggleSelect,
  onOpenDetail,
  onSetStatus,
  onReassign,
  onSetCaseField,
  onLabelsChanged,
}: {
  test: RunnerTest;
  active: boolean;
  projectId: string;
  statusOptions: Array<{ value: string; label: string; color: string }>;
  members: MemberOption[];
  readOnly: boolean;
  /** False hides the checkbox column entirely — a read-only viewer gets none. */
  selectable: boolean;
  selected: boolean;
  onToggleSelect: (id: string, on: boolean) => void;
  onOpenDetail: (testId: string) => void;
  onSetStatus: (testId: string, statusId: string) => Promise<boolean>;
  onReassign: (testId: string, userId: string | null) => Promise<void>;
  onSetCaseField: (
    testId: string,
    caseId: string,
    field: string,
    value: string,
  ) => Promise<boolean>;
  onLabelsChanged: () => void;
}) {
  const t = test;
  return (
    <tr
      onClick={() => onOpenDetail(t.id)}
      className={`cursor-pointer border-b border-gray-100 ${
        active ? "bg-blue-50 dark:bg-blue-900/30" : "hover:bg-gray-50 dark:hover:bg-gray-800"
      }`}
    >
      {selectable && (
        <td className="w-9 px-3 py-2" onClick={(e) => e.stopPropagation()}>
          <TriCheckbox
            checked={selected}
            onChange={(on) => onToggleSelect(t.id, on)}
            ariaLabel={`Select ${testRef(t.refId)}`}
          />
        </td>
      )}
      <td className="whitespace-nowrap px-3 py-2 text-gray-500">{testRef(t.refId)}</td>
      <td className="px-3 py-2 text-gray-900">
        <span className="block max-w-xs truncate" title={t.case.title}>
          {t.case.title}
        </span>
        <span className="text-[11px] text-gray-400">
          {caseRef(t.case.refId)}
          {t.config ? ` · ${t.config.name}` : ""}
        </span>
      </td>
      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
        <RunnerLabelCell
          caseId={t.case.id}
          projectId={projectId}
          labels={t.case.labels}
          disabled={readOnly}
          onChanged={onLabelsChanged}
        />
      </td>
      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
        <AssigneePicker
          currentId={t.assigneeId}
          members={members}
          disabled={readOnly}
          onChange={(userId) => onReassign(t.id, userId)}
        />
      </td>
      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
        {readOnly ? (
          statusPill(t.currentStatus)
        ) : (
          <InlineSelect
            value={t.currentStatus.id}
            options={statusOptions}
            render={() => statusPill(t.currentStatus)}
            onSave={(next) => onSetStatus(t.id, next)}
          />
        )}
      </td>
      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
        {readOnly ? (
          priorityPill(t.case.priority)
        ) : (
          <InlineSelect
            value={t.case.priority}
            options={PRIORITY_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
              color: PRIORITY_DOT[o.value],
            }))}
            render={priorityPill}
            onSave={(next) => onSetCaseField(t.id, t.case.id, "priority", next)}
          />
        )}
      </td>
    </tr>
  );
}
