"use client";

import { useMemo } from "react";
import { EmptyState, TableSkeleton } from "@quikit/ui";
import { FileText } from "lucide-react";
import { forecastMs, formatEstimate } from "@/lib/test/estimate";
import {
  CASE_COLUMNS,
  caseRef,
  type CaseColumnKey,
  type TestCaseRow,
} from "./case-meta";
import { CaseCell } from "./case-row-cells";
import { ColumnsMenu } from "./columns-menu";

/**
 * Right pane: the case list for the selected folder.
 *
 * Table chrome follows the repo's locked convention — `bg-accent-50` headers,
 * neutral row ids, `hover:bg-blue-50` rows — so it reads like every other table
 * in the app rather than a bespoke surface.
 *
 * Which optional columns show is a per-person, per-project preference owned by
 * `ColumnsMenu` (QUIKTR-335). ID and Title are structural and always rendered.
 */

interface CaseTableProps {
  rows: TestCaseRow[];
  loading: boolean;
  total: number;
  onOpen: (caseId: string) => void;
  onCreate: () => void;
  canCreate: boolean;
  /** Null when viewing the whole suite. */
  sectionName: string | null;
  projectId: string;
  columns: CaseColumnKey[];
  onColumns: (next: CaseColumnKey[]) => void;
}

export function CaseTable({
  rows,
  loading,
  total,
  onOpen,
  onCreate,
  canCreate,
  sectionName,
  projectId,
  columns,
  onColumns,
}: CaseTableProps) {
  // Forecast over the rows on screen. Stated as such in the footer: it covers
  // this page, not the whole suite, and saying "suite forecast" over a paginated
  // list would be a plain lie.
  const forecast = useMemo(
    () => forecastMs(rows.map((r) => r.estimateMs)),
    [rows],
  );
  const meanMs =
    forecast.knownCount > 0
      ? rows.reduce((s, r) => s + (r.estimateMs && r.estimateMs > 0 ? r.estimateMs : 0), 0) /
        forecast.knownCount
      : null;

  const shown = CASE_COLUMNS.filter((c) => columns.includes(c.key));

  if (loading) {
    return (
      <div className="p-4">
        <TableSkeleton rows={6} />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="p-8">
        <EmptyState
          icon={FileText}
          title="No test cases here"
          message={
            canCreate
              ? "Add a case to describe what should be tested, then run it from a test run."
              : "No cases have been added to this folder yet."
          }
          action={
            canCreate ? { label: "New test case", onClick: onCreate } : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-gray-900">
          {sectionName ?? "All cases in suite"}
          <span className="ml-2 font-normal text-gray-400">
            {total} {total === 1 ? "case" : "cases"}
          </span>
        </h2>
        <ColumnsMenu
          projectId={projectId}
          visible={columns}
          onChange={onColumns}
        />
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0">
            <tr className="text-left">
              <th className="bg-accent-50 px-4 py-2 font-medium text-gray-700">ID</th>
              <th className="bg-accent-50 px-4 py-2 font-medium text-gray-700">Title</th>
              {shown.map((c) => (
                <th
                  key={c.key}
                  className="bg-accent-50 px-4 py-2 font-medium text-gray-700"
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer border-b border-gray-100 hover:bg-blue-50"
                onClick={() => onOpen(row.id)}
              >
                <td className="whitespace-nowrap px-4 py-2 text-gray-900">
                  {caseRef(row.refId)}
                </td>
                <td className="px-4 py-2">
                  <span className="text-gray-900 hover:underline">{row.title}</span>
                  {row.currentVersion > 1 && (
                    <span className="ml-2 text-[11px] text-gray-400">
                      v{row.currentVersion}
                    </span>
                  )}
                </td>
                {shown.map((c) => (
                  <CaseCell key={c.key} column={c.key} row={row} meanMs={meanMs} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {columns.includes("forecast") && (
        <div className="border-t border-gray-200 px-4 py-2 text-xs text-gray-500">
          {forecast.estimated ? (
            <>
              Forecast for these {rows.length}{" "}
              {rows.length === 1 ? "case" : "cases"}:{" "}
              <span className="font-medium text-gray-700">
                {formatEstimate(forecast.totalMs)}
              </span>
              {forecast.extrapolated && (
                <>
                  {" "}
                  — {forecast.unknownCount} without an estimate, filled in from
                  the average of the {forecast.knownCount} that have one.
                </>
              )}
            </>
          ) : (
            <>No case here has an estimate, so there is nothing to forecast from.</>
          )}
        </div>
      )}
    </div>
  );
}
