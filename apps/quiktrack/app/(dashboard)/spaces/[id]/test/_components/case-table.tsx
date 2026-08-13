"use client";

import { EmptyState, TableSkeleton } from "@quikit/ui";
import { FileText } from "lucide-react";
import {
  APPROVAL_CLASS,
  PRIORITY_CLASS,
  caseRef,
  labelOf,
  type TestCaseRow,
} from "./case-meta";

/**
 * Right pane: the case list for the selected folder.
 *
 * Table chrome follows the repo's locked convention — `bg-accent-50` headers,
 * neutral row ids, `hover:bg-blue-50` rows — so it reads like every other table
 * in the app rather than a bespoke surface.
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
}

export function CaseTable({
  rows,
  loading,
  total,
  onOpen,
  onCreate,
  canCreate,
  sectionName,
}: CaseTableProps) {
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
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0">
            <tr className="text-left">
              <th className="bg-accent-50 px-4 py-2 font-medium text-gray-700">ID</th>
              <th className="bg-accent-50 px-4 py-2 font-medium text-gray-700">Title</th>
              <th className="bg-accent-50 px-4 py-2 font-medium text-gray-700">Priority</th>
              <th className="bg-accent-50 px-4 py-2 font-medium text-gray-700">Type</th>
              <th className="bg-accent-50 px-4 py-2 font-medium text-gray-700">Automation</th>
              <th className="bg-accent-50 px-4 py-2 font-medium text-gray-700">Status</th>
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
                <td className="whitespace-nowrap px-4 py-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                      PRIORITY_CLASS[row.priority] ?? "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {labelOf(row.priority)}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-gray-500">
                  {labelOf(row.type)}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-gray-500">
                  {row.automationStatus === "AUTOMATED" ? (
                    <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                      Automated
                    </span>
                  ) : (
                    <span className="text-gray-400">Manual</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      APPROVAL_CLASS[row.approvalState] ?? "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {labelOf(row.approvalState)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
