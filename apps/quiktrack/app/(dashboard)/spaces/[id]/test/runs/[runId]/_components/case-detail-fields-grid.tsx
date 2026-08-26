"use client";

import {
  labelOf,
  PRIORITY_CLASS,
  PRIORITY_DOT,
  PRIORITY_OPTIONS,
  TYPE_OPTIONS,
} from "../../../_components/case-meta";
import { InlineSelect } from "../../../_components/inline-cell";
import type { MemberOption } from "../../../_components/use-project-members";
import { AssigneePicker } from "./assignee-picker";
import type { TestDetail, TestStatusLite } from "./runner-types";

/**
 * The compact TYPE/PRIORITY/STATUS/ASSIGNED TO field grid in the detail panel.
 * Split from `case-detail-pane.tsx`, which passed the 300-line ceiling in
 * apps/quiktrack/CLAUDE.md once every field became editable (QUIKTR-341).
 *
 * Type/Priority route through `onSetField` (the case's inline-edit endpoint —
 * same one the grid's own Priority column uses, and just as deliberately
 * non-versioning). Status routes through `onSetStatus` (a new QtTestResult,
 * same as the grid's Status column). Both are the SAME inline-dropdown pattern
 * the grid already uses, so a change from either surface is indistinguishable
 * to the server.
 */

const priorityPill = (v: string) => (
  <span
    className={`rounded px-1.5 py-0.5 text-xs font-medium ${
      PRIORITY_CLASS[v] ?? "bg-gray-100 text-gray-600"
    }`}
  >
    {labelOf(v)}
  </span>
);

function statusPill(status: TestStatusLite) {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `${status.color}1a`, color: status.color }}
    >
      {status.label}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </div>
      <div className="mt-0.5 text-sm text-gray-800">{children}</div>
    </div>
  );
}

export function CaseDetailFieldsGrid({
  detail,
  members,
  onReassign,
  assignDisabled,
  onSetField,
  onSetStatus,
  statuses,
  canEditField,
  canEditStatus,
}: {
  detail: TestDetail;
  members?: MemberOption[];
  onReassign?: (userId: string | null) => Promise<void> | void;
  assignDisabled?: boolean;
  onSetField?: (field: string, value: string) => Promise<boolean>;
  onSetStatus?: (statusId: string) => Promise<boolean>;
  statuses?: TestStatusLite[];
  canEditField: boolean;
  canEditStatus: boolean;
}) {
  const isAutomated = detail.case.automationStatus === "AUTOMATED";
  const statusOptions = (statuses ?? []).map((s) => ({
    value: s.id,
    label: s.label,
    color: s.color,
  }));

  return (
    <div className="mt-4 grid grid-cols-2 gap-3">
      <Field label="Type">
        {canEditField ? (
          <InlineSelect
            value={detail.case.type}
            options={TYPE_OPTIONS}
            render={(v) => <span>{labelOf(v)}</span>}
            onSave={(next) => onSetField!("type", next)}
          />
        ) : (
          labelOf(detail.case.type)
        )}
      </Field>

      <Field label="Priority">
        {canEditField ? (
          <InlineSelect
            value={detail.case.priority}
            options={PRIORITY_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
              color: PRIORITY_DOT[o.value],
            }))}
            render={priorityPill}
            onSave={(next) => onSetField!("priority", next)}
          />
        ) : (
          priorityPill(detail.case.priority)
        )}
      </Field>

      <Field label="Status">
        {canEditStatus ? (
          <InlineSelect
            value={detail.currentStatus.id}
            options={statusOptions}
            render={() => statusPill(detail.currentStatus)}
            onSave={(next) => onSetStatus!(next)}
          />
        ) : (
          statusPill(detail.currentStatus)
        )}
      </Field>

      <Field label="Assigned to">
        {/* QUIKTR-317 — per-test assignment lives with the test's own
            metadata: whoever records a result is not necessarily the
            assignee. */}
        {onReassign ? (
          <AssigneePicker
            currentId={detail.assigneeId ?? null}
            members={members ?? []}
            onChange={onReassign}
            disabled={assignDisabled}
          />
        ) : (
          <span className="text-gray-500">
            {detail.assigneeId ? "Assigned" : "Unassigned"}
          </span>
        )}
      </Field>

      <Field label="Is automated">{isAutomated ? "Yes" : "No"}</Field>

      {isAutomated && (
        <Field label="Automation type">{detail.case.automationTool ?? "—"}</Field>
      )}
      {detail.case.automationId && (
        <Field label="Automation ID">
          <span className="font-mono text-xs">{detail.case.automationId}</span>
        </Field>
      )}
    </div>
  );
}
