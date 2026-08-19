"use client";

import { formatEstimate } from "@/lib/test/estimate";
import {
  APPROVAL_CLASS,
  PRIORITY_CLASS,
  labelOf,
  type CaseColumnKey,
  type TestCaseRow,
} from "./case-meta";

/**
 * One optional cell of the case list (QUIKTR-335).
 *
 * Split from `case-table.tsx` so the table stays about layout and the 300-line
 * ceiling isn't breached by nine column bodies.
 */

const TD = "whitespace-nowrap px-4 py-2";

export function CaseCell({
  column,
  row,
  meanMs,
}: {
  column: CaseColumnKey;
  row: TestCaseRow;
  /** Mean of known estimates in this list, for the Forecast column. */
  meanMs: number | null;
}) {
  switch (column) {
    case "priority":
      return (
        <td className={TD}>
          <span
            className={`rounded px-1.5 py-0.5 text-xs font-medium ${
              PRIORITY_CLASS[row.priority] ?? "bg-gray-100 text-gray-600"
            }`}
          >
            {labelOf(row.priority)}
          </span>
        </td>
      );

    case "type":
      return <td className={`${TD} text-gray-500`}>{labelOf(row.type)}</td>;

    case "automation":
      return (
        <td className={`${TD} text-gray-500`}>
          {row.automationStatus === "AUTOMATED" ? (
            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">
              Automated
            </span>
          ) : (
            <span className="text-gray-400">Manual</span>
          )}
        </td>
      );

    case "approval":
      return (
        <td className={TD}>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              APPROVAL_CLASS[row.approvalState] ?? "bg-gray-100 text-gray-600"
            }`}
          >
            {labelOf(row.approvalState)}
          </span>
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
