"use client";

import type { SelectOption } from "@quikit/ui";
import { formatEstimate } from "@/lib/test/estimate";
import {
  APPROVAL_CLASS,
  APPROVAL_OPTIONS,
  AUTOMATION_OPTIONS,
  PRIORITY_CLASS,
  PRIORITY_DOT,
  PRIORITY_OPTIONS,
  TYPE_OPTIONS,
  labelOf,
  type CaseColumnKey,
  type TestCaseRow,
} from "./case-meta";
import { InlineSelect } from "./inline-cell";
import type { InlinePatch } from "./inline-cell-types";

/**
 * One optional cell of the case list (QUIKTR-335).
 *
 * Split from `case-table.tsx` so the table stays about layout and the 300-line
 * ceiling isn't breached by nine column bodies.
 */

const TD = "whitespace-nowrap px-4 py-2";

/** Pills, extracted so the editable and read-only paths render identically. */
const priorityPill = (v: string) => (
  <span
    className={`rounded px-1.5 py-0.5 text-xs font-medium ${
      PRIORITY_CLASS[v] ?? "bg-gray-100 text-gray-600"
    }`}
  >
    {labelOf(v)}
  </span>
);

const approvalPill = (v: string) => (
  <span
    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
      APPROVAL_CLASS[v] ?? "bg-gray-100 text-gray-600"
    }`}
  >
    {labelOf(v)}
  </span>
);

const automationPill = (v: string) =>
  v === "AUTOMATED" ? (
    <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">
      Automated
    </span>
  ) : (
    <span className="text-gray-400">Manual</span>
  );

export function CaseCell({
  column,
  row,
  meanMs,
  onInlineEdit,
}: {
  column: CaseColumnKey;
  row: TestCaseRow;
  /** Mean of known estimates in this list, for the Forecast column. */
  meanMs: number | null;
  /** Omit to render read-only — no dropdown affordances for a viewer. */
  onInlineEdit?: (caseId: string, patch: InlinePatch) => Promise<boolean>;
}) {
  /** Wraps a pill in an inline dropdown when editing is allowed. */
  const editable = (
    value: string,
    options: SelectOption[],
    render: (v: string) => React.ReactNode,
    field: keyof InlinePatch,
    colors?: Record<string, string>,
  ) =>
    onInlineEdit ? (
      <InlineSelect
        value={value}
        options={options.map((o) => ({
          value: o.value,
          label: o.label,
          color: colors?.[o.value],
        }))}
        render={render}
        onSave={(next) => onInlineEdit(row.id, { [field]: next })}
      />
    ) : (
      render(value)
    );

  switch (column) {
    case "priority":
      return (
        <td className={TD}>
          {editable(
            row.priority,
            PRIORITY_OPTIONS,
            priorityPill,
            "priority",
            PRIORITY_DOT,
          )}
        </td>
      );

    case "type":
      return (
        <td className={`${TD} text-gray-500`}>
          {editable(
            row.type,
            TYPE_OPTIONS,
            (v) => <span>{labelOf(v)}</span>,
            "type",
          )}
        </td>
      );

    case "automation":
      return (
        <td className={`${TD} text-gray-500`}>
          {editable(
            row.automationStatus,
            AUTOMATION_OPTIONS,
            automationPill,
            "automationStatus",
          )}
        </td>
      );

    case "approval":
      return (
        <td className={TD}>
          {editable(
            row.approvalState,
            APPROVAL_OPTIONS,
            approvalPill,
            "approvalState",
          )}
        </td>
      );

    case "estimate":
      return (
        <td className={`${TD} text-gray-600`}>
          {formatEstimate(row.estimateMs) || <span className="text-gray-300">—</span>}
        </td>
      );

    case "forecast":
      // A case with its own estimate forecasts to exactly that. Without one it
      // borrows the list mean, shown in italics so an extrapolated number is
      // never mistaken for something a person entered.
      return (
        <td className={`${TD} text-gray-600`}>
          {row.estimateMs && row.estimateMs > 0 ? (
            formatEstimate(row.estimateMs)
          ) : meanMs ? (
            <span className="italic text-gray-400" title="Estimated from the average of cases that have an estimate">
              ~{formatEstimate(Math.round(meanMs))}
            </span>
          ) : (
            <span className="text-gray-300">—</span>
          )}
        </td>
      );

    case "labels":
      return (
        <td className="px-4 py-2">
          {row.labels.length === 0 ? (
            <span className="text-gray-300">—</span>
          ) : (
            <span className="flex flex-wrap gap-1">
              {row.labels.map((l) => (
                <span
                  key={l.id}
                  className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600"
                  style={
                    l.color
                      ? { backgroundColor: `${l.color}20`, color: l.color }
                      : undefined
                  }
                >
                  {l.name}
                </span>
              ))}
            </span>
          )}
        </td>
      );

    case "references":
      return (
        <td className="max-w-[14rem] truncate px-4 py-2 text-gray-500" title={row.refTickets ?? ""}>
          {row.refTickets || <span className="text-gray-300">—</span>}
        </td>
      );

    case "updated":
      return (
        <td className={`${TD} text-gray-500`}>
          {new Date(row.updatedAt).toLocaleDateString()}
        </td>
      );

    default: {
      // Exhaustiveness guard: adding a column key without a cell body becomes a
      // compile error rather than a blank column at runtime.
      const never: never = column;
      return never;
    }
  }
}
